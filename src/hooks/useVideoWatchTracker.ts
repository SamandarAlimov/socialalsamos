import { useCallback, useEffect } from 'react';
import db from '@/lib/supabaseAny';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Video ko'rish vaqtini (watch-time) va videoning qaysi qismlari ko'rilganini
 * yig'ib, `record_video_watch` RPC si orqali bazaga yozadi.
 *
 * Nima uchun kerak:
 * - "Eng ko'p qayta ko'rilgan qism" (most replayed) grafigi haqiqiy
 *   ma'lumotdan chizilishi uchun (`video_watch_segments`).
 * - Retention va completion rate hisoblanishi uchun
 *   (`video_watch_sessions`).
 *
 * Muhim tafsilotlar:
 * - Sof ko'rish vaqti faqat kichik qadamlardan yig'iladi. Timelineni surganda
 *   (seek) yoki pauzadan keyin katta sakrash bo'lsa, u vaqt hisoblanmaydi.
 * - Har bir ko'rilgan nuqta 0..99 oralig'idagi bo'lakka (bucket) aylantiriladi.
 *   Bir bo'lak necha marta uchrasa, shuncha marta hisoblanadi - shuning uchun
 *   qayta-qayta ko'rilgan joy grafikda balandroq chiqadi.
 * - Jadval yoki RPC hali deploy qilinmagan bo'lsa, capability bir marta
 *   aniqlanadi va keyin so'rovlar butunlay to'xtaydi (request storm bo'lmaydi).
 */

const BUCKET_COUNT = 100;

/** Bir timeupdate qadami shu qiymatdan katta bo'lsa - bu sakrash, ko'rish emas. */
const MAX_STEP_SECONDS = 1.5;

/** Shundan kam ko'rilgan seans yozilmaydi. */
const MIN_WATCHED_SECONDS = 1.5;

/** Video oxirigacha ko'rilgan deb hisoblanadigan chegara. */
const COMPLETION_RATIO = 0.92;

type WatchSession = {
  postId: string;
  buckets: number[];
  watchedSeconds: number;
  durationSeconds: number | null;
  maxPositionSeconds: number;
  lastTime: number | null;
  completed: boolean;
  userId: string | null;
};

const sessions = new Map<string, WatchSession>();
let capability: 'unknown' | 'available' | 'missing' = 'unknown';

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

/** RPC/jadval hali mavjud emas yoki ruxsat yo'q - qayta urinmaymiz. */
function isUnavailableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const text = errorText(error);

  return (
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    code === 'PGRST301' ||
    code === '42883' ||
    code === '42P01' ||
    code === '42501' ||
    text.includes('could not find the function') ||
    text.includes('schema cache') ||
    text.includes('permission denied') ||
    text.includes('row-level security')
  );
}

function ensureSession(
  postId: string,
  durationSeconds: number | null,
  userId: string | null,
): WatchSession {
  const existing = sessions.get(postId);
  if (existing) {
    if (existing.durationSeconds === null && durationSeconds) {
      existing.durationSeconds = durationSeconds;
    }
    return existing;
  }

  const created: WatchSession = {
    postId,
    buckets: [],
    watchedSeconds: 0,
    durationSeconds,
    maxPositionSeconds: 0,
    lastTime: null,
    completed: false,
    userId,
  };

  sessions.set(postId, created);
  return created;
}

