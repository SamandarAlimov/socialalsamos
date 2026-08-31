import { useState, useRef, useEffect, useCallback } from 'react';
import { Heart, MessageCircle, Send, Bookmark, Music2, Volume2, VolumeX, Play, Pause, Repeat2, ArrowLeft, Maximize2, Minimize2, ListVideo } from 'lucide-react';
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
import { formatCompactNumber, formatMediaTime, resolveAspectKind } from '@/lib/videoFormat';

interface VideoCardProps {
  video: VideoPost;
  isActive: boolean;
  onLike: () => void;
  onBookmark: () => void;
  onCommentClick: () => void;
  onShareClick: () => void;
  onLikesClick: () => void;
  onWatchClick: () => void;
  onProfileClick: () => void;
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
  onWatchClick,
  onProfileClick,
  isMobile,
  globalMuted,
  onMuteToggle,
}: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [showControls, setShowControls] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [seekHint, setSeekHint] = useState<null | 'forward' | 'backward'>(null);
  const { t } = useTranslation();
  const { lightTap, successFeedback } = useHapticFeedback();
  const { recordView } = usePostViews();
  const heatmap = useVideoHeatmap(video.id, 48);

  // Record view when video becomes active
  useEffect(() => {
    if (isActive) {
      recordView(video.id);
    }
  }, [isActive, video.id, recordView]);

  const videoUrl = video.media_urls?.[0] || '';
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
    }
  }, [isActive]);

  // Sync mute state with global
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = globalMuted;
    }
  }, [globalMuted]);

  // Keep playbackRate + volume applied
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setShowControls(false), 2800);
  }, []);

  useEffect(() => () => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
  }, []);

  const togglePlay = () => {
    lightTap();
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
    setShowPlayButton(true);
    revealControls();
    setTimeout(() => setShowPlayButton(false), 500);
  };

  const seekBy = useCallback((seconds: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = Math.min(Math.max(0, el.currentTime + seconds), el.duration || 0);
    setSeekHint(seconds > 0 ? 'forward' : 'backward');
    setTimeout(() => setSeekHint(null), 450);
    revealControls();
  }, [revealControls]);

  const handleSeek = useCallback((time: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = time;
    setCurrentTime(time);
  }, []);

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
  }, [isActive, seekBy, toggleFullscreen, onMuteToggle]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    lightTap();
    onMuteToggle();
  };

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

  return (
    <div className="relative h-full w-full bg-black flex items-center justify-center snap-start snap-always">
      {/* Video Container — size adapts to the source aspect ratio */}
      <div
        ref={frameRef}
        onMouseMove={revealControls}
        onMouseLeave={() => setShowControls(false)}
        className={cn(
          "relative bg-black",
          isMobile
            ? "h-full w-full"
            : cn(
                "overflow-hidden rounded-2xl shadow-2xl",
                isLandscape
                  ? "w-full max-w-[min(1100px,92vw)] max-h-[82vh] aspect-video"
                  : isSquareish
                    ? "h-auto w-full max-w-[min(620px,92vw)] max-h-[82vh] aspect-square"
                    : "h-full w-full max-w-[400px] aspect-[9/16]"
              )
        )}
      >
        {/*
          Instagram Reels uslubi: 16:9 yoki 1:1 video 9:16 ekranda qora
          bo'shliq qoldirmasligi uchun orqa fonda blur qilingan nusxa turadi.
        */}
        {isMobile && aspect !== null && aspectKind !== 'portrait' && videoUrl && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            <video
              src={videoUrl}
              muted
              playsInline
              className="h-full w-full scale-110 object-cover opacity-45 blur-2xl"
              ref={(el) => {
                if (!el) return;
                if (isActive) el.play().catch(() => {});
                else el.pause();
              }}
              loop
            />
          </div>
        )}

        {/* Video */}
        <video
          ref={videoRef}
          src={videoUrl}
          className="absolute inset-0 h-full w-full object-contain"
          loop
          muted={globalMuted}
          playsInline
          onClick={togglePlay}
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
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          poster={video.media_urls?.[1]}
        />

        {/* Play/Pause Overlay */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300",
            showPlayButton ? "opacity-100" : "opacity-0"
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

        {/* Full player controls (YouTube-style) */}
        <div
          className={cn(
            "absolute left-0 right-0 z-20 px-3 transition-opacity duration-200",
            isMobile ? "bottom-[calc(env(safe-area-inset-bottom,0px)+82px)]" : "bottom-0 pb-2",
            showControls || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Timeline: kadr preview + "eng ko'p ko'rilgan" grafigi bilan */}
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
          />

          {/* Control row */}
          <div className="flex items-center gap-2 pt-1 text-white">
            <button onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'} className="p-1 active:scale-90 transition-transform">
              {isPlaying ? <Pause className="h-4.5 w-4.5" /> : <Play className="h-4.5 w-4.5" />}
            </button>
            <button onClick={toggleMute} aria-label="Mute" className="p-1 active:scale-90 transition-transform">
              {globalMuted ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
            </button>
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
                className="w-20 accent-primary h-1 cursor-pointer"
              />
            )}
            <span className="text-[11px] tabular-nums text-white/85 ml-0.5">
              {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
            </span>
            <div className="flex-1" />
            <button
              onClick={() => setSpeed((s) => (s >= 2 ? 0.5 : Number((s + 0.25).toFixed(2))))}
              className="px-2 py-0.5 rounded-md bg-white/15 text-[11px] font-semibold tabular-nums active:scale-95 transition-transform"
              aria-label="Playback speed"
            >
              {speed}x
            </button>
            <button onClick={toggleFullscreen} aria-label="Fullscreen" className="p-1 active:scale-90 transition-transform">
              {isFullscreen ? <Minimize2 className="h-4.5 w-4.5" /> : <Maximize2 className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>

        {/* Right side actions - Instagram-style, compact so they don't block the video */}
        <div className={cn(
          "absolute right-1.5 flex flex-col items-center gap-3 z-10",
          isMobile ? "bottom-28" : "bottom-20"
        )}>
          {/* Like (with views nested Instagram-style) */}
          <div className="flex flex-col items-center gap-0.5">
            <button
              onClick={handleLike}
              className="p-1.5 active:scale-90 transition-transform"
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
              className="flex flex-col items-center -mt-1 active:opacity-70"
            >
              <span className="text-white text-[10px] font-semibold tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] leading-tight">
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
              className="p-1.5 active:scale-90 transition-transform"
              aria-label="Comments"
            >
              <MessageCircle
                className="h-6 w-6 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] -scale-x-100"
                strokeWidth={1.8}
              />
            </button>
            <span className="text-white text-[10px] font-semibold tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] -mt-1">
              {formatCompactNumber(video.comments_count || 0)}
            </span>
          </div>

          {/* Share */}
          <div className="flex flex-col items-center gap-0.5">
            <button
              onClick={handleShare}
              className="p-1.5 active:scale-90 transition-transform"
              aria-label="Share"
            >
              <Send
                className="h-6 w-6 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                strokeWidth={1.8}
              />
            </button>
            {(video.shares_count || 0) > 0 && (
              <span className="text-white text-[10px] font-semibold tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] -mt-1">
                {formatCompactNumber(video.shares_count || 0)}
              </span>
            )}
          </div>

          {/* Repost */}
          <button
            onClick={handleRepost}
            className="p-1.5 active:scale-90 transition-transform"
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
            className="p-1.5 active:scale-90 transition-transform"
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

          {/* YouTube-style watch view: video tepada, pastda boshqa videolar */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              lightTap();
              if (videoRef.current) videoRef.current.pause();
              onWatchClick();
            }}
            className="p-1.5 active:scale-90 transition-transform"
            aria-label="Boshqa videolarni ko'rish"
          >
            <ListVideo
              className="h-6 w-6 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
              strokeWidth={1.8}
            />
          </button>
        </div>

        {/* Bottom info - User info and description */}
        <div className={cn(
          "absolute left-4 right-14",
          isMobile ? "bottom-24" : "bottom-6"
        )}>
          {/* User info with follow button */}
          <div className="flex items-center gap-2.5 mb-2">
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
              className="flex items-center gap-1.5 min-w-0"
            >
              <span className="text-white font-semibold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] truncate">
                @{video.profile?.username || 'user'}
              </span>
              {video.profile?.is_verified && <VerifiedBadge size="xs" />}
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFollow}
              className={cn(
                "h-7 px-3 text-xs font-semibold rounded-md border ml-1 shrink-0",
                isFollowing
                  ? "bg-transparent text-white border-white/40 hover:bg-white/10"
                  : "bg-transparent text-white border-white hover:bg-white/10"
              )}
            >
              {isFollowing ? t('common.following', 'Following') : t('common.follow', 'Follow')}
            </Button>
          </div>

          {/* Description - tap text to toggle; expanded becomes scrollable card */}
          {video.content && (
            <div className="mb-2">
              {expanded ? (
                <div
                  className="bg-black/55 backdrop-blur-md rounded-xl px-3 py-2.5 ring-1 ring-white/10"
                  onClick={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                >
                  <div
                    className="text-white text-[13px] leading-relaxed whitespace-pre-wrap break-words overflow-y-auto overscroll-contain pr-1 scrollbar-hide"
                    style={{ maxHeight: '40vh', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                  >
                    {video.content}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(false);
                    }}
                    className="text-white/70 text-[12px] font-medium mt-1.5 active:opacity-70"
                  >
                    {t('common.less', 'less')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (video.content && video.content.length > 80) setExpanded(true);
                  }}
                  className="text-left w-full"
                >
                  <p className="text-white text-[13px] leading-snug drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] whitespace-pre-wrap break-words line-clamp-2">
                    {video.content}
                    {video.content.length > 80 && (
                      <span className="text-white/80 font-semibold ml-1">… {t('common.more', 'more')}</span>
                    )}
                  </p>
                </button>
              )}
            </div>
          )}

          {/* Music/Sound */}
          <div className="flex items-center gap-2">
            <Music2 className="h-3.5 w-3.5 text-white animate-spin" style={{ animationDuration: '3s' }} />
            <span className="text-white text-[12px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] truncate">
              Original Sound · {video.profile?.display_name || video.profile?.username}
            </span>
          </div>
        </div>
      </div>
    </div>
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
  const { videos, isLoading, likeVideo, toggleBookmark } = useVideoPosts();
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
  }, [swipeProgress, activeIndex, videos, mediumTap, openProfile]);

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

  if (isLoading) {
    return (
      <div className={cn(
        "bg-black flex items-center justify-center",
        isMobile ? "fixed inset-0 z-40" : "h-screen w-full"
      )}>
        <VideoSkeleton isMobile={isMobile} />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className={cn(
        "bg-black",
        isMobile ? "fixed inset-0 z-40" : "h-screen w-full flex items-center justify-center"
      )}>
        <EmptyState />
      </div>
    );
  }

  // Deep-link detection: show back button only when arriving directly at a specific post
  const isDeepLink = Boolean(
    searchParams.get('v') || searchParams.get('post') || searchParams.get('id')
  );

  return (
    <div className={cn(
      "bg-black",
      isMobile ? "fixed inset-0 z-40" : "h-screen w-full flex items-center justify-center"
    )}>
      {/* Page-level header controls */}
      <div
        className={cn(
          "absolute left-0 right-0 z-50 flex items-center justify-between px-3 pointer-events-none",
          isMobile ? "top-[calc(env(safe-area-inset-top,0px)+12px)]" : "top-4"
        )}
      >
        {/* Back — only shown on deep-link entry */}
        <div className="pointer-events-auto">
          {isMobile && isDeepLink ? (
            <button
              onClick={() => navigate(-1)}
              aria-label="Back"
              className="h-9 w-9 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center active:scale-90 transition-all ring-1 ring-white/10"
            >
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>
          ) : (
            <div className="h-9 w-9" />
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {/* Watch view — YouTube uslubidagi ro'yxatli ko'rinish */}
          <button
            onClick={() => {
              lightTap();
              setWatchVideoId(videos[activeIndex]?.id ?? null);
            }}
            aria-label="Watch view"
            className="h-9 w-9 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center active:scale-90 transition-all ring-1 ring-white/10"
          >
            <ListVideo className="h-4.5 w-4.5 text-white" strokeWidth={2} />
          </button>

          {/* Global Mute */}
          <button
            onClick={handleMuteToggle}
            aria-label={globalMuted ? 'Unmute' : 'Mute'}
            className="h-9 w-9 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center active:scale-90 transition-all ring-1 ring-white/10"
          >
            {globalMuted ? (
              <VolumeX className="h-4.5 w-4.5 text-white" strokeWidth={2} />
            ) : (
              <Volume2 className="h-4.5 w-4.5 text-white" strokeWidth={2} />
            )}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide overscroll-contain"
        style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {videos.map((video, index) => (
          <div key={video.id} className="h-full w-full flex items-center justify-center" style={{ scrollSnapAlign: 'start' }}>

            <VideoCard
              video={video}
              isActive={index === activeIndex && !watchVideoId}
              onLike={() => likeVideo(video.id)}
              onBookmark={() => toggleBookmark(video.id)}
              onCommentClick={() => openComments(video.id)}
              onShareClick={() => openShareDialog(video.id)}
              onLikesClick={() => openLikesDialog(video.id)}
              onWatchClick={() => setWatchVideoId(video.id)}
              onProfileClick={() => openProfile(video)}
              isMobile={isMobile}
              globalMuted={globalMuted}
              onMuteToggle={handleMuteToggle}
            />
          </div>
        ))}
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
