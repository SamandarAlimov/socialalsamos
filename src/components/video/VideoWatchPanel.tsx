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
  ThumbsUp,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
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

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Bosib turish 2x tezlikka o'tishi uchun kerakli vaqt (ms). */
const HOLD_TO_SPEED_MS = 300;

export interface VideoWatchPanelProps {
  videos: VideoPost[];
  activeVideoId: string;
  onSelectVideo: (videoId: string) => void;
  onClose: () => void;
  onLike: (videoId: string) => void;
  onBookmark: (videoId: string) => void;
  onShare: (video: VideoPost) => void;
  onComments: (video: VideoPost) => void;
  onOpenProfile: (video: VideoPost) => void;
}

export function VideoWatchPanel({
  videos,
  activeVideoId,
  onSelectVideo,
  onClose,
  onLike,
  onBookmark,
  onShare,
  onComments,
  onOpenProfile,
}: VideoWatchPanelProps) {
  const video = useMemo(
    () => videos.find((item) => item.id === activeVideoId),
    [videos, activeVideoId],
  );
  const upNext = useMemo(
    () => videos.filter((item) => item.id !== activeVideoId),
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

  // Klaviatura yorliqlari (desktop)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      switch (event.key.toLowerCase()) {
        case ' ':
        case 'k':
          event.preventDefault();
          togglePlay();
          break;
        case 'arrowright':
          seekBy(5);
          break;
        case 'arrowleft':
          seekBy(-5);
          break;
        case 'j':
          seekBy(-10);
          break;
        case 'l':
          seekBy(10);
          break;
        case 'm':
          setIsMuted((prev) => !prev);
          break;
        case 'escape':
          if (!document.fullscreenElement) onClose();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, seekBy, togglePlay]);

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

  if (!video) return null;

  const title = deriveVideoTitle(video.content, video.profile?.username);
  const description = video.content?.split('\n').slice(1).join('\n').trim();

  // Mobileda pastdagi scrollda, desktopda o'ng ustunda ishlatiladi.
  const upNextList = (
    <div className="pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+88px)] lg:pb-8">
      <h2 className="px-3 pb-1 text-sm font-semibold text-foreground">Keyingi videolar</h2>
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
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          Hozircha boshqa video yo'q
        </p>
      )}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-background lg:flex-row">
      {/* CHAP USTUN: pleyer + ma'lumot */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* PLEYER */}
        <div
          ref={playerRef}
          className={cn(
            'relative w-full shrink-0 overflow-hidden bg-black',
            isFullscreen
              ? 'h-full'
              : 'aspect-video lg:mx-auto lg:aspect-auto lg:h-[min(62vh,640px)] lg:max-w-[1180px]',
          )}
          onPointerMove={revealControls}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            startHold();
          }}
          onPointerUp={endHold}
          onPointerCancel={endHold}
          onPointerLeave={endHold}
          onClick={() => {
            // Uzoq bosishdan keyin play/pause ishlamasligi kerak.
            if (justHeldRef.current) {
              justHeldRef.current = false;
              return;
            }
            if (showControls) togglePlay();
            else revealControls();
          }}
        >
          {/* 9:16 yoki 1:1 video 16:9 konteynerda ochiq joy qoldirmasligi uchun blur fon */}
          {aspectKind !== 'landscape' && !fitCover && videoUrl && (
            <video
              src={videoUrl}
              muted
              playsInline
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
            />
          )}

          <video
            ref={videoRef}
            src={videoUrl}
            poster={video.media_urls?.[1]}
            className={cn(
              'relative h-full w-full',
              fitCover ? 'object-cover' : 'object-contain',
            )}
            playsInline
            autoPlay
            muted={isMuted}
            onContextMenu={(event) => event.preventDefault()}
            onLoadedMetadata={(event) => {
              const el = event.currentTarget;
              setDuration(el.duration || 0);
              if (el.videoWidth && el.videoHeight) setRatio(el.videoWidth / el.videoHeight);
              el.playbackRate = speed;
            }}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onProgress={(event) => {
              const el = event.currentTarget;
              if (el.buffered.length > 0) setBuffered(el.buffered.end(el.buffered.length - 1));
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => {
              const next = upNext[0];
              if (next) onSelectVideo(next.id);
            }}
          />

          {/* Ikki marta bosib oldinga/orqaga */}
          <button
            type="button"
            aria-label="10 soniya orqaga"
            className="absolute left-0 top-0 h-full w-1/4"
            onDoubleClick={(event) => {
              event.stopPropagation();
              seekBy(-10);
              mediumTap();
            }}
          />
          <button
            type="button"
            aria-label="10 soniya oldinga"
            className="absolute right-0 top-0 h-full w-1/4"
            onDoubleClick={(event) => {
              event.stopPropagation();
              seekBy(10);
              mediumTap();
            }}
          />

          {/* Yuqori qatlam */}
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-2 transition-opacity',
              showControls ? 'opacity-100' : 'opacity-0',
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              className="pointer-events-auto h-9 w-9 rounded-full text-white hover:bg-white/15"
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="pointer-events-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-2 text-xs font-semibold text-white hover:bg-white/15"
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
                className="h-9 w-9 rounded-full text-white hover:bg-white/15"
                onClick={(event) => {
                  event.stopPropagation();
                  setFitCover((prev) => !prev);
                  lightTap();
                }}
                aria-label="Ekranga moslash"
              >
                {fitCover ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-9 w-9 rounded-full text-white hover:bg-white/15 md:inline-flex"
                onClick={(event) => {
                  event.stopPropagation();
                  togglePip();
                }}
                aria-label="Mini pleyer"
              >
                <PictureInPicture2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Markaziy play tugmasi */}
          {!isPlaying && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
                <Play className="h-8 w-8 fill-white text-white" />
              </div>
            </div>
          )}

          {/* Bosib turilganda 2x ko'rsatkichi */}
          {isHolding && (
            <div className="pointer-events-none absolute left-1/2 top-[16%] -translate-x-1/2">
              <div className="flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 backdrop-blur-sm">
                <Gauge className="h-3.5 w-3.5 text-white" />
                <span className="text-xs font-bold text-white">2x</span>
              </div>
            </div>
          )}

          {/* Pastki boshqaruv */}
          <div
            className={cn(
              'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8 transition-opacity',
              showControls ? 'opacity-100' : 'opacity-0',
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
              playedClassName="bg-red-600"
              thumbClassName="bg-red-600"
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
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-white hover:bg-white/15"
                  onClick={() => setIsMuted((prev) => !prev)}
                  aria-label={isMuted ? 'Ovozni yoqish' : 'Ovoz yoq (M)'}
                >
                  {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </Button>
                <span className="ml-1 text-[11px] font-medium tabular-nums text-white/90">
                  {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-white hover:bg-white/15"
                onClick={toggleFullscreen}
                aria-label="To'liq ekran (F)"
              >
                {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Ma'lumot + (mobileda) keyingi videolar */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="px-3 pt-3 lg:mx-auto lg:max-w-[1180px]">
            <h1 className="text-[15px] font-semibold leading-snug text-foreground lg:text-lg">{title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatCompactNumber(video.views_count || 0)} ko'rish ·{' '}
              {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}
            </p>

            {description && (
              <button
                type="button"
                onClick={() => setDescOpen((prev) => !prev)}
                className="mt-2 w-full rounded-xl bg-muted/60 p-3 text-left"
              >
                <p className={cn('whitespace-pre-wrap text-[13px] text-foreground', !descOpen && 'line-clamp-2')}>
                  {description}
                </p>
                <span className="mt-1 inline-block text-[11px] font-semibold text-muted-foreground">
                  {descOpen ? 'Yopish' : 'Batafsil'}
                </span>
              </button>
            )}
          </div>

          {/* Harakatlar */}
          <div className="mt-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] lg:mx-auto lg:max-w-[1180px] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => {
                onLike(video.id);
                mediumTap();
              }}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3.5 py-2 text-xs font-semibold',
                video.is_liked && 'bg-primary/15 text-primary',
              )}
            >
              <ThumbsUp className={cn('h-4 w-4', video.is_liked && 'fill-primary')} />
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
              onClick={() => {
                onBookmark(video.id);
                lightTap();
              }}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3.5 py-2 text-xs font-semibold',
                video.is_bookmarked && 'bg-primary/15 text-primary',
              )}
            >
              <Bookmark className={cn('h-4 w-4', video.is_bookmarked && 'fill-primary')} />
              Saqlash
            </button>
          </div>

          {/* Muallif */}
          <button
            type="button"
            onClick={() => onOpenProfile(video)}
            className="mt-3 flex w-full items-center gap-3 border-y border-border px-3 py-3 text-left lg:mx-auto lg:max-w-[1180px]"
          >
            <StoryAvatar
              userId={video.user_id}
              avatarUrl={video.profile?.avatar_url}
              username={video.profile?.username}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="truncate text-sm font-semibold">
                  {video.profile?.display_name || video.profile?.username || 'user'}
                </span>
                {video.profile?.is_verified && <VerifiedBadge size="xs" />}
              </div>
              <span className="text-xs text-muted-foreground">@{video.profile?.username || 'user'}</span>
            </div>
            <span className="rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background">
              Profil
            </span>
          </button>

          {/* Keyingi videolar — faqat mobile/tabletda shu ustunda */}
          <div className="lg:hidden">{upNextList}</div>
        </div>
      </div>

      {/* O'NG USTUN (desktop): keyingi videolar alohida scroll bo'ladi */}
      <aside className="hidden w-[400px] shrink-0 overflow-y-auto overscroll-contain border-l border-border lg:block">
        {upNextList}
      </aside>
    </div>,
    document.body,
  );
}
