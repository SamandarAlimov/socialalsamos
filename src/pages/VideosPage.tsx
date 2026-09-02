import { useState, useRef, useEffect, useCallback } from 'react';
import { Heart, MessageCircle, Send, Bookmark, Music2, Volume2, VolumeX, Play, Pause, Repeat2, ArrowLeft, Maximize2, Minimize2, ListVideo, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useVideoPosts, VideoPost } from '@/hooks/useVideoPosts';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoCommentsSheet } from '@/components/VideoCommentsSheet';
import { PostLikesViewsDialog } from '@/components/PostLikesViewsDialog';
import { SharePostDialog } from '@/components/SharePostDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { usePostViews } from '@/hooks/usePostViews';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { StoryStickerOverlay } from '@/components/stickers/StoryStickerOverlay';
import { useTranslation } from 'react-i18next';
import { VideoScrubBar } from '@/components/video/VideoScrubBar';
import { VideoWatchPanel } from '@/components/video/VideoWatchPanel';
import { useVideoHeatmap } from '@/hooks/useVideoHeatmap';
import { useVideoWatchTracker } from '@/hooks/useVideoWatchTracker';
import { formatCompactNumber, formatMediaTime, resolveAspectKind } from '@/lib/videoFormat';

/** Bosib turish 2x tezlikka o'tishi uchun kerakli vaqt (ms). */
const HOLD_TO_SPEED_MS = 300;

/**
 * Aktiv videodan qancha uzoqdagi kartalar DOM da qoladi.
 *
 * 1 = oldingi, joriy va keyingi video. Qolganlari o'rniga yengil poster
 * placeholder turadi: scroll balandligi ham, snap ham o'zgarmaydi, lekin
 * brauzer o'nlab <video> elementini bir vaqtda yuklamaydi.
 */
const RENDER_WINDOW = 1;

/** Ro'yxat oxiriga shuncha video qolganda keyingi sahifa yuklanadi. */
const LOAD_MORE_THRESHOLD = 3;

interface VideoCardProps {
  video: VideoPost;
  isActive: boolean;
  onLike: () => void;
  onBookmark: () => void;
  onCommentClick: () => void;
  onShareClick: () => void;
  onLikesClick: () => void;
  onProfileClick: () => void;
  onWatchClick: () => void;
  isMobile: boolean;
  globalMuted: boolean;
  onMuteToggle: () => void;
}

