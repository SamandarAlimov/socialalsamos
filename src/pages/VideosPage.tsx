import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Gauge,
  Heart,
  ListVideo,
  Maximize2,
  MessageCircle,
  Minimize2,
  Music2,
  Pause,
  Play,
  Repeat2,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoCommentsSheet } from '@/components/VideoCommentsSheet';
import { PostLikesViewsDialog } from '@/components/PostLikesViewsDialog';
import { SharePostDialog } from '@/components/SharePostDialog';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { StoryStickerOverlay } from '@/components/stickers/StoryStickerOverlay';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { VideoScrubBar } from '@/components/video/VideoScrubBar';
import {
  VideoCollaboratorByline,
  VideoLikedByFollowing,
  useVideoSocialContext,
} from '@/components/video/VideoSocialContext';
import { VideoWatchPanel, type VideoPlaybackSnapshot } from '@/components/video/VideoWatchPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePinchZoom } from '@/hooks/usePinchZoom';
import { usePostViews } from '@/hooks/usePostViews';
import { useVideoHeatmap } from '@/hooks/useVideoHeatmap';
import { useVideoPosts, type VideoPost } from '@/hooks/useVideoPosts';
import { useVideoRecommendations } from '@/hooks/useVideoRecommendations';
import { useVideoSurfaceTap } from '@/hooks/useVideoSurfaceTap';
import { useVideoWatchTracker } from '@/hooks/useVideoWatchTracker';
import { cn } from '@/lib/utils';
import {
  getBrowserNavigationType,
  shouldShowVideoDeepLinkBack,
} from '@/lib/videoNavigation';
import {
  readVideosMutedPreference,
  writeVideosMutedPreference,
} from '@/lib/videoPlaybackPreference';
import {
  formatCompactNumber,
  formatMediaTime,
  resolveAspectKind,
} from '@/lib/videoFormat';
import { resolveTouchAxis, type TouchAxis } from '@/lib/touchGesture';

const HOLD_TO_SPEED_MS = 300;
const RENDER_WINDOW = 1;
const LOAD_MORE_THRESHOLD = 3;
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

type VideoRouteState = {
  videoFeedInternal?: boolean;
  fromVideos?: boolean;
  videoId?: string;
} & Record<string, unknown>;

interface VideoCardProps {
  video: VideoPost;
  isActive: boolean;
  resumePlayback?: VideoPlaybackSnapshot | null;
  onPlaybackChange: (playback: VideoPlaybackSnapshot) => void;
  onLike: () => void;
  onBookmark: () => void;
  onCommentClick: () => void;
  onShareClick: () => void;
  onLikesClick: () => void;
  onProfileClick: () => void;
  onWatchClick: (playback: VideoPlaybackSnapshot) => void;
  onFollow: () => void;
  currentUserId?: string | null;
  isMobile: boolean;
  globalMuted: boolean;
  onMuteToggle: () => void;
  keyboardEnabled: boolean;
}

