import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { readStructuredPostSchemaCapability } from '@/lib/structuredPostSchema';
import { db } from '@/lib/db';

/**
 * Qualified post views + privacy-safe post analytics telemetry.
 *
 * A card only becomes a view after the caller has kept it >=55% visible for
 * 900ms. The optional container lets us continue measuring dwell and video
 * retention for the same qualified session without changing the media player.
 */

const recorded = new Set<string>();
let viewTrackingDisabled = false;
let rpcAvailable: boolean | null = null;
let capabilityProbeInFlight = false;
let tableFallbackAvailable: boolean | null = null;
let analyticsRpcAvailable: boolean | null = null;

interface AnalyticsSessionState {
  key: string;
  postId: string;
  userId: string;
  sessionId: string;
  source: string;
  deviceType: string;
  container: HTMLElement | null;
  dwellMs: number;
  watchMs: number;
  maxPositionMs: number;
  mediaDurationMs: number | null;
  completed: boolean;
  engaged: boolean;
  profileClicked: boolean;
  visibleSince: number | null;
  playingSince: number | null;
  lastFlushAt: number;
  observer: IntersectionObserver | null;
  mutationObserver: MutationObserver | null;
  video: HTMLVideoElement | null;
  cleanupVideo: (() => void) | null;
}

const analyticsSessions = new Map<string, AnalyticsSessionState>();

function errorText(error: unknown): string {
  const value = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  } | null;

  return [value?.code, value?.message, value?.details, value?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isBlockedError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const text = errorText(error);

  return (
    code === '42501' ||
    code === 'PGRST205' ||
    code === 'PGRST301' ||
    text.includes('row-level security') ||
    text.includes('permission denied') ||
    text.includes('forbidden')
  );
}

function isMissingRpc(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const text = errorText(error);

  return (
    code === 'PGRST202' ||
    code === '42883' ||
    (text.includes('increment_post_views') &&
      (text.includes('schema cache') || text.includes('could not find the function')))
  );
}

function isMissingAnalyticsRpc(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const text = errorText(error);
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    (text.includes('track_post_analytics_session') &&
      (text.includes('schema cache') || text.includes('could not find the function')))
  );
}

function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  const key = 'alsamos:post-analytics-session';
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const created =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(key, created);
    return created;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function inferSource(): string {
  if (typeof window === 'undefined') return 'unknown';
  const path = window.location.pathname;
  if (path === '/home') return 'home';
  if (path.startsWith('/discover')) return 'discover';
  if (path.startsWith('/search')) return 'search';
  if (path.startsWith('/videos')) return 'videos';
  if (path === '/profile' || path.startsWith('/user/')) return 'profile';
  if (path.startsWith('/post/')) return 'permalink';
  if (path.startsWith('/messages')) return 'messages';
  return 'other';
}

function inferDeviceType(): string {
  if (typeof window === 'undefined') return 'unknown';
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1180) return 'tablet';
  return 'desktop';
}

function resolveAnalyticsContainer(
  postId: string,
  provided?: HTMLElement | null,
): HTMLElement | null {
  if (provided) return provided;
  if (typeof document === 'undefined') return null;

  // Home still uses its legacy inline PostCard while Profile uses the shared
  // FeedPostCard. PostExtras is common to both and exposes this marker, so the
  // qualified view callback can reliably recover the owning article without
  // coupling analytics to either renderer.
  const marker = document.querySelector<HTMLElement>(
    `[data-post-analytics-post-id="${postId}"]`,
  );
  return marker?.closest<HTMLElement>('article') ?? marker;
}

function checkpointDwell(state: AnalyticsSessionState, now = Date.now()) {
  if (state.visibleSince !== null) {
    state.dwellMs += Math.max(0, now - state.visibleSince);
    state.visibleSince = now;
  }
}

function checkpointWatch(state: AnalyticsSessionState, now = Date.now()) {
  if (state.playingSince !== null) {
    state.watchMs += Math.max(0, now - state.playingSince);
    state.playingSince = now;
  }
}