async function sendSession(session: WatchSession): Promise<void> {
  if (capability === 'missing') return;
  if (session.watchedSeconds < MIN_WATCHED_SECONDS) return;

  try {
    const { error } = await db.rpc('record_video_watch', {
      post_id_param: session.postId,
      buckets_param: session.buckets,
      watched_seconds_param: Math.round(session.watchedSeconds * 100) / 100,
      duration_seconds_param: session.durationSeconds,
      max_position_seconds_param: Math.round(session.maxPositionSeconds * 100) / 100,
      completed_param: session.completed,
    });

    if (error) {
      if (isUnavailableError(error)) capability = 'missing';
      return;
    }

    capability = 'available';

    if (session.userId) {
      const duration = session.durationSeconds ?? 0;
      const retention =
        duration > 0
          ? Math.min(2.5, session.watchedSeconds / duration)
          : Math.min(1.25, session.watchedSeconds / 30);

      let eventType = 'video_watch';
      let weight = 0.4;

      if (session.completed) {
        eventType = 'video_complete';
        weight = 6.4;
      } else if (retention >= 0.75) {
        eventType = 'video_high_retention';
        weight = 4.2;
      } else if (retention < 0.1 && session.watchedSeconds < 4.5) {
        eventType = 'video_quick_skip';
        weight = -3.4;
      } else if (retention < 0.2) {
        eventType = 'video_low_retention';
        weight = -1.8;
      } else if (retention >= 0.5) {
        weight = 2.7;
      } else if (retention >= 0.25) {
        weight = 1.1;
      }

      try {
        await db.from('recommendation_events').insert({
          user_id: session.userId,
          post_id: session.postId,
          event_type: eventType,
          source: 'videos',
          weight,
          dwell_ms: Math.round(session.watchedSeconds * 1000),
          metadata: {
            retention,
            watched_seconds: session.watchedSeconds,
            duration_seconds: session.durationSeconds,
            completed: session.completed,
          },
        });
      } catch {
        // Recommendation event stream optional; watch session is authoritative.
      }
    }
  } catch {
    // Statistika kritik emas - jimgina o'tkazib yuboriladi.
  }
}

function flushSession(postId: string): void {
  const session = sessions.get(postId);
  if (!session) return;

  sessions.delete(postId);
  void sendSession(session);
}

function flushAllSessions(): void {
  const pending = Array.from(sessions.keys());
  pending.forEach(flushSession);
}

export function useVideoWatchTracker() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  /**
   * `onTimeUpdate` da chaqiriladi. Ketma-ket kelgan kichik qadamlar sof
   * ko'rish vaqtiga qo'shiladi, sakrashlar esa faqat pozitsiyani yangilaydi.
   */
  const trackProgress = useCallback(
    (postId: string, currentTime: number, durationSeconds?: number | null) => {
      if (!postId || !Number.isFinite(currentTime) || currentTime < 0) return;
      if (capability === 'missing') return;

      const duration =
        durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0
          ? durationSeconds
          : null;

      const session = ensureSession(postId, duration, userId);
      const previous = session.lastTime;
      session.lastTime = currentTime;

      if (previous !== null) {
        const step = currentTime - previous;
        if (step > 0 && step <= MAX_STEP_SECONDS) {
          session.watchedSeconds += step;
        }
      }

      if (currentTime > session.maxPositionSeconds) {
        session.maxPositionSeconds = currentTime;
      }

      const total = session.durationSeconds;
      if (total) {
        const ratio = Math.min(0.999999, Math.max(0, currentTime / total));
        const bucket = Math.floor(ratio * BUCKET_COUNT);
        const lastBucket = session.buckets[session.buckets.length - 1];

        // Bir bo'lak ichida bir necha timeupdate keladi - faqat bo'lak
        // o'zgarganda yozamiz, aks holda massiv juda kattalashadi.
        if (bucket !== lastBucket) {
          session.buckets.push(bucket);
        }

        if (ratio >= COMPLETION_RATIO) {
          session.completed = true;
        }
      }
    },
    [userId],
  );

  /** Video oxiriga yetdi (`onEnded`). */
  const markCompleted = useCallback((postId: string) => {
    if (!postId || capability === 'missing') return;

    const session = sessions.get(postId);
    if (!session) return;

    session.completed = true;
    session.lastTime = null;
  }, []);

  /** Foydalanuvchi timelineni surdi - keyingi qadam sakrash deb qaralmaydi. */
  const markSeek = useCallback((postId: string) => {
    const session = sessions.get(postId);
    if (session) session.lastTime = null;
  }, []);

  /** Video almashdi / sahifadan chiqildi - seansni bazaga yuboramiz. */
  const finishWatch = useCallback((postId: string) => {
    if (!postId) return;
    flushSession(postId);
  }, []);

  useEffect(() => {
    const handleHide = () => {
      if (document.visibilityState === 'hidden') flushAllSessions();
    };

    document.addEventListener('visibilitychange', handleHide);
    window.addEventListener('pagehide', flushAllSessions);

    return () => {
      document.removeEventListener('visibilitychange', handleHide);
      window.removeEventListener('pagehide', flushAllSessions);
      flushAllSessions();
    };
  }, []);

  return { trackProgress, markCompleted, markSeek, finishWatch };
}