function VideoCard({
  video,
  isActive,
  resumePlayback = null,
  onPlaybackChange,
  onLike,
  onBookmark,
  onCommentClick,
  onShareClick,
  onLikesClick,
  onProfileClick,
  onWatchClick,
  onFollow,
  currentUserId,
  isMobile,
  globalMuted,
  onMuteToggle,
  keyboardEnabled,
}: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);
  const userPausedRef = useRef(false);
  const likeBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surfacePointerRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const wasActiveRef = useRef(false);
  const resumeAppliedRef = useRef(false);
  const resumePlaybackRef = useRef<VideoPlaybackSnapshot | null>(resumePlayback);
  const zoom = usePinchZoom(2.5, 1, frameRef);

  resumePlaybackRef.current = resumePlayback;

  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayFeedback, setShowPlayFeedback] = useState(false);
  const [showLikeBurst, setShowLikeBurst] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [aspect, setAspect] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [isHolding, setIsHolding] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { t } = useTranslation();
  const { lightTap, mediumTap, successFeedback } = useHapticFeedback();
  const { recordView } = usePostViews();
  const { trackProgress, markCompleted, markSeek, finishWatch } = useVideoWatchTracker();
  const heatmap = useVideoHeatmap(video.id, 48, { enabled: isActive });
  const { acceptedCollaborators, likedByFollowing } = useVideoSocialContext(
    video.id,
    isActive,
    video.likes_count || 0,
  );

  const videoUrl = video.media_urls?.[0] || '';
  const posterUrl = video.media_urls?.[1];
  const aspectKind = resolveAspectKind(aspect);
  const isLandscape = aspectKind === 'landscape';
  const isSquareish = aspectKind === 'square';

  const attemptPlay = useCallback(() => {
    const el = videoRef.current;
    if (!el || !isActive || userPausedRef.current) return;
    el.muted = globalMuted;
    el.playbackRate = holdActiveRef.current ? 2 : speed;
    void el.play().catch(() => setIsPlaying(false));
  }, [globalMuted, isActive, speed]);

  const applyResumePlayback = useCallback((el: HTMLVideoElement) => {
    if (resumeAppliedRef.current) return;
    const playback = resumePlaybackRef.current;
    userPausedRef.current = playback?.paused ?? false;

    if (playback && Number.isFinite(playback.time)) {
      const durationLimit = Number.isFinite(el.duration) && el.duration > 0
        ? Math.max(0, el.duration - 0.05)
        : playback.time;
      const target = Math.min(Math.max(0, playback.time || 0), durationLimit);
      if (Math.abs(el.currentTime - target) > 0.08) el.currentTime = target;
      setCurrentTime(target);
    }
    resumeAppliedRef.current = true;
  }, []);

  useEffect(() => {
    const becameActive = isActive && !wasActiveRef.current;
    const becameInactive = !isActive && wasActiveRef.current;
    wasActiveRef.current = isActive;
    const el = videoRef.current;

    if (becameInactive) {
      if (el) {
        onPlaybackChange({
          time: Number.isFinite(el.currentTime) ? el.currentTime : currentTime,
          paused: userPausedRef.current,
        });
        el.pause();
        el.currentTime = 0;
      }
      userPausedRef.current = false;
      resumeAppliedRef.current = false;
      surfacePointerRef.current = null;
      setIsPlaying(false);
      setExpanded(false);
      zoom.resetZoom();
      finishWatch(video.id);
      return;
    }

    if (!becameActive) return;

    resumeAppliedRef.current = false;
    userPausedRef.current = resumePlaybackRef.current?.paused ?? false;
    if (el?.readyState && el.readyState >= 1) applyResumePlayback(el);
    recordView(video.id);

    if (!userPausedRef.current && (!resumePlaybackRef.current || el?.readyState && el.readyState >= 1)) {
      attemptPlay();
    } else if (userPausedRef.current) {
      el?.pause();
      setIsPlaying(false);
    }
  }, [applyResumePlayback, attemptPlay, currentTime, finishWatch, isActive, onPlaybackChange, recordView, video.id, zoom]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.muted = globalMuted;
    if (isActive && !userPausedRef.current) attemptPlay();
  }, [attemptPlay, globalMuted, isActive]);

  useEffect(() => {
    if (!isActive) return;

    const resume = () => {
      if (document.visibilityState === 'visible' && !userPausedRef.current) {
        attemptPlay();
      }
    };

    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', resume);
    };
  }, [attemptPlay, isActive]);

  useEffect(() => () => {
    finishWatch(video.id);
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (likeBurstTimerRef.current) clearTimeout(likeBurstTimerRef.current);
    if (playFlashTimerRef.current) clearTimeout(playFlashTimerRef.current);
  }, [finishWatch, video.id]);

  const flashPlayState = useCallback(() => {
    setShowPlayFeedback(true);
    if (playFlashTimerRef.current) clearTimeout(playFlashTimerRef.current);
    playFlashTimerRef.current = setTimeout(() => setShowPlayFeedback(false), 520);
  }, []);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    lightTap();

    if (el.paused || el.ended) {
      userPausedRef.current = false;
      if (el.ended) el.currentTime = 0;
      onPlaybackChange({ time: el.currentTime, paused: false });
      void el.play().catch(() => setIsPlaying(false));
    } else {
      userPausedRef.current = true;
      const time = el.currentTime;
      el.pause();
      onPlaybackChange({ time, paused: true });
    }
    flashPlayState();
  }, [flashPlayState, lightTap, onPlaybackChange]);

  const doubleTapLike = useCallback(() => {
    successFeedback();
    if (!video.is_liked) onLike();
    setShowLikeBurst(true);
    if (likeBurstTimerRef.current) clearTimeout(likeBurstTimerRef.current);
    likeBurstTimerRef.current = setTimeout(() => setShowLikeBurst(false), 700);
  }, [onLike, successFeedback, video.is_liked]);

  const tapIntent = useVideoSurfaceTap({
    onSingleTap: togglePlay,
    onDoubleTap: doubleTapLike,
  });

  const startHold = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      const el = videoRef.current;
      if (!el) return;
      tapIntent.clearPending();
      holdActiveRef.current = true;
      setIsHolding(true);
      el.playbackRate = 2;
      if (el.paused) {
        userPausedRef.current = false;
        onPlaybackChange({ time: el.currentTime, paused: false });
        void el.play().catch(() => setIsPlaying(false));
      }
      mediumTap();
    }, HOLD_TO_SPEED_MS);
  }, [mediumTap, onPlaybackChange, tapIntent]);

  const endHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (!holdActiveRef.current) return false;
    holdActiveRef.current = false;
    setIsHolding(false);
    if (videoRef.current) videoRef.current.playbackRate = speed;
    return true;
  }, [speed]);

  const cancelSurfacePointer = useCallback(() => {
    surfacePointerRef.current = null;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdActiveRef.current) endHold();
    tapIntent.clearPending();
  }, [endHold, tapIntent]);

  const handleSurfacePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    surfacePointerRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    startHold();
  }, [startHold]);

  const handleSurfacePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = surfacePointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId || pointer.moved) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) <= 12) return;

    pointer.moved = true;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdActiveRef.current) endHold();
    tapIntent.clearPending();
  }, [endHold, tapIntent]);

  const handleSurfacePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = surfacePointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    surfacePointerRef.current = null;
    const wasHold = endHold();
    if (!wasHold && !pointer.moved) tapIntent.registerTap(event.clientX, event.clientY);
  }, [endHold, tapIntent]);

  const handleSeek = useCallback((time: number) => {
    const el = videoRef.current;
    if (!el) return;
    markSeek(video.id);
    el.currentTime = time;
    setCurrentTime(time);
    onPlaybackChange({ time, paused: userPausedRef.current });
  }, [markSeek, onPlaybackChange, video.id]);

  const seekBy = useCallback((delta: number) => {
    const el = videoRef.current;
    if (!el || !Number.isFinite(el.duration)) return;
    markSeek(video.id);
    el.currentTime = Math.min(el.duration, Math.max(0, el.currentTime + delta));
    onPlaybackChange({ time: el.currentTime, paused: userPausedRef.current });
  }, [markSeek, onPlaybackChange, video.id]);

  const cycleSpeed = useCallback(() => {
    setSpeed((current) => {
      const index = PLAYBACK_RATES.indexOf(current as (typeof PLAYBACK_RATES)[number]);
      const next = PLAYBACK_RATES[(Math.max(index, 0) + 1) % PLAYBACK_RATES.length];
      if (videoRef.current && !holdActiveRef.current) videoRef.current.playbackRate = next;
      return next;
    });
    lightTap();
  }, [lightTap]);

  const toggleFullscreen = useCallback(() => {
    const node = frameRef.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void node.requestFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onFullscreen = () => setIsFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  useEffect(() => {
    if (!isActive || !keyboardEnabled) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select, button, a, [contenteditable="true"], [role="slider"]')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key.toLowerCase()) {
        case ' ':
        case 'k':
          event.preventDefault();
          togglePlay();
          break;
        case 'm':
          event.preventDefault();
          onMuteToggle();
          break;
        case 'j':
          event.preventDefault();
          seekBy(-10);
          break;
        case 'l':
          event.preventDefault();
          seekBy(10);
          break;
        case 'arrowleft':
          event.preventDefault();
          seekBy(-5);
          break;
        case 'arrowright':
          event.preventDefault();
          seekBy(5);
          break;
        case 'f':
          event.preventDefault();
          toggleFullscreen();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, keyboardEnabled, onMuteToggle, seekBy, toggleFullscreen, togglePlay]);

  const stopBubble = (event: React.SyntheticEvent) => event.stopPropagation();
  const collapseExpandedFromInfo = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!expanded) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, [role="button"]')) return;
    event.stopPropagation();
    setExpanded(false);
  }, [expanded]);

  return (
    <div className="relative flex h-full w-full snap-start snap-always select-none items-center justify-center bg-black">
      <div
        ref={frameRef}
        className={cn(
          'relative select-none overflow-hidden bg-black [-webkit-touch-callout:none]',
          isMobile
            ? 'h-full w-full'
            : cn(
                'shadow-2xl ring-1 ring-white/10',
                isLandscape
                  ? 'aspect-video w-[min(1120px,calc(100vw-80px))] max-h-[calc(100dvh-32px)] rounded-2xl'
                  : isSquareish
                    ? 'aspect-square h-[min(82dvh,720px)] max-w-[min(720px,70vw)] rounded-2xl'
                    : 'aspect-[9/16] h-[calc(100dvh-28px)] max-h-[920px] w-auto max-w-[min(460px,42vw)] rounded-[22px]',
              ),
        )}
        style={{ touchAction: zoom.isZoomed ? 'none' : 'pan-y' }}
        onPointerDown={handleSurfacePointerDown}
        onPointerMove={handleSurfacePointerMove}
        onPointerUp={handleSurfacePointerUp}
        onPointerCancel={cancelSurfacePointer}
        onPointerLeave={cancelSurfacePointer}
        onWheel={zoom.handlers.onWheel}
        onTouchStart={(event) => {
          if (event.touches.length >= 2 || zoom.isZoomed) {
            event.stopPropagation();
            endHold();
          }
          zoom.handlers.onTouchStart(event);
        }}
        onTouchMove={(event) => {
          if (event.touches.length >= 2 || zoom.isZoomed) event.stopPropagation();
          zoom.handlers.onTouchMove(event);
        }}
        onTouchEnd={(event) => {
          // Single-finger taps belong to play/like. Only pass pinch/pan endings
          // into the zoom hook so its built-in double-tap zoom cannot steal them.
          if (zoom.isZoomed || event.touches.length > 0) {
            event.stopPropagation();
            zoom.handlers.onTouchEnd(event);
          }
        }}
      >
        {isMobile && aspect !== null && aspectKind !== 'portrait' && (
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {posterUrl ? (
              <img src={posterUrl} alt="" className="h-full w-full scale-110 object-cover opacity-45 blur-2xl" />
            ) : (
              <div className="h-full w-full bg-neutral-900" />
            )}
          </div>
        )}

        <video
          ref={videoRef}
          src={videoUrl}
          poster={posterUrl}
          className="absolute inset-0 h-full w-full select-none object-contain will-change-transform"
          style={{
            transform: `translate3d(${zoom.translateX}px, ${zoom.translateY}px, 0) scale(${zoom.scale})`,
            transformOrigin: 'center center',
          }}
          draggable={false}
          controls={false}
          disablePictureInPicture
          muted={globalMuted}
          playsInline
          preload={isActive ? 'auto' : 'metadata'}
          onContextMenu={(event) => event.preventDefault()}
          onDoubleClick={(event) => event.preventDefault()}
          onLoadedMetadata={(event) => {
            const el = event.currentTarget;
            if (el.videoWidth && el.videoHeight) setAspect(el.videoWidth / el.videoHeight);
            setDuration(Number.isFinite(el.duration) ? el.duration : 0);
            el.playbackRate = speed;
            el.muted = globalMuted;
            if (isActive) {
              applyResumePlayback(el);
              if (!userPausedRef.current) attemptPlay();
              else el.pause();
            }
          }}
          onCanPlay={() => {
            if (isActive && !userPausedRef.current) attemptPlay();
          }}
          onTimeUpdate={(event) => {
            const el = event.currentTarget;
            setCurrentTime(el.currentTime);
            if (el.buffered.length) setBuffered(el.buffered.end(el.buffered.length - 1));
            if (isActive) {
              trackProgress(video.id, el.currentTime, el.duration);
              onPlaybackChange({ time: el.currentTime, paused: userPausedRef.current });
            }
          }}
          onSeeking={() => markSeek(video.id)}
          onEnded={(event) => {
            markCompleted(video.id);
            const el = event.currentTarget;
            userPausedRef.current = false;
            setCurrentTime(0);
            onPlaybackChange({ time: 0, paused: false });
            if (isActive) {
              el.currentTime = 0;
              void el.play().catch(() => setIsPlaying(false));
            } else {
              setIsPlaying(false);
            }
          }}
          onPlay={(event) => {
            userPausedRef.current = false;
            setIsPlaying(true);
            if (isActive) onPlaybackChange({ time: event.currentTarget.currentTime, paused: false });
          }}
          onPause={() => setIsPlaying(false)}
        />

        <div className="absolute right-3 top-[max(12px,env(safe-area-inset-top))] z-[35] flex items-center gap-2" onPointerDown={stopBubble} onPointerUp={stopBubble}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              lightTap();
              const el = videoRef.current;
              const playback = {
                time: el && Number.isFinite(el.currentTime) ? el.currentTime : currentTime,
                paused: userPausedRef.current || Boolean(el?.paused),
              };
              onPlaybackChange(playback);
              onWatchClick(playback);
            }}
            aria-label="Kengaytirilgan ko‘rish"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-xl active:scale-90"
          >
            <ListVideo className="h-5 w-5" />
          </button>
          <button type="button" onClick={(event) => { event.stopPropagation(); onMuteToggle(); }} aria-label={globalMuted ? 'Ovozni yoqish' : 'Ovozni o‘chirish'} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-xl active:scale-90">
            {globalMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>

        {zoom.isZoomed && (
          <button type="button" data-video-interactive="true" onPointerDown={stopBubble} onPointerUp={stopBubble} onClick={(event) => { event.stopPropagation(); zoom.resetZoom(); }} className="absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur-xl">
            {zoom.scale.toFixed(1)}× · Reset
          </button>
        )}

        <div className={cn('pointer-events-none absolute inset-0 z-20 flex items-center justify-center transition-opacity', showPlayFeedback || (!isPlaying && isActive) ? 'opacity-100' : 'opacity-0')}>
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            {isPlaying ? <Pause className="h-10 w-10 text-white" /> : <Play className="ml-1 h-10 w-10 fill-white text-white" />}
          </div>
        </div>

        {showLikeBurst && (
          <div className="pointer-events-none absolute inset-0 z-[42] flex items-center justify-center">
            <Heart className="h-28 w-28 animate-[ping_.55s_ease-out_1] fill-white text-white drop-shadow-[0_8px_30px_rgba(0,0,0,.45)]" />
          </div>
        )}

        {isHolding && (
          <div className="pointer-events-none absolute left-1/2 top-[15%] z-30 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-xl">
            <span className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" />2x</span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/75" />
        <div className="pointer-events-none absolute inset-0 z-[15] [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_textarea]:pointer-events-auto">
          <StoryStickerOverlay postId={video.id} currentTime={currentTime} className="h-full w-full" />
        </div>

        <div className={cn('absolute inset-x-0 z-30 flex flex-col gap-2 px-3', isMobile ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+70px)]' : 'bottom-0 pb-3')}>
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1" onPointerDown={stopBubble} onPointerUp={stopBubble} onClick={collapseExpandedFromInfo}>
              <div className="mb-1.5 flex items-center gap-2.5">
                <StoryAvatar userId={video.profile?.id || video.user_id} username={video.profile?.username} displayName={video.profile?.display_name} avatarUrl={video.profile?.avatar_url} isVerified={!!video.profile?.is_verified} size="sm" showRing />
                <button type="button" onClick={(event) => { event.stopPropagation(); onProfileClick(); }} className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-white">@{video.profile?.username || 'user'}</span>
                  {video.profile?.is_verified && <VerifiedBadge size="xs" />}
                </button>
                {isActive && (
                  <VideoCollaboratorByline
                    collaborators={acceptedCollaborators}
                    className="max-w-[150px]"
                  />
                )}
                {video.user_id !== currentUserId && (
                  <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); onFollow(); }} className="ml-1 h-7 shrink-0 rounded-full border-white/50 bg-black/20 px-3 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/10 hover:text-white">
                    {video.is_following ? t('common.following', 'Following') : t('common.follow', 'Follow')}
                  </Button>
                )}
              </div>

              {video.content && (
                <div className="mb-2">
                  {expanded ? (
                    <div className="max-h-[32vh] overflow-y-auto whitespace-pre-wrap pr-1 text-[13px] leading-relaxed text-white">
                      {video.content}
                      <button type="button" onClick={(event) => { event.stopPropagation(); setExpanded(false); }} className="ml-2 text-xs font-semibold text-white/70">{t('common.less', 'less')}</button>
                    </div>
                  ) : (
                    <button type="button" onClick={(event) => { event.stopPropagation(); setExpanded(true); }} className="w-full text-left">
                      <p className="line-clamp-2 whitespace-pre-wrap break-words text-[13px] leading-snug text-white">{video.content}</p>
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 text-[12px] text-white">
                <Music2 className="h-3.5 w-3.5" />
                <span className="truncate">Original Sound · {video.profile?.display_name || video.profile?.username}</span>
              </div>

              {isActive && (
                <VideoLikedByFollowing
                  profiles={likedByFollowing}
                  likesCount={video.likes_count || 0}
                  onClick={onLikesClick}
                  className="mt-2"
                />
              )}
            </div>

            <div className="flex shrink-0 flex-col items-center gap-3" onPointerDown={stopBubble} onPointerUp={stopBubble}>
              <div className="flex flex-col items-center">
                <button type="button" onClick={(event) => { event.stopPropagation(); successFeedback(); onLike(); }} className="p-1.5 active:scale-90" aria-label="Like">
                  <Heart className={cn('h-7 w-7', video.is_liked ? 'fill-red-500 text-red-500' : 'text-white')} />
                </button>
                <button type="button" onClick={(event) => { event.stopPropagation(); onLikesClick(); }} className="text-[10px] font-semibold text-white">{formatCompactNumber(video.likes_count || 0)}</button>
              </div>
              <button type="button" onClick={(event) => { event.stopPropagation(); lightTap(); onCommentClick(); }} className="flex flex-col items-center p-1.5 text-white active:scale-90" aria-label="Comments">
                <MessageCircle className="h-7 w-7 -scale-x-100" /><span className="text-[10px] font-semibold">{formatCompactNumber(video.comments_count || 0)}</span>
              </button>
              <button type="button" onClick={(event) => { event.stopPropagation(); lightTap(); onShareClick(); }} className="p-1.5 text-white active:scale-90" aria-label="Share"><Send className="h-7 w-7" /></button>
              <button type="button" onClick={(event) => event.stopPropagation()} className="p-1.5 text-white active:scale-90" aria-label="Repost"><Repeat2 className="h-7 w-7" /></button>
              <button type="button" onClick={(event) => { event.stopPropagation(); lightTap(); onBookmark(); }} className="p-1.5 text-white active:scale-90" aria-label="Save"><Bookmark className={cn('h-7 w-7', video.is_bookmarked && 'fill-white')} /></button>
            </div>
          </div>

          <div onPointerDown={stopBubble} onPointerUp={stopBubble} onClick={stopBubble}>
            <VideoScrubBar src={videoUrl} duration={duration} currentTime={currentTime} bufferedSeconds={buffered} heatmap={heatmap} onSeek={handleSeek} enablePreview={duration > 0} />
            <div className="flex items-center gap-2 text-white">
              <span className="text-[11px] tabular-nums text-white/85">{formatMediaTime(currentTime)} / {formatMediaTime(duration)}</span>
              <div className="flex-1" />
              <button type="button" onClick={cycleSpeed} className="rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold ring-1 ring-white/15">{speed}x</button>
              <button type="button" onClick={toggleFullscreen} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/35 ring-1 ring-white/10" aria-label="Fullscreen">
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoPlaceholder({ video, isMobile }: { video: VideoPost; isMobile: boolean }) {
  const posterUrl = video.media_urls?.[1];
  return (
    <div className="relative flex h-full w-full snap-start snap-always items-center justify-center bg-black">
      <div className={cn('relative overflow-hidden bg-neutral-950', isMobile ? 'h-full w-full' : 'h-full w-full max-w-[400px] rounded-2xl')}>
        {posterUrl && <img src={posterUrl} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-55" />}
      </div>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Orqaga" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/10 backdrop-blur-md active:scale-90">
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}

function VideoSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      <div className={cn('relative h-full w-full', !isMobile && 'aspect-[9/16] max-w-[400px] overflow-hidden rounded-2xl')}>
        <Skeleton className="absolute inset-0 bg-muted/20" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-black px-8 text-center">
      <div><Play className="mx-auto mb-4 h-12 w-12 text-white/55" /><h3 className="text-lg font-semibold text-white">No videos yet</h3></div>
    </div>
  );
}

export default function VideosPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { videos, isLoading, hasMore, loadMore, likeVideo, toggleBookmark, toggleFollow } = useVideoPosts();
  const { feedVideos, rankForContext, isReady: recommendationReady } = useVideoRecommendations(videos);
  const rankedVideos = feedVideos;

  const initialVideoIdRef = useRef(searchParams.get('v') || searchParams.get('post') || searchParams.get('id'));
  const routeState = (location.state || {}) as VideoRouteState;
  const initialDeepLinkRef = useRef(
    shouldShowVideoDeepLinkBack(Boolean(initialVideoIdRef.current), getBrowserNavigationType()) &&
      !routeState.videoFeedInternal,
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareVideoId, setShareVideoId] = useState<string | null>(null);
  const [likesDialogOpen, setLikesDialogOpen] = useState(false);
  const [likesVideoId, setLikesVideoId] = useState<string | null>(null);
  const [watchVideoId, setWatchVideoId] = useState<string | null>(null);
  const [globalMuted, setGlobalMuted] = useState(readVideosMutedPreference);

  const containerRef = useRef<HTMLDivElement>(null);
  const playbackByVideoRef = useRef<Record<string, VideoPlaybackSnapshot>>({});
  const initialPositionedRef = useRef(false);
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const horizontalDelta = useRef(0);
  const touchAxisRef = useRef<TouchAxis>('unknown');
  const { mediumTap, lightTap } = useHapticFeedback();
  const isDeepLink = initialDeepLinkRef.current;

  const rememberPlayback = useCallback((videoId: string, playback: VideoPlaybackSnapshot) => {
    if (!videoId || !Number.isFinite(playback.time)) return;
    playbackByVideoRef.current[videoId] = {
      time: Math.max(0, playback.time),
      paused: playback.paused,
    };
  }, []);

  const openWatchPanel = useCallback((videoId: string, playback: VideoPlaybackSnapshot) => {
    rememberPlayback(videoId, playback);
    setWatchVideoId(videoId);
  }, [rememberPlayback]);

  useEffect(() => {
    writeVideosMutedPreference(globalMuted);
  }, [globalMuted]);

  useEffect(() => {
    if (initialPositionedRef.current || !initialVideoIdRef.current || rankedVideos.length === 0) return;
    const index = rankedVideos.findIndex((item) => item.id === initialVideoIdRef.current);
    if (index < 0) return;
    initialPositionedRef.current = true;
    setActiveIndex(index);
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (container) container.scrollTo({ top: index * container.clientHeight, behavior: 'auto' });
    });
  }, [rankedVideos]);

  useEffect(() => {
    const currentVideo = watchVideoId
      ? rankedVideos.find((item) => item.id === watchVideoId)
      : rankedVideos[activeIndex];
    if (!currentVideo?.id) return;

    const currentParam = searchParams.get('v') || searchParams.get('post') || searchParams.get('id');
    const canonical = currentParam === currentVideo.id && searchParams.get('v') === currentVideo.id && !searchParams.has('post') && !searchParams.has('id');
    const currentState = (location.state || {}) as VideoRouteState;
    if (canonical && currentState.videoFeedInternal) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('post');
    nextParams.delete('id');
    nextParams.set('v', currentVideo.id);

    navigate(
      { pathname: '/videos', search: `?${nextParams.toString()}` },
      {
        replace: true,
        state: { ...currentState, videoFeedInternal: true, videoId: currentVideo.id },
      },
    );
  }, [activeIndex, location.state, navigate, rankedVideos, searchParams, watchVideoId]);

  const handleBack = useCallback(() => {
    lightTap();
    if (window.history.length > 1) navigate(-1);
    else navigate('/discover');
  }, [lightTap, navigate]);

  useEffect(() => {
    if (!isDeepLink) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || commentsOpen || shareDialogOpen || likesDialogOpen || watchVideoId || document.fullscreenElement) return;
      handleBack();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commentsOpen, handleBack, isDeepLink, likesDialogOpen, shareDialogOpen, watchVideoId]);

  const openProfile = useCallback((video?: VideoPost | null) => {
    const username = video?.profile?.username;
    if (!username) return;
    lightTap();
    navigate(`/user/${username}`, {
      state: { fromVideos: true, videoId: video.id },
    });
  }, [lightTap, navigate]);

  const handleMuteToggle = useCallback(() => {
    setGlobalMuted((previous) => !previous);
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || container.clientHeight <= 0) return;
    const next = Math.round(container.scrollTop / container.clientHeight);
    if (next >= 0 && next < rankedVideos.length) {
      setActiveIndex((current) => {
        if (current === next) return current;
        mediumTap();
        return next;
      });
    }
  }, [mediumTap, rankedVideos.length]);

  useEffect(() => {
    if (isLoading || !hasMore || rankedVideos.length === 0) return;
    if (activeIndex >= rankedVideos.length - LOAD_MORE_THRESHOLD) void loadMore();
  }, [activeIndex, hasMore, isLoading, loadMore, rankedVideos.length]);

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    horizontalDelta.current = 0;
    touchAxisRef.current = 'unknown';
  }, []);

  const handleTouchMove = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartX.current;
    const dy = touch.clientY - touchStartY.current;
    if (touchAxisRef.current === 'unknown') {
      touchAxisRef.current = resolveTouchAxis(dx, dy, { threshold: 12, horizontalRatio: 1.35 });
    }
    if (touchAxisRef.current === 'horizontal') horizontalDelta.current = dx;
  }, []);

  const resetTouch = useCallback(() => {
    horizontalDelta.current = 0;
    touchAxisRef.current = 'unknown';
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchAxisRef.current !== 'horizontal') {
      resetTouch();
      return;
    }
    const dx = horizontalDelta.current;
    if (dx < -70) {
      const item = rankedVideos[activeIndex];
      resetTouch();
      openProfile(item);
      return;
    }
    if (isDeepLink && dx > 70) {
      resetTouch();
      handleBack();
      return;
    }
    resetTouch();
  }, [activeIndex, handleBack, isDeepLink, openProfile, rankedVideos, resetTouch]);

  const selectedVideo = rankedVideos.find((item) => item.id === selectedVideoId);
  const shareVideo = rankedVideos.find((item) => item.id === shareVideoId);
  const likesVideo = rankedVideos.find((item) => item.id === likesVideoId);

  const selectWatchVideo = useCallback((videoId: string, currentPlayback: VideoPlaybackSnapshot) => {
    if (watchVideoId) rememberPlayback(watchVideoId, currentPlayback);
    setWatchVideoId(videoId);
  }, [rememberPlayback, watchVideoId]);

  const closeWatchPanel = useCallback((currentPlayback: VideoPlaybackSnapshot) => {
    const currentWatchId = watchVideoId;
    if (currentWatchId) rememberPlayback(currentWatchId, currentPlayback);
    const index = rankedVideos.findIndex((item) => item.id === currentWatchId);
    setWatchVideoId(null);
    if (index >= 0) {
      setActiveIndex(index);
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (container) container.scrollTo({ top: index * container.clientHeight, behavior: 'auto' });
      });
    }
  }, [rankedVideos, rememberPlayback, watchVideoId]);

  const floatingBack = isDeepLink ? (
    <div className={cn('absolute left-3 z-50', isMobile ? 'top-[calc(env(safe-area-inset-top,0px)+12px)]' : 'top-4')}>
      <BackButton onClick={handleBack} />
    </div>
  ) : null;

  if (isLoading || !recommendationReady) {
    return <div className={cn('relative flex items-center justify-center bg-black', isMobile ? 'fixed inset-0 z-40' : 'h-screen w-full')}>{floatingBack}<VideoSkeleton isMobile={isMobile} /></div>;
  }

  if (rankedVideos.length === 0) {
    return <div className={cn('relative bg-black', isMobile ? 'fixed inset-0 z-40' : 'h-screen w-full')}>{floatingBack}<EmptyState /></div>;
  }

  return (
    <div className={cn('relative bg-black', isMobile ? 'fixed inset-0 z-40' : 'flex h-screen w-full items-center justify-center')}>
      {floatingBack}
      <div
        ref={containerRef}
        className={cn('h-full w-full snap-y snap-mandatory overflow-y-scroll overscroll-contain scrollbar-hide', !isMobile && commentsOpen && 'pr-[min(430px,38vw)]')}
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', scrollSnapType: 'y mandatory' }}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={resetTouch}
      >
        {rankedVideos.map((video, index) => {
          const isMounted = Math.abs(index - activeIndex) <= RENDER_WINDOW;
          return (
            <div key={video.id} className="flex h-full w-full items-center justify-center" style={{ scrollSnapAlign: 'start' }}>
              {isMounted ? (
                <VideoCard
                  video={video}
                  isActive={index === activeIndex && !watchVideoId}
                  resumePlayback={playbackByVideoRef.current[video.id] ?? null}
                  onPlaybackChange={(playback) => rememberPlayback(video.id, playback)}
                  onLike={() => likeVideo(video.id)}
                  onBookmark={() => toggleBookmark(video.id)}
                  onCommentClick={() => { setSelectedVideoId(video.id); setCommentsOpen(true); }}
                  onShareClick={() => { setShareVideoId(video.id); setShareDialogOpen(true); }}
                  onLikesClick={() => { setLikesVideoId(video.id); setLikesDialogOpen(true); }}
                  onProfileClick={() => openProfile(video)}
                  onWatchClick={(playback) => openWatchPanel(video.id, playback)}
                  onFollow={() => toggleFollow(video.user_id)}
                  currentUserId={user?.id}
                  isMobile={isMobile}
                  globalMuted={globalMuted}
                  onMuteToggle={handleMuteToggle}
                  keyboardEnabled={!commentsOpen && !shareDialogOpen && !likesDialogOpen && !watchVideoId}
                />
              ) : <VideoPlaceholder video={video} isMobile={isMobile} />}
            </div>
          );
        })}
      </div>

      {watchVideoId && (
        <VideoWatchPanel
          videos={rankForContext(watchVideoId)}
          activeVideoId={watchVideoId}
          initialPlayback={playbackByVideoRef.current[watchVideoId] ?? null}
          onSelectVideo={selectWatchVideo}
          onClose={closeWatchPanel}
          onPlaybackChange={rememberPlayback}
          onLike={likeVideo}
          onBookmark={toggleBookmark}
          onFollow={toggleFollow}
          currentUserId={user?.id}
          onShare={(item) => { setShareVideoId(item.id); setShareDialogOpen(true); }}
          onComments={(item) => { setSelectedVideoId(item.id); setCommentsOpen(true); }}
          onOpenProfile={openProfile}
          keyboardEnabled={!commentsOpen && !shareDialogOpen && !likesDialogOpen}
        />
      )}

      <VideoCommentsSheet isOpen={commentsOpen} onClose={() => setCommentsOpen(false)} postId={selectedVideoId || ''} commentsCount={selectedVideo?.comments_count || 0} />
      <SharePostDialog open={shareDialogOpen} onOpenChange={setShareDialogOpen} postId={shareVideoId || ''} postContent={shareVideo?.content || undefined} />
      <PostLikesViewsDialog postId={likesVideoId || ''} open={likesDialogOpen} onOpenChange={setLikesDialogOpen} likesCount={likesVideo?.likes_count || 0} viewsCount={likesVideo?.views_count || 0} />
    </div>
  );
}