async function flushAnalytics(state: AnalyticsSessionState) {
  if (analyticsRpcAvailable === false) return;
  checkpointDwell(state);
  checkpointWatch(state);
  state.lastFlushAt = Date.now();

  try {
    const { error } = await db.rpc('track_post_analytics_session', {
      p_post_id: state.postId,
      p_session_id: state.sessionId,
      p_source: state.source,
      p_device_type: state.deviceType,
      p_dwell_ms: Math.round(state.dwellMs),
      p_watch_ms: Math.round(state.watchMs),
      p_max_position_ms: Math.round(state.maxPositionMs),
      p_media_duration_ms:
        state.mediaDurationMs === null ? null : Math.round(state.mediaDurationMs),
      p_completed: state.completed,
      p_engaged: state.engaged,
      p_profile_clicked: state.profileClicked,
    });

    if (!error) {
      analyticsRpcAvailable = true;
      return;
    }

    if (isMissingAnalyticsRpc(error) || isBlockedError(error)) {
      analyticsRpcAvailable = false;
    }
  } catch {
    // Analytics must never interrupt content consumption.
  }
}

function attachVideo(state: AnalyticsSessionState, video: HTMLVideoElement) {
  if (state.video === video) return;
  state.cleanupVideo?.();
  state.video = video;

  const syncMedia = () => {
    const duration = Number(video.duration);
    const current = Number(video.currentTime);
    if (Number.isFinite(duration) && duration > 0) {
      state.mediaDurationMs = Math.round(duration * 1000);
    }
    if (Number.isFinite(current) && current >= 0) {
      state.maxPositionMs = Math.max(state.maxPositionMs, Math.round(current * 1000));
      if (
        state.mediaDurationMs &&
        state.maxPositionMs >= state.mediaDurationMs * 0.95
      ) {
        state.completed = true;
      }
    }
  };

  const handlePlay = () => {
    syncMedia();
    if (state.visibleSince !== null && state.playingSince === null) {
      state.playingSince = Date.now();
    }
  };
  const handlePause = () => {
    checkpointWatch(state);
    state.playingSince = null;
    syncMedia();
    void flushAnalytics(state);
  };
  const handleEnded = () => {
    checkpointWatch(state);
    state.playingSince = null;
    state.completed = true;
    syncMedia();
    void flushAnalytics(state);
  };
  const handleTimeUpdate = () => {
    syncMedia();
    if (!video.paused && state.visibleSince !== null && state.playingSince === null) {
      state.playingSince = Date.now();
    }
    if (Date.now() - state.lastFlushAt >= 5000) {
      void flushAnalytics(state);
    }
  };
  const handleMetadata = () => syncMedia();

  video.addEventListener('play', handlePlay);
  video.addEventListener('pause', handlePause);
  video.addEventListener('ended', handleEnded);
  video.addEventListener('timeupdate', handleTimeUpdate);
  video.addEventListener('loadedmetadata', handleMetadata);
  syncMedia();

  state.cleanupVideo = () => {
    video.removeEventListener('play', handlePlay);
    video.removeEventListener('pause', handlePause);
    video.removeEventListener('ended', handleEnded);
    video.removeEventListener('timeupdate', handleTimeUpdate);
    video.removeEventListener('loadedmetadata', handleMetadata);
  };
}