function VideoCard({
  video,
  isActive,
  onLike,
  onBookmark,
  onCommentClick,
  onShareClick,
  onLikesClick,
  onProfileClick,
  onWatchClick,
  isMobile,
  globalMuted,
  onMuteToggle,
}: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActive = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Player state
  const [aspect, setAspect] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [isHolding, setIsHolding] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [seekHint, setSeekHint] = useState<null | 'forward' | 'backward'>(null);
  const { t } = useTranslation();
  const { lightTap, mediumTap, successFeedback } = useHapticFeedback();
  const { recordView } = usePostViews();
  const { trackProgress, markCompleted, markSeek, finishWatch } = useVideoWatchTracker();
  // Heatmap faqat aktiv kartada so'raladi - aks holda har scrollda
  // keraksiz so'rovlar ketadi.
  const heatmap = useVideoHeatmap(video.id, 48, { enabled: isActive });

  // Record view when video becomes active
  useEffect(() => {
    if (isActive) {
      recordView(video.id);
    }
  }, [isActive, video.id, recordView]);

  const videoUrl = video.media_urls?.[0] || '';
  const posterUrl = video.media_urls?.[1];
  const aspectKind = resolveAspectKind(aspect);
  const isLandscape = aspectKind === 'landscape';
  const isSquareish = aspectKind === 'square';

  useEffect(() => {
    if (!videoRef.current) return;

    if (isActive) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    } else {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      setIsPlaying(false);
      setExpanded(false);
      // Ko'rish seansi tugadi - statistikani bazaga yuboramiz.
      finishWatch(video.id);
    }
  }, [isActive, finishWatch, video.id]);

  // Karta DOM dan chiqsa ham seans yo'qolmasin.
  useEffect(() => () => {
    finishWatch(video.id);
  }, [finishWatch, video.id]);

  // Sync mute state with global
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = globalMuted;
    }
  }, [globalMuted]);

  // Keep playbackRate + volume applied
  useEffect(() => {
    if (videoRef.current && !holdActive.current) videoRef.current.playbackRate = speed;
  }, [speed]);
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  const togglePlay = useCallback(() => {
    lightTap();
    const el = videoRef.current;
    if (!el) return;

    if (el.paused) {
      el.play().catch(() => undefined);
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
    setShowPlayButton(true);
    setTimeout(() => setShowPlayButton(false), 500);
  }, [lightTap]);

  /*
    Instagram / YouTube kabi: ekranni bosib turilsa 2x tezlik, qo'yib
    yuborilganda avvalgi tezlikka qaytadi. Bitta qisqa bosish esa play/pause.
  */
  const startHold = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      const el = videoRef.current;
      if (!el) return;
      holdActive.current = true;
      window.getSelection?.()?.removeAllRanges();
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
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (!holdActive.current) return false;
    holdActive.current = false;
    setIsHolding(false);
    if (videoRef.current) videoRef.current.playbackRate = speed;
    return true;
  }, [speed]);

  useEffect(() => {
    if (!isActive) endHold();
  }, [isActive, endHold]);

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const el = videoRef.current;
    if (!el) return;
    markSeek(video.id);
    el.currentTime = Math.min(Math.max(0, el.currentTime + seconds), el.duration || 0);
    setSeekHint(seconds > 0 ? 'forward' : 'backward');
    setTimeout(() => setSeekHint(null), 450);
  }, [markSeek, video.id]);

  const handleSeek = useCallback((time: number) => {
    const el = videoRef.current;
    if (!el) return;
    markSeek(video.id);
    el.currentTime = time;
    setCurrentTime(time);
  }, [markSeek, video.id]);

  const toggleFullscreen = useCallback(() => {
    const node = frameRef.current;
    if (!node) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      node.requestFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Keyboard shortcuts for the active video
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekBy(5);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBy(-5);
          break;
        case 'l':
          seekBy(10);
          break;
        case 'j':
          seekBy(-10);
          break;
        case 'm':
          onMuteToggle();
          break;
        case 'f':
          toggleFullscreen();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, seekBy, togglePlay, toggleFullscreen, onMuteToggle]);

  const handleLike = () => {
    successFeedback();
    onLike();
  };

  const handleBookmark = () => {
    lightTap();
    onBookmark();
  };

  const handleFollow = () => {
    lightTap();
    setIsFollowing(!isFollowing);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    lightTap();
    onShareClick();
  };

  const handleRepost = () => {
    lightTap();
  };

  const stopBubble = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div className="relative flex h-full w-full select-none items-center justify-center bg-black snap-start snap-always">
      {/* Video Container — size adapts to the source aspect ratio */}
      <div
        ref={frameRef}
        className={cn(
          "relative select-none overflow-hidden bg-black [-webkit-touch-callout:none]",
          isMobile
            ? "h-full w-full"
            : cn(
                "shadow-2xl ring-1 ring-white/10",
                isLandscape
                  ? "aspect-video w-[min(1120px,calc(100vw-80px))] max-h-[calc(100dvh-32px)] rounded-2xl"
                  : isSquareish
                    ? "aspect-square h-[min(82dvh,720px)] max-w-[min(720px,70vw)] rounded-2xl"
                    : "aspect-[9/16] h-[calc(100dvh-28px)] max-h-[920px] w-auto max-w-[min(460px,42vw)] rounded-[22px]"
              )
        )}
        style={{
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {/*
          Instagram Reels uslubi: 16:9 yoki 1:1 video 9:16 ekranda qora
          bo'shliq qoldirmasligi uchun orqa fonda blur fon turadi.

          Diqqat: ilgari bu yerda AYNAN o'sha videoning ikkinchi nusxasi
          <video> sifatida yuklanardi - ya'ni har bir reel ikki marta
          yuklanib, trafik va batareya ikki barobar sarflanardi. Endi poster
          rasm ishlatiladi (poster bo'lmasa - oddiy qorong'i fon).
        */}
        <div
          className={cn(
            "absolute right-3 z-[35] flex items-center gap-2",
            isMobile
              ? "top-[max(12px,env(safe-area-inset-top))]"
              : "top-3"
          )}
          onPointerDown={stopBubble}
          onPointerUp={stopBubble}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              lightTap();
              onWatchClick();
            }}
            aria-label="Watch view"
            title="Watch view"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/48 text-white shadow-lg ring-1 ring-white/12 backdrop-blur-md transition hover:bg-black/65 active:scale-90"
          >
            <ListVideo className="h-[18px] w-[18px]" strokeWidth={2} />
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onMuteToggle();
            }}
            aria-label={globalMuted ? 'Unmute' : 'Mute'}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/48 text-white shadow-lg ring-1 ring-white/12 backdrop-blur-md transition hover:bg-black/65 active:scale-90"
          >
            {globalMuted ? (
              <VolumeX className="h-[18px] w-[18px]" strokeWidth={2} />
            ) : (
              <Volume2 className="h-[18px] w-[18px]" strokeWidth={2} />
            )}
          </button>
        </div>

        {isMobile && aspect !== null && aspectKind !== 'portrait' && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            {posterUrl ? (
              <img
                src={posterUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full scale-110 object-cover opacity-45 blur-2xl"
              />
            ) : (
              <div className="h-full w-full bg-neutral-900" />
            )}
          </div>
        )}

        {/* Video */}
        <video
          ref={videoRef}
          src={videoUrl}
          className="absolute inset-0 h-full w-full select-none object-contain"
          draggable={false}
          controls={false}
          disablePictureInPicture
          loop
          muted={globalMuted}
          playsInline
          preload={isActive ? 'auto' : 'metadata'}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            startHold();
          }}
          onDragStart={(e) => e.preventDefault()}
          onSelect={(e) => e.preventDefault()}
          onPointerUp={() => {
            // Uzoq bosish bo'lgan bo'lsa play/pause ishlamaydi.
            if (!endHold()) togglePlay();
          }}
          onPointerCancel={() => endHold()}
          onPointerLeave={() => endHold()}
          onContextMenu={(e) => e.preventDefault()}
          onDoubleClick={(e) => {
            const rect = (e.currentTarget as HTMLVideoElement).getBoundingClientRect();
            seekBy(e.clientX - rect.left > rect.width / 2 ? 10 : -10);
          }}
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            if (el.videoWidth && el.videoHeight) setAspect(el.videoWidth / el.videoHeight);
            setDuration(el.duration || 0);
            el.playbackRate = speed;
            el.volume = volume;
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            setCurrentTime(el.currentTime);
            if (el.buffered.length) setBuffered(el.buffered.end(el.buffered.length - 1));
            // "Eng ko'p ko'rilgan qism" va watch-time uchun statistika.
            if (isActive) trackProgress(video.id, el.currentTime, el.duration);
          }}
          onSeeking={() => markSeek(video.id)}
          onEnded={() => markCompleted(video.id)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          poster={posterUrl}
        />

        {/* Play/Pause Overlay — faqat markazda */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300",
            showPlayButton || (!isPlaying && isActive) ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="h-20 w-20 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
            {isPlaying ? (
              <Pause className="h-10 w-10 text-white" />
            ) : (
              <Play className="h-10 w-10 text-white ml-1" />
            )}
          </div>
        </div>

        {/* Bosib turilganda 2x ko'rsatkichi */}
        {isHolding && (
          <div className="pointer-events-none absolute left-1/2 top-[18%] z-30 -translate-x-1/2 select-none">
            <div className="flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 backdrop-blur-sm">
              <Gauge className="h-3.5 w-3.5 text-white" />
              <span className="text-xs font-bold text-white">2x</span>
            </div>
          </div>
        )}

        {/* Double-tap seek hint */}
        {seekHint && (
          <div className={cn(
            "absolute inset-y-0 w-1/3 flex items-center justify-center pointer-events-none",
            seekHint === 'forward' ? "right-0" : "left-0"
          )}>
            <div className="px-3 py-2 rounded-full bg-black/55 backdrop-blur-sm text-white text-xs font-semibold">
              {seekHint === 'forward' ? '+10s' : '−10s'}
            </div>
          </div>
        )}

        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70 pointer-events-none" />

        {/*
          Story/reel stikerlari.
          Diqqat: gradientdan KEYIN turishi shart, aks holda stikerlar
          qorayib ketadi. Bosish faqat interaktiv elementlarda ochiq,
          shu sabab videoni bosib to'xtatish ishlashda davom etadi.
        */}
        <div className="pointer-events-none absolute inset-0 z-[15] [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_textarea]:pointer-events-auto">
          <StoryStickerOverlay
            postId={video.id}
            currentTime={currentTime}
            className="h-full w-full"
          />
        </div>

        {/*
          PASTKI QATLAM — bitta ustun, shu sabab hech narsa ustma-ust tushmaydi:
            1) info (muallif, matn, musiqa) + o'ngda harakatlar ustuni
            2) ularning ostida timeline va minimal boshqaruv
          Instagram kabi bottom navbar ustida turadi.
        */}
        <div
          className={cn(
            "absolute inset-x-0 z-20 flex flex-col gap-2 px-3",
            isMobile
              ? "bottom-[calc(env(safe-area-inset-bottom,0px)+70px)]"
              : "bottom-0 pb-3"
          )}
        >
          <div className="flex items-end gap-3">
            {/* Chap: muallif, tavsif, musiqa — Instagramdagi tartib */}
            <div className="min-w-0 flex-1" onPointerDown={stopBubble} onPointerUp={stopBubble}>
              {/* 1) Muallif */}
              <div className="mb-1.5 flex items-center gap-2.5">
                <StoryAvatar
                  userId={video.profile?.id || video.user_id}
                  username={video.profile?.username}
                  displayName={video.profile?.display_name}
                  avatarUrl={video.profile?.avatar_url}
                  isVerified={!!video.profile?.is_verified}
                  size="sm"
                  showRing
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onProfileClick();
                  }}
                  className="flex min-w-0 items-center gap-1.5"
                >
                  <span className="truncate text-sm font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                    @{video.profile?.username || 'user'}
                  </span>
                  {video.profile?.is_verified && <VerifiedBadge size="xs" />}
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFollow}
                  className={cn(
                    "ml-1 h-7 shrink-0 rounded-md border px-3 text-xs font-semibold",
                    isFollowing
                      ? "border-white/40 bg-transparent text-white hover:bg-white/10"
                      : "border-white bg-transparent text-white hover:bg-white/10"
                  )}
                >
                  {isFollowing ? t('common.following', 'Following') : t('common.follow', 'Follow')}
                </Button>
              </div>

              {/*
                2) Tavsif — aynan Instagramdagi kabi username OSTIDA va o'z
                joyida ochiladi. Blok pastga bog'langani uchun matn ochilganda
                yuqoriga o'sadi, tartib esa buzilmaydi:
                username → matn → musiqa → timeline.
              */}
              {video.content && (
                <div className="mb-2">
                  {expanded ? (
                    <div
                      onClick={stopBubble}
                      onTouchStart={stopBubble}
                      onTouchMove={stopBubble}
                      onTouchEnd={stopBubble}
                    >
                      <div
                        className="scrollbar-hide overflow-y-auto overscroll-contain whitespace-pre-wrap break-words pr-1 text-[13px] leading-relaxed text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]"
                        style={{ maxHeight: '34vh', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                      >
                        {video.content}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpanded(false);
                        }}
                        className="mt-0.5 text-[12px] font-semibold text-white/70 active:opacity-70"
                      >
                        {t('common.less', 'less')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(true);
                      }}
                      className="w-full text-left"
                    >
                      <p className="line-clamp-2 whitespace-pre-wrap break-words text-[13px] leading-snug text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]">
                        {video.content}
                        {video.content.length > 80 && (
                          <span className="ml-1 font-semibold text-white/80">… {t('common.more', 'more')}</span>
                        )}
                      </p>
                    </button>
                  )}
                </div>
              )}

              {/* 3) Musiqa */}
              <div className="flex items-center gap-2">
                <Music2 className="h-3.5 w-3.5 text-white animate-spin" style={{ animationDuration: '3s' }} />
                <span className="truncate text-[12px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                  Original Sound · {video.profile?.display_name || video.profile?.username}
                </span>
              </div>
            </div>

            {/* O'ng: harakatlar ustuni (Instagram uslubi) */}
            <div
              className="flex shrink-0 flex-col items-center gap-3 pb-0.5"
              onPointerDown={stopBubble}
              onPointerUp={stopBubble}
            >
              {/* Like (ko'rishlar bilan) */}
              <div className="flex flex-col items-center gap-0.5">
                <button
                  onClick={handleLike}
                  className="p-1.5 transition-transform active:scale-90"
                  aria-label="Like"
                >
                  <Heart
                    className={cn(
                      "h-6 w-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]",
                      video.is_liked ? "fill-red-500 text-red-500" : "text-white"
                    )}
                    strokeWidth={1.8}
                  />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onLikesClick();
                  }}
                  className="-mt-1 flex flex-col items-center active:opacity-70"
                >
                  <span className="text-[10px] font-semibold leading-tight tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                    {formatCompactNumber(video.likes_count || 0)}
                  </span>
                </button>
              </div>

              {/* Comments */}
              <div className="flex flex-col items-center gap-0.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    lightTap();
                    onCommentClick();
                  }}
                  className="p-1.5 transition-transform active:scale-90"
                  aria-label="Comments"
                >
                  <MessageCircle
                    className="h-6 w-6 -scale-x-100 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                    strokeWidth={1.8}
                  />
                </button>
                <span className="-mt-1 text-[10px] font-semibold tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                  {formatCompactNumber(video.comments_count || 0)}
                </span>
              </div>

              {/* Share */}
              <div className="flex flex-col items-center gap-0.5">
                <button
                  onClick={handleShare}
                  className="p-1.5 transition-transform active:scale-90"
                  aria-label="Share"
                >
                  <Send
                    className="h-6 w-6 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                    strokeWidth={1.8}
                  />
                </button>
                {(video.shares_count || 0) > 0 && (
                  <span className="-mt-1 text-[10px] font-semibold tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                    {formatCompactNumber(video.shares_count || 0)}
                  </span>
                )}
              </div>

              {/* Repost */}
              <button
                onClick={handleRepost}
                className="p-1.5 transition-transform active:scale-90"
                aria-label="Repost"
              >
                <Repeat2
                  className="h-6 w-6 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                  strokeWidth={1.8}
                />
              </button>

              {/* Bookmark */}
              <button
                onClick={handleBookmark}
                className="p-1.5 transition-transform active:scale-90"
                aria-label="Save"
              >
                <Bookmark
                  className={cn(
                    "h-6 w-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]",
                    video.is_bookmarked ? "fill-white text-white" : "text-white"
                  )}
                  strokeWidth={1.8}
                />
              </button>
            </div>
          </div>

          {/* Timeline + minimal boshqaruv (play/pause va ovoz tepada) */}
          <div onPointerDown={stopBubble} onPointerUp={stopBubble} onClick={stopBubble}>
            <VideoScrubBar
              src={videoUrl}
              duration={duration}
              currentTime={currentTime}
              bufferedSeconds={buffered}
              heatmap={heatmap}
              onSeek={handleSeek}
              enablePreview={duration > 0}
            />

            <div className="flex select-none items-center gap-2 text-white">
              <span className="text-[11px] tabular-nums text-white/85">
                {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
              </span>
              <div className="flex-1" />
              {!isMobile && (
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={globalMuted ? 0 : volume}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setVolume(v);
                    if (v > 0 && globalMuted) onMuteToggle();
                  }}
                  aria-label="Volume"
                  className="h-1 w-16 cursor-pointer accent-white xl:w-20"
                />
              )}
              <button
                onClick={() => setSpeed((s) => (s >= 2 ? 0.5 : Number((s + 0.25).toFixed(2))))}
                className="rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold tabular-nums ring-1 ring-white/15 backdrop-blur transition hover:bg-black/55 active:scale-95"
                aria-label="Playback speed"
              >
                {speed}x
              </button>
              <button onClick={toggleFullscreen} aria-label="Fullscreen" className="flex h-7 w-7 items-center justify-center rounded-full bg-black/35 ring-1 ring-white/10 backdrop-blur transition hover:bg-black/55 active:scale-90">
                {isFullscreen ? <Minimize2 className="h-4.5 w-4.5" /> : <Maximize2 className="h-4.5 w-4.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Virtualizatsiya uchun yengil o'rinbosar.
 *
 * Aktiv videodan uzoqdagi kartalar o'rniga shu blok turadi: <video> element
 * yaratilmaydi, faqat poster rasm ko'rsatiladi. Balandlik bir xil bo'lgani
 * uchun scroll pozitsiyasi va snap buzilmaydi.
 */
function VideoPlaceholder({ video, isMobile }: { video: VideoPost; isMobile: boolean }) {
  const posterUrl = video.media_urls?.[1];

  return (
    <div className="relative h-full w-full bg-black flex items-center justify-center snap-start snap-always">
      <div
        className={cn(
          'relative overflow-hidden bg-neutral-950',
          isMobile ? 'h-full w-full' : 'h-full w-full max-w-[400px] rounded-2xl',
        )}
      >
        {posterUrl && (
          <img
            src={posterUrl}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          />
        )}
      </div>
    </div>
  );
}

/**
 * Orqaga qaytish tugmasi.
 * Ilgari u faqat `isMobile && isDeepLink` bo'lganda chizilardi, shuning uchun
 * Discover'dan desktopda /videos?v=<id> ga o'tilganda tugma umuman
 * ko'rinmasdi. Endi bitta komponent barcha holatlarda (skeleton, empty, feed)
 * ishlatiladi.
 */
function BackButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Orqaga"
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full bg-black/50 ring-1 ring-white/10 backdrop-blur-md transition-all hover:bg-black/70 active:scale-90',
        className,
      )}
    >
      <ArrowLeft className="h-5 w-5 text-white" />
    </button>
  );
}

function VideoSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <div className="relative h-full w-full bg-black flex items-center justify-center">
      <div className={cn(
        "relative h-full w-full",
        !isMobile && "max-w-[400px] aspect-[9/16] rounded-2xl overflow-hidden"
      )}>
        <Skeleton className="absolute inset-0 bg-muted/20" />
        <div className="absolute right-3 bottom-28 flex flex-col items-center gap-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-12 rounded-full bg-muted/20" />
          ))}
        </div>
        <div className="absolute left-4 right-20 bottom-6">
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="h-10 w-10 rounded-full bg-muted/20" />
            <Skeleton className="h-4 w-24 bg-muted/20" />
            <Skeleton className="h-7 w-16 rounded-full bg-muted/20" />
          </div>
          <Skeleton className="h-4 w-full bg-muted/20 mb-2" />
          <Skeleton className="h-3 w-32 bg-muted/20" />
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-black">
      <div className="text-center px-8">
        <div className="h-20 w-20 rounded-full bg-muted/20 flex items-center justify-center mx-auto mb-4">
          <Play className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="text-white text-lg font-semibold mb-2">No videos yet</h3>
        <p className="text-muted-foreground text-sm">
          Be the first to share a video!
        </p>
      </div>
    </div>
  );
}

export default function VideosPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const { videos, isLoading, hasMore, loadMore, likeVideo, toggleBookmark } = useVideoPosts();
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareVideoId, setShareVideoId] = useState<string | null>(null);
  const [likesDialogOpen, setLikesDialogOpen] = useState(false);
  const [likesVideoId, setLikesVideoId] = useState<string | null>(null);
  const [watchVideoId, setWatchVideoId] = useState<string | null>(null);
  const [globalMuted, setGlobalMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const { mediumTap, lightTap } = useHapticFeedback();

  // Touch gesture tracking
  const touchStartY = useRef<number>(0);
  const touchStartX = useRef<number>(0);
  const touchStartTime = useRef<number>(0);
  const horizontalDelta = useRef<number>(0);
  const verticalDelta = useRef<number>(0);
  const [swipeProgress, setSwipeProgress] = useState(0);

  /*
    Deep-link: Discover, Search yoki tashqi havoladan aniq bir video ochilgan.
    Bunday holatda foydalanuvchiga qaytish yo'li kerak - avval u faqat mobil
    ko'rinishda chizilgani uchun desktopda "qamalib" qolardi.
  */
  const isDeepLink = Boolean(
    searchParams.get('v') || searchParams.get('post') || searchParams.get('id')
  );

  const handleBack = useCallback(() => {
    lightTap();
    // Yangi tabda ochilgan havolada tarix bo'sh bo'ladi - Discover'ga qaytamiz.
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/discover');
    }
  }, [navigate, lightTap]);

  // Esc ham orqaga qaytaradi (faqat deep-link rejimida, modal ochiq bo'lmasa).
  useEffect(() => {
    if (!isDeepLink) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (commentsOpen || shareDialogOpen || likesDialogOpen || watchVideoId) return;
      if (document.fullscreenElement) return;
      handleBack();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDeepLink, commentsOpen, shareDialogOpen, likesDialogOpen, watchVideoId, handleBack]);

  const openProfile = useCallback((video?: VideoPost | null) => {
    const username = video?.profile?.username;
    if (!username) return;
    lightTap();
    navigate(`/user/${username}`);
  }, [navigate, lightTap]);

  const handleMuteToggle = useCallback(() => {
    setGlobalMuted(prev => !prev);
  }, []);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const itemHeight = container.clientHeight;
    const newIndex = Math.round(scrollTop / itemHeight);

    if (newIndex !== activeIndex && newIndex >= 0 && newIndex < videos.length) {
      mediumTap();
      setActiveIndex(newIndex);
    }
  }, [activeIndex, videos.length, mediumTap]);

  /*
    Cheksiz scroll: ro'yxat oxiriga yaqinlashganda keyingi sahifa yuklanadi.
    Ilgari bir yo'la 50 ta video kelardi va shu bilan tugardi.
  */
  useEffect(() => {
    if (isLoading || !hasMore) return;
    if (videos.length === 0) return;
    if (activeIndex < videos.length - LOAD_MORE_THRESHOLD) return;
    void loadMore();
  }, [activeIndex, videos.length, hasMore, isLoading, loadMore]);

  // Swipe gesture handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
    touchStartTime.current = Date.now();
    horizontalDelta.current = 0;
    verticalDelta.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const deltaY = e.touches[0].clientY - touchStartY.current;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    verticalDelta.current = deltaY;
    horizontalDelta.current = deltaX;
    const progress = Math.max(-1, Math.min(1, deltaY / 150));
    setSwipeProgress(progress);
  }, []);

  const handleTouchEnd = useCallback(() => {
    const deltaX = horizontalDelta.current;
    const deltaY = verticalDelta.current;

    /*
      Instagramdagi kabi: o'ngdan chapga surilsa — muallif profili ochiladi.
      Vertikal snap-scroll buzilmasligi uchun harakat aniq gorizontal
      bo'lgandagina ishlaydi.
    */
    if (deltaX < -70 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      setSwipeProgress(0);
      horizontalDelta.current = 0;
      verticalDelta.current = 0;
      openProfile(videos[activeIndex]);
      return;
    }

    /*
      Deep-link rejimida o'ngga surish orqaga qaytaradi (iOS uslubidagi
      "swipe back"), chunki bu holatda pastdagi navbar ko'rinmasligi mumkin.
    */
    if (isDeepLink && deltaX > 70 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      setSwipeProgress(0);
      horizontalDelta.current = 0;
      verticalDelta.current = 0;
      handleBack();
      return;
    }

    const swipeThreshold = 0.3;
    const timeElapsed = Date.now() - touchStartTime.current;
    const isQuickSwipe = timeElapsed < 300;

    if (Math.abs(swipeProgress) > swipeThreshold || (isQuickSwipe && Math.abs(swipeProgress) > 0.1)) {
      if (swipeProgress < 0 && activeIndex < videos.length - 1) {
        // Swipe up - next video
        const nextIndex = activeIndex + 1;
        setActiveIndex(nextIndex);
        mediumTap();
        containerRef.current?.scrollTo({
          top: nextIndex * (containerRef.current?.clientHeight || 0),
          behavior: 'smooth'
        });
      } else if (swipeProgress > 0 && activeIndex > 0) {
        // Swipe down - previous video
        const prevIndex = activeIndex - 1;
        setActiveIndex(prevIndex);
        mediumTap();
        containerRef.current?.scrollTo({
          top: prevIndex * (containerRef.current?.clientHeight || 0),
          behavior: 'smooth'
        });
      }
    }
    setSwipeProgress(0);
    horizontalDelta.current = 0;
    verticalDelta.current = 0;
  }, [swipeProgress, activeIndex, videos, mediumTap, openProfile, isDeepLink, handleBack]);

  const openComments = (videoId: string) => {
    setSelectedVideoId(videoId);
    setCommentsOpen(true);
  };

  const openShareDialog = (videoId: string) => {
    setShareVideoId(videoId);
    setShareDialogOpen(true);
  };

  const openLikesDialog = (videoId: string) => {
    setLikesVideoId(videoId);
    setLikesDialogOpen(true);
  };

  const selectedVideo = videos.find(v => v.id === selectedVideoId);
  const shareVideo = videos.find(v => v.id === shareVideoId);
  const likesVideo = videos.find(v => v.id === likesVideoId);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Watch view yopilganda feed o'sha videoga tenglashadi
  const closeWatchPanel = useCallback(() => {
    const index = videos.findIndex(v => v.id === watchVideoId);
    setWatchVideoId(null);
    if (index >= 0 && index !== activeIndex) {
      setActiveIndex(index);
      containerRef.current?.scrollTo({
        top: index * (containerRef.current?.clientHeight || 0),
        behavior: 'auto',
      });
    }
  }, [videos, watchVideoId, activeIndex]);

  // Skeleton va empty holatlarida ham tugma kerak, aks holda yuklanish
  // paytida sahifadan chiqib bo'lmaydi.
  const floatingBack = isDeepLink ? (
    <div
      className={cn(
        'absolute left-3 z-50',
        isMobile ? 'top-[calc(env(safe-area-inset-top,0px)+12px)]' : 'top-4'
      )}
    >
      <BackButton onClick={handleBack} />
    </div>
  ) : null;

  if (isLoading) {
    return (
      <div className={cn(
        "relative bg-black flex items-center justify-center",
        isMobile ? "fixed inset-0 z-40" : "h-screen w-full"
      )}>
        {floatingBack}
        <VideoSkeleton isMobile={isMobile} />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className={cn(
        "relative bg-black",
        isMobile ? "fixed inset-0 z-40" : "h-screen w-full flex items-center justify-center"
      )}>
        {floatingBack}
        <EmptyState />
      </div>
    );
  }

  return (
    <div className={cn(
      "relative bg-black",
      isMobile ? "fixed inset-0 z-40" : "h-screen w-full flex items-center justify-center"
    )}>
      {isDeepLink && (
        <div
          className={cn(
            'absolute left-3 z-50',
            isMobile
              ? 'top-[calc(env(safe-area-inset-top,0px)+12px)]'
              : 'top-4'
          )}
        >
          <BackButton onClick={handleBack} />
        </div>
      )}

      <div
        ref={containerRef}
        className={cn(
          "h-full w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide overscroll-contain transition-[padding] duration-300 ease-out",
          !isMobile && commentsOpen && "pr-[min(430px,38vw)]",
        )}
        style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {videos.map((video, index) => {
          // Virtualizatsiya: faqat aktiv va uning qo'shnilari haqiqiy pleyer.
          const isMounted = Math.abs(index - activeIndex) <= RENDER_WINDOW;

          return (
            <div key={video.id} className="h-full w-full flex items-center justify-center" style={{ scrollSnapAlign: 'start' }}>
              {isMounted ? (
                <VideoCard
                  video={video}
                  isActive={index === activeIndex && !watchVideoId}
                  onLike={() => likeVideo(video.id)}
                  onBookmark={() => toggleBookmark(video.id)}
                  onCommentClick={() => openComments(video.id)}
                  onShareClick={() => openShareDialog(video.id)}
                  onLikesClick={() => openLikesDialog(video.id)}
                  onProfileClick={() => openProfile(video)}
                  onWatchClick={() => setWatchVideoId(video.id)}
                  isMobile={isMobile}
                  globalMuted={globalMuted}
                  onMuteToggle={handleMuteToggle}
                />
              ) : (
                <VideoPlaceholder video={video} isMobile={isMobile} />
              )}
            </div>
          );
        })}
      </div>

      {/* YouTube uslubidagi watch ekrani: tepada video, pastda boshqa videolar */}
      {watchVideoId && (
        <VideoWatchPanel
          videos={videos}
          activeVideoId={watchVideoId}
          onSelectVideo={(id) => setWatchVideoId(id)}
          onClose={closeWatchPanel}
          onLike={(id) => likeVideo(id)}
          onBookmark={(id) => toggleBookmark(id)}
          onShare={(item) => openShareDialog(item.id)}
          onComments={(item) => openComments(item.id)}
          onOpenProfile={(item) => openProfile(item)}
        />
      )}

      {/* Comments Sheet */}
      <VideoCommentsSheet
        isOpen={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={selectedVideoId || ''}
        commentsCount={selectedVideo?.comments_count || 0}
      />

      {/* Share Dialog */}
      <SharePostDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        postId={shareVideoId || ''}
        postContent={shareVideo?.content || undefined}
      />

      {/* Likes + Views Tabbed Dialog */}
      <PostLikesViewsDialog
        postId={likesVideoId || ''}
        open={likesDialogOpen}
        onOpenChange={setLikesDialogOpen}
        likesCount={likesVideo?.likes_count || 0}
        viewsCount={likesVideo?.views_count || 0}
      />
    </div>
  );
}
