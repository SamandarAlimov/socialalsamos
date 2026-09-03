import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Bookmark,
  Gauge,
  Maximize2,
  MessageCircle,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  Send,
  Heart,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { UI_LAYER } from '@/lib/uiLayers';
import { Button } from '@/components/ui/button';
import { VideoPost } from '@/hooks/useVideoPosts';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { VideoScrubBar } from '@/components/video/VideoScrubBar';
import { VideoUpNextItem } from '@/components/video/VideoUpNextItem';
import { useVideoHeatmap } from '@/hooks/useVideoHeatmap';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import {
  deriveVideoTitle,
  formatCompactNumber,
  formatMediaTime,
  resolveAspectKind,
} from '@/lib/videoFormat';

/**
 * YouTube uslubidagi "watch" ekrani.
 *
 * Mobile: yuqorida video, pastda boshqa videolar ro'yxati scroll qilinadi.
 * Desktop/tablet: chapda pleyer + ma'lumot, o'ngda "Keyingi videolar" ustuni
 * alohida scroll bo'ladi (aynan YouTube layouti).
 *
 * Ro'yxatdan boshqa video tanlansa — sahifadan chiqmasdan yuqoridagi pleyer
 * o'sha videoga almashadi.
 */

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** Bosib turish 2x tezlikka o'tishi uchun kerakli vaqt (ms). */
const HOLD_TO_SPEED_MS = 300;

export interface VideoWatchPanelProps {
  videos: VideoPost[];
  activeVideoId: string;
  onSelectVideo: (videoId: string) => void;
  onClose: () => void;
  onLike: (videoId: string) => void;
  onBookmark: (videoId: string) => void;
  onFollow: (userId: string) => void;
  currentUserId?: string | null;
  onShare: (video: VideoPost) => void;
  onComments: (video: VideoPost) => void;
  onOpenProfile: (video: VideoPost) => void;
  keyboardEnabled?: boolean;
}