function ensureAnalyticsSession(
  postId: string,
  userId: string,
  container?: HTMLElement | null,
): AnalyticsSessionState {
  const resolvedContainer = resolveAnalyticsContainer(postId, container);
  const key = `${userId}:${postId}`;
  const existing = analyticsSessions.get(key);
  if (existing) return existing;

  const state: AnalyticsSessionState = {
    key,
    postId,
    userId,
    sessionId: getSessionId(),
    source: inferSource(),
    deviceType: inferDeviceType(),
    container: resolvedContainer,
    dwellMs: 900,
    watchMs: 0,
    maxPositionMs: 0,
    mediaDurationMs: null,
    completed: false,
    engaged: false,
    profileClicked: false,
    visibleSince: Date.now(),
    playingSince: null,
    lastFlushAt: 0,
    observer: null,
    mutationObserver: null,
    video: null,
    cleanupVideo: null,
  };
  analyticsSessions.set(key, state);

  if (resolvedContainer) {
    if (typeof IntersectionObserver !== 'undefined') {
      state.observer = new IntersectionObserver(
        ([entry]) => {
          const visible = entry.isIntersecting && entry.intersectionRatio >= 0.55;
          if (visible) {
            if (state.visibleSince === null) state.visibleSince = Date.now();
            if (state.video && !state.video.paused && state.playingSince === null) {
              state.playingSince = Date.now();
            }
          } else {
            checkpointDwell(state);
            state.visibleSince = null;
            checkpointWatch(state);
            state.playingSince = null;
            void flushAnalytics(state);
          }
        },
        { threshold: [0, 0.55, 0.8] },
      );
      state.observer.observe(resolvedContainer);
    }

    const findVideo = () => {
      const video = resolvedContainer.querySelector('video');
      if (video instanceof HTMLVideoElement) attachVideo(state, video);
    };
    findVideo();

    if (typeof MutationObserver !== 'undefined') {
      state.mutationObserver = new MutationObserver(findVideo);
      state.mutationObserver.observe(resolvedContainer, { childList: true, subtree: true });
    }
  }

  void flushAnalytics(state);
  return state;
}

function markAnalyticsEngagement(
  userId: string,
  postId: string,
  kind: 'engagement' | 'profile_click' = 'engagement',
) {
  // Engagement enriches an already-qualified session; it never creates a view
  // on its own. This keeps source/retention denominators aligned with real views.
  const state = analyticsSessions.get(`${userId}:${postId}`);
  if (!state) return;
  state.engaged = true;
  if (kind === 'profile_click') state.profileClicked = true;
  void flushAnalytics(state);
}

export function usePostViews() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const recordView = useCallback(
    async (postId: string, container?: HTMLElement | null) => {
      if (!userId || !postId) return;

      // New analytics is independent of legacy post_views capability. This is
      // deliberately started before the old counter path so a missing legacy
      // RPC cannot disable premium telemetry once its migration is deployed.
      ensureAnalyticsSession(postId, userId, container);

      if (viewTrackingDisabled || readStructuredPostSchemaCapability() === 'missing') return;

      const key = userId + ':' + postId;
      if (recorded.has(key)) return;

      // Birinchi noma'lum capability probe davom etayotgan bo'lsa, qolgan
      // kartalar request yubormaydi. Keyingi scroll/mountlarda holat cache'dan olinadi.
      if (rpcAvailable === null && capabilityProbeInFlight) return;

      recorded.add(key);
      let ownsCapabilityProbe = false;

      try {
        if (rpcAvailable !== false) {
          if (rpcAvailable === null) {
            capabilityProbeInFlight = true;
            ownsCapabilityProbe = true;
          }

          const { error } = await db.rpc('increment_post_views', {
            post_id_param: postId,
          });

          if (!error) {
            rpcAvailable = true;
            return;
          }

          if (isMissingRpc(error)) {
            rpcAvailable = false;
          } else if (isBlockedError(error)) {
            viewTrackingDisabled = true;
            return;
          } else {
            return;
          }
        }

        if (tableFallbackAvailable === false) return;

        const { error: upsertError } = await supabase
          .from('post_views')
          .upsert({ post_id: postId, user_id: userId }, { onConflict: 'post_id,user_id' });

        if (!upsertError) {
          tableFallbackAvailable = true;
          return;
        }

        if (isBlockedError(upsertError) || isMissingRpc(upsertError)) {
          tableFallbackAvailable = false;
          viewTrackingDisabled = true;
        }
      } catch {
        // Ko'rish statistikasi kritik emas — jimgina o'tkazib yuboriladi.
      } finally {
        if (ownsCapabilityProbe) capabilityProbeInFlight = false;
      }
    },
    [userId],
  );

  const markEngaged = useCallback(
    (postId: string) => {
      if (!userId || !postId) return;
      markAnalyticsEngagement(userId, postId, 'engagement');
    },
    [userId],
  );

  const markProfileClick = useCallback(
    (postId: string) => {
      if (!userId || !postId) return;
      markAnalyticsEngagement(userId, postId, 'profile_click');
    },
    [userId],
  );

  return { recordView, markEngaged, markProfileClick };
}