export function VideoWatchPanel({
  videos,
  activeVideoId,
  onSelectVideo,
  onClose,
  onLike,
  onBookmark,
  onFollow,
  currentUserId,
  onShare,
  onComments,
  onOpenProfile,
  keyboardEnabled = true,
}: VideoWatchPanelProps) {
  const video = useMemo(
    () => videos.find((item) => item.id === activeVideoId),
    [videos, activeVideoId],
  );
  const upNext = useMemo(
    () => videos.filter((item) => item.id !== activeVideoId),
    [videos, activeVideoId],
  );
  const activeVideoIndex = useMemo(
    () => videos.findIndex((item) => item.id === activeVideoId),
    [videos, activeVideoId],
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);
  const justHeldRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [ratio, setRatio] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const [isHolding, setIsHolding] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [fitCover, setFitCover] = useState(false);

  const { lightTap, mediumTap } = useHapticFeedback();
  const heatmap = useVideoHeatmap(activeVideoId || 'video', 56);

  const videoUrl = video?.media_urls?.[0];
  const aspectKind = resolveAspectKind(ratio);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // Body scroll lock
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Video almashganda holatni tozalash
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setRatio(null);
    setDescOpen(false);
    setIsPlaying(true);
    revealControls();
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    const el = videoRef.current;
    if (el) {
      el.currentTime = 0;
      el.playbackRate = speed;
      el.play().catch(() => setIsPlaying(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVideoId]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
  }, []);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => undefined);
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
    lightTap();
    revealControls();
  }, [lightTap, revealControls]);

  /* Instagram / YouTube kabi: bosib turilsa 2x tezlik. */
  const startHold = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      const el = videoRef.current;
      if (!el) return;
      holdActiveRef.current = true;
      setIsHolding(true);
      el.playbackRate = 2;
      if (el.paused) {
        el.play().catch(() => undefined);
        setIsPlaying(true);
      }
      mediumTap();
    }, HOLD_TO_SPEED_MS);
  }, [mediumTap]);

  const endHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (!holdActiveRef.current) return;
    holdActiveRef.current = false;
    justHeldRef.current = true;
    setIsHolding(false);
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  const seekBy = useCallback(
    (delta: number) => {
      const el = videoRef.current;
      if (!el || !Number.isFinite(el.duration)) return;
      const next = Math.min(el.duration, Math.max(0, el.currentTime + delta));
      el.currentTime = next;
      setCurrentTime(next);
      revealControls();
    },
    [revealControls],
  );

  const seekToFraction = useCallback((fraction: number) => {
    const el = videoRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    const next = el.duration * Math.min(1, Math.max(0, fraction));
    el.currentTime = next;
    setCurrentTime(next);
    revealControls();
  }, [revealControls]);

  const adjustVolume = useCallback((delta: number) => {
    const el = videoRef.current;
    const current = el?.volume ?? volume;
    const next = Math.min(1, Math.max(0, Number((current + delta).toFixed(2))));
    setVolume(next);
    if (el) el.volume = next;
    if (next > 0) setIsMuted(false);
    if (next === 0) setIsMuted(true);
    revealControls();
  }, [revealControls, volume]);

  const adjustPlaybackSpeed = useCallback((direction: -1 | 1) => {
    setSpeed((current) => {
      const currentIndex = PLAYBACK_RATES.reduce((best, rate, index) => (
        Math.abs(rate - current) < Math.abs(PLAYBACK_RATES[best] - current) ? index : best
      ), 0);
      const nextIndex = Math.min(PLAYBACK_RATES.length - 1, Math.max(0, currentIndex + direction));
      const next = PLAYBACK_RATES[nextIndex];
      if (videoRef.current && !holdActiveRef.current) videoRef.current.playbackRate = next;
      return next;
    });
    revealControls();
  }, [revealControls]);

  const selectAdjacentVideo = useCallback((direction: -1 | 1) => {
    if (activeVideoIndex < 0) return;
    const next = videos[activeVideoIndex + direction];
    if (next) onSelectVideo(next.id);
  }, [activeVideoIndex, onSelectVideo, videos]);

  const handleSeek = useCallback((time: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = time;
    setCurrentTime(time);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const node = playerRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await node.requestFullscreen();
      }
    } catch {
      /* noop */
    }
  }, []);

  const togglePip = useCallback(async () => {
    const el = videoRef.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }) | null;
    if (!el?.requestPictureInPicture) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await el.requestPictureInPicture();
      }
    } catch {
      /* noop */
    }
  }, []);

  const cycleSpeed = useCallback(() => {
    const index = PLAYBACK_RATES.indexOf(speed);
    const next = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
    lightTap();
    revealControls();
  }, [lightTap, revealControls, speed]);

  // YouTube uslubidagi professional klaviatura boshqaruvi.
  useEffect(() => {
    if (!keyboardEnabled) return;

    const handler = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isInteractive = target?.closest(
        'input, textarea, select, button, a, [contenteditable="true"], [role="textbox"], [role="slider"]',
      );
      if (isInteractive || event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();

      if (event.shiftKey && key === 'n') {
        event.preventDefault();
        selectAdjacentVideo(1);
        return;
      }
      if (event.shiftKey && key === 'p') {
        event.preventDefault();
        selectAdjacentVideo(-1);
        return;
      }

      if (event.repeat && [' ', 'k', 'm', 'f', 'i', 'escape'].includes(key)) return;

      switch (key) {
        case ' ':
        case 'k':
          event.preventDefault();
          togglePlay();
          break;
        case 'arrowright':
          event.preventDefault();
          seekBy(5);
          break;
        case 'arrowleft':
          event.preventDefault();
          seekBy(-5);
          break;
        case 'arrowup':
          event.preventDefault();
          adjustVolume(0.05);
          break;
        case 'arrowdown':
          event.preventDefault();
          adjustVolume(-0.05);
          break;
        case 'j':
          event.preventDefault();
          seekBy(-10);
          break;
        case 'l':
          event.preventDefault();
          seekBy(10);
          break;
        case 'm':
          event.preventDefault();
          setIsMuted((prev) => !prev);
          revealControls();
          break;
        case 'f':
          event.preventDefault();
          void toggleFullscreen();
          break;
        case 'i':
          event.preventDefault();
          void togglePip();
          break;
        case 'home':
          event.preventDefault();
          seekToFraction(0);
          break;
        case 'end':
          event.preventDefault();
          seekToFraction(1);
          break;
        case '>':
          event.preventDefault();
          adjustPlaybackSpeed(1);
          break;
        case '<':
          event.preventDefault();
          adjustPlaybackSpeed(-1);
          break;
        case 'escape':
          if (!document.fullscreenElement) {
            event.preventDefault();
            onClose();
          }
          break;
        default:
          if (!event.shiftKey && /^[0-9]$/.test(event.key)) {
            event.preventDefault();
            seekToFraction(Number(event.key) / 10);
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    adjustPlaybackSpeed,
    adjustVolume,
    keyboardEnabled,
    onClose,
    revealControls,
    seekBy,
    seekToFraction,
    selectAdjacentVideo,
    toggleFullscreen,
    togglePip,
    togglePlay,
  ]);

  if (!video) return null;

  const title = deriveVideoTitle(video.content, video.profile?.username);
  const description = video.content?.split('\n').slice(1).join('\n').trim();
  const isOwnVideo = Boolean(currentUserId && video.user_id === currentUserId);

  const glassAction =
    'inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3.5 text-xs font-semibold text-white shadow-lg backdrop-blur-xl transition hover:border-white/25 hover:bg-white/15 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55';

  const upNextList = (
    <div className="min-h-full bg-background pb-[calc(env(safe-area-inset-bottom,0px)+24px)] text-foreground">
      <div className="sticky top-0 z-10 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur-xl">
        <h2 className="text-sm font-semibold">Keyingi videolar</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Tavsiya etilgan videolar
        </p>
      </div>
      <div className="py-1">
        {upNext.map((item) => (
          <VideoUpNextItem
            key={item.id}
            video={item}
            onClick={() => {
              onSelectVideo(item.id);
              lightTap();
            }}
            onProfileClick={() => onOpenProfile(item)}
          />
        ))}
        {upNext.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Hozircha boshqa video yo'q
          </p>
        )}
      </div>
    </div>
  );

  const authorOverlay = (
    <div
      className={cn(
        'absolute inset-x-0 bottom-[86px] z-40 hidden items-end justify-between gap-4 px-5 transition-[opacity,transform] duration-200 lg:flex',
        showControls
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-2 opacity-0',
      )}
      aria-hidden={!showControls}
    >
      <div className="min-w-0 max-w-[min(680px,70%)]">
        <div className="mb-2 flex items-center gap-2.5">
          <button
            type="button"
            className=""
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              revealControls();
              onOpenProfile(video);
            }}
          >
            <StoryAvatar
              userId={video.user_id}
              avatarUrl={video.profile?.avatar_url}
              username={video.profile?.username}
              size="sm"
            />
          </button>

          <button
            type="button"
            className="flex min-w-0 items-center gap-1.5 text-left"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              revealControls();
              onOpenProfile(video);
            }}
          >
            <span className="truncate text-sm font-semibold text-white">
              @{video.profile?.username || 'user'}
            </span>
            {video.profile?.is_verified && <VerifiedBadge size="xs" />}
          </button>

          {!isOwnVideo && (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                revealControls();
                onFollow(video.user_id);
                lightTap();
              }}
              className={cn(
                'h-8 rounded-full border px-3 text-xs font-semibold backdrop-blur-xl transition active:scale-95',
                video.is_following
                  ? 'border-white/20 bg-white/12 text-white hover:bg-white/18'
                  : 'border-white/80 bg-white text-black hover:bg-white/90',
              )}
            >
              {video.is_following ? 'Kuzatilmoqda' : 'Kuzatish'}
            </button>
          )}
        </div>

        <h1 className="line-clamp-2 text-base font-semibold leading-snug text-white drop-shadow-lg">
          {title}
        </h1>
        <p className="mt-1 text-[11px] text-white/70">
          {formatCompactNumber(video.views_count || 0)} ko'rish ·{' '}
          {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <button
          type="button"
          className={cn(
            glassAction,
            video.is_liked && 'border-red-400/30 bg-red-500/20 text-red-100',
          )}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            revealControls();
            onLike(video.id);
            mediumTap();
          }}
        >
          <Heart
            className={cn(
              'h-4.5 w-4.5',
              video.is_liked && 'fill-red-500 text-red-500',
            )}
          />
          {formatCompactNumber(video.likes_count || 0)}
        </button>
        <button
          type="button"
          className={glassAction}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            revealControls();
            onComments(video);
          }}
        >
          <MessageCircle className="h-4 w-4" />
          {formatCompactNumber(video.comments_count || 0)}
        </button>
        <button
          type="button"
          className={glassAction}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            revealControls();
            onShare(video);
          }}
        >
          <Send className="h-4 w-4" />
          Ulashish
        </button>
        <button
          type="button"
          className={cn(
            glassAction,
            video.is_bookmarked && 'border-primary/40 bg-primary/20',
          )}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            revealControls();
            onBookmark(video.id);
            lightTap();
          }}
        >
          <Bookmark
            className={cn('h-4 w-4', video.is_bookmarked && 'fill-current')}
          />
          Saqlash
        </button>
      </div>
    </div>
  );

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 flex min-h-0 flex-col bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_400px]',
        UI_LAYER.immersive,
      )}
    >
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-black">
        <div
          ref={playerRef}
          className={cn(
            'group/player relative w-full shrink-0 overflow-hidden bg-black',
            isFullscreen
              ? 'h-full'
              : 'aspect-video lg:h-full lg:flex-1 lg:aspect-auto',
          )}
          aria-keyshortcuts="Space K J L M F I ArrowLeft ArrowRight ArrowUp ArrowDown Home End Shift+N Shift+P"
          onPointerMove={revealControls}
          onPointerDown={(event) => {
            const target =
              event.target instanceof HTMLElement ? event.target : null;
            if (
              target?.closest(
                'button, a, input, textarea, select, [role="slider"], [data-video-interactive="true"]',
              )
            ) {
              revealControls();
              return;
            }
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            startHold();
          }}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onPointerLeave={endHold}
          onClick={(event) => {
            const target =
              event.target instanceof HTMLElement ? event.target : null;
            if (
              target?.closest(
                'button, a, input, textarea, select, [role="slider"], [data-video-interactive="true"]',
              )
            ) {
              return;
            }
            if (justHeldRef.current) {
              justHeldRef.current = false;
              return;
            }
            if (showControls) togglePlay();
            else revealControls();
          }}
        >
          {aspectKind !== 'landscape' && !fitCover && videoUrl && (
            <>
              <video
                src={videoUrl}
                muted
                playsInline
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full scale-[1.12] object-cover opacity-50 blur-[34px] saturate-125"
              />
              <div className="pointer-events-none absolute inset-0 bg-black/28" />
            </>
          )}

          <video
            ref={videoRef}
            src={videoUrl}
            poster={video.media_urls?.[1]}
            className={cn(
              'relative z-[1] h-full w-full',
              fitCover ? 'object-cover' : 'object-contain',
            )}
            playsInline
            autoPlay
            muted={isMuted}
            onContextMenu={(event) => event.preventDefault()}
            onLoadedMetadata={(event) => {
              const el = event.currentTarget;
              setDuration(el.duration || 0);
              if (el.videoWidth && el.videoHeight) {
                setRatio(el.videoWidth / el.videoHeight);
              }
              el.playbackRate = speed;
              el.volume = volume;
            }}
            onTimeUpdate={(event) =>
              setCurrentTime(event.currentTarget.currentTime)
            }
            onProgress={(event) => {
              const el = event.currentTarget;
              if (el.buffered.length > 0) {
                setBuffered(el.buffered.end(el.buffered.length - 1));
              }
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => selectAdjacentVideo(1)}
          />

          <button
            type="button"
            aria-label="10 soniya orqaga"
            className="absolute left-0 top-0 z-[2] h-full w-1/4"
            onDoubleClick={(event) => {
              event.stopPropagation();
              seekBy(-10);
              mediumTap();
            }}
          />
          <button
            type="button"
            aria-label="10 soniya oldinga"
            className="absolute right-0 top-0 z-[2] h-full w-1/4"
            onDoubleClick={(event) => {
              event.stopPropagation();
              seekBy(10);
              mediumTap();
            }}
          />

          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/70 via-black/15 to-transparent p-3 transition-opacity duration-200',
              showControls ? 'opacity-100' : 'opacity-0',
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-10 w-10 rounded-full border border-white/10 bg-black/25 text-white backdrop-blur-xl hover:bg-white/15',
                showControls ? 'pointer-events-auto' : 'pointer-events-none',
              )}
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              aria-label="Videolarga qaytish"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div
              className={cn(
                'flex items-center gap-2',
                showControls ? 'pointer-events-auto' : 'pointer-events-none',
              )}
            >
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-full border border-white/10 bg-black/25 px-3 text-xs font-semibold text-white backdrop-blur-xl hover:bg-white/15"
                onClick={(event) => {
                  event.stopPropagation();
                  cycleSpeed();
                }}
              >
                {speed}x
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full border border-white/10 bg-black/25 text-white backdrop-blur-xl hover:bg-white/15"
                onClick={(event) => {
                  event.stopPropagation();
                  setFitCover((previous) => !previous);
                  lightTap();
                }}
                aria-label="Media sig‘imini almashtirish"
              >
                {fitCover ? (
                  <Minimize2 className="h-4.5 w-4.5" />
                ) : (
                  <Maximize2 className="h-4.5 w-4.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-10 w-10 rounded-full border border-white/10 bg-black/25 text-white backdrop-blur-xl hover:bg-white/15 md:inline-flex"
                onClick={(event) => {
                  event.stopPropagation();
                  void togglePip();
                }}
                aria-label="Mini pleyer"
              >
                <PictureInPicture2 className="h-4.5 w-4.5" />
              </Button>
            </div>
          </div>

          {!isPlaying && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-black/45 shadow-2xl backdrop-blur-xl">
                <Play className="h-8 w-8 fill-white text-white" />
              </div>
            </div>
          )}

          {isHolding && (
            <div className="pointer-events-none absolute left-1/2 top-[14%] z-30 -translate-x-1/2">
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-white shadow-xl backdrop-blur-xl">
                <Gauge className="h-3.5 w-3.5" />
                <span className="text-xs font-bold">2x</span>
              </div>
            </div>
          )}

          {authorOverlay}

          <div
            className={cn(
              'absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-2 pt-10 transition-opacity duration-200 lg:px-5 lg:pb-3 lg:pt-12',
              showControls
                ? 'pointer-events-auto opacity-100'
                : 'pointer-events-none opacity-0',
            )}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <VideoScrubBar
              src={videoUrl}
              duration={duration}
              currentTime={currentTime}
              bufferedSeconds={buffered}
              heatmap={heatmap}
              onSeek={handleSeek}
              onScrubStateChange={(scrubbing) => {
                if (scrubbing) setShowControls(true);
                else revealControls();
              }}
              enablePreview={duration > 0}
              playedClassName="bg-primary"
              thumbClassName="bg-primary"
            />

            <div className="mt-1 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-white hover:bg-white/15"
                  onClick={togglePlay}
                  aria-label={isPlaying ? 'Pauza (K)' : 'Ijro (K)'}
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-white hover:bg-white/15"
                  onClick={() => setIsMuted((previous) => !previous)}
                  aria-label={
                    isMuted ? 'Ovozni yoqish (M)' : 'Ovozni o‘chirish (M)'
                  }
                >
                  {isMuted ? (
                    <VolumeX className="h-5 w-5" />
                  ) : (
                    <Volume2 className="h-5 w-5" />
                  )}
                </Button>
                <span className="ml-1 text-[11px] font-medium tabular-nums text-white/90">
                  {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-white hover:bg-white/15"
                onClick={() => void toggleFullscreen()}
                aria-label="To‘liq ekran (F)"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-5 w-5" />
                ) : (
                  <Maximize2 className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {!isFullscreen && (
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background text-foreground lg:hidden"
          >
            <div className="px-4 pt-4">
              <h1 className="text-base font-semibold leading-snug">{title}</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatCompactNumber(video.views_count || 0)} ko'rish ·{' '}
                {formatDistanceToNow(new Date(video.created_at), {
                  addSuffix: true,
                })}
              </p>

              <div className="mt-3 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onOpenProfile(video)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <StoryAvatar
                    userId={video.user_id}
                    avatarUrl={video.profile?.avatar_url}
                    username={video.profile?.username}
                    size="sm"
                  />
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-sm font-semibold">
                      @{video.profile?.username || 'user'}
                    </span>
                    {video.profile?.is_verified && <VerifiedBadge size="xs" />}
                  </span>
                </button>

                {!isOwnVideo && (
                  <button
                    type="button"
                    onClick={() => onFollow(video.user_id)}
                    className={cn(
                      'h-8 rounded-full px-3 text-xs font-semibold transition',
                      video.is_following
                        ? 'border border-border bg-background'
                        : 'bg-foreground text-background',
                    )}
                  >
                    {video.is_following ? 'Kuzatilmoqda' : 'Kuzatish'}
                  </button>
                )}
              </div>

              {description && (
                <button
                  type="button"
                  onClick={() => setDescOpen((previous) => !previous)}
                  className="mt-3 w-full rounded-2xl bg-muted/60 p-3 text-left"
                >
                  <p
                    className={cn(
                      'whitespace-pre-wrap text-[13px]',
                      !descOpen && 'line-clamp-2',
                    )}
                  >
                    {description}
                  </p>
                  <span className="mt-1 inline-block text-[11px] font-semibold text-muted-foreground">
                    {descOpen ? 'Yopish' : 'Batafsil'}
                  </span>
                </button>
              )}

              <div className="mt-3 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => onLike(video.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3.5 py-2 text-xs font-semibold',
                    video.is_liked && 'bg-primary/15 text-primary',
                  )}
                >
                  <Heart
                    className={cn(
                      'h-4 w-4',
                      video.is_liked && 'fill-red-500 text-red-500',
                    )}
                  />
                  {formatCompactNumber(video.likes_count || 0)}
                </button>
                <button
                  type="button"
                  onClick={() => onComments(video)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3.5 py-2 text-xs font-semibold"
                >
                  <MessageCircle className="h-4 w-4" />
                  {formatCompactNumber(video.comments_count || 0)}
                </button>
                <button
                  type="button"
                  onClick={() => onShare(video)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3.5 py-2 text-xs font-semibold"
                >
                  <Send className="h-4 w-4" />
                  Ulashish
                </button>
                <button
                  type="button"
                  onClick={() => onBookmark(video.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3.5 py-2 text-xs font-semibold',
                    video.is_bookmarked && 'bg-primary/15 text-primary',
                  )}
                >
                  <Bookmark className={cn('h-4 w-4', video.is_bookmarked && 'fill-current')} />
                  Saqlash
                </button>
              </div>
            </div>

            {upNextList}
          </div>
        )}
      </section>

      {!isFullscreen && (
        <aside className="hidden h-full min-h-0 overflow-y-auto overscroll-contain border-l border-border bg-background [scrollbar-gutter:stable] lg:block">
          {upNextList}
        </aside>
      )}
    </div>,
    document.body,
  );
}
