import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bookmark,
  Heart,
  Maximize2,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Repeat2,
  Send,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useVideoPosts, VideoPost } from '@/hooks/useVideoPosts';
import { usePostViews } from '@/hooks/usePostViews';
import { useVideoPlayerContext } from '@/contexts/VideoPlayerContext';
import { VideoCommentsSheet } from '@/components/VideoCommentsSheet';
import { PostLikesViewsDialog } from '@/components/PostLikesViewsDialog';
import { SharePostDialog } from '@/components/SharePostDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { VerifiedBadge } from '@/components/VerifiedBadge';

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value || 0);
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

type LikeBurst = { x: number; y: number; key: number } | null;

type VideoCardProps = {
  video: VideoPost;
  isActive: boolean;
  isMobile: boolean;
  muted: boolean;
  volume: number;
  onMutedChange: (muted: boolean) => void;
  onVolumeChange: (volume: number) => void;
  onLike: () => void;
  onBookmark: () => void;
  onComment: () => void;
  onShare: () => void;
  onLikes: () => void;
};

function VideoCard({
  video,
  isActive,
  isMobile,
  muted,
  volume,
  onMutedChange,
  onVolumeChange,
  onLike,
  onBookmark,
  onComment,
  onShare,
  onLikes,
}: VideoCardProps) {
  const navigate = useNavigate();
  const { lightTap, successFeedback } = useHapticFeedback();
  const { recordView } = usePostViews();
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ at: number; id: string } | null>(null);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlaybackFeedback, setShowPlaybackFeedback] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [likeBurst, setLikeBurst] = useState<LikeBurst>(null);

  const videoUrl = video.media_urls?.[0] || '';

  const showFeedback = useCallback(() => {
    setShowPlaybackFeedback(true);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setShowPlaybackFeedback(false), 450);
  }, []);

  const playElement = useCallback(async (element: HTMLVideoElement | null) => {
    if (!element) return false;
    if (element.ended) element.currentTime = 0;
    try {
      await element.play();
      return true;
    } catch {
      return false;
    }
  }, []);

  const toggleMainPlayback = useCallback(async () => {
    const element = videoRef.current;
    if (!element) return;
    lightTap();
    if (element.paused || element.ended) await playElement(element);
    else element.pause();
    showFeedback();
  }, [lightTap, playElement, showFeedback]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    if (!isActive || previewOpen) {
      element.pause();
      return;
    }

    void playElement(element);
    recordView(video.id);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isActive && !previewOpen) {
        void playElement(element);
      } else if (document.visibilityState === 'hidden') {
        element.pause();
      }
    };

    window.addEventListener('focus', onVisibilityChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onVisibilityChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      element.pause();
    };
  }, [isActive, playElement, previewOpen, recordView, video.id]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.muted = muted;
    element.volume = volume;
  }, [muted, volume]);

  useEffect(() => () => {
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
  }, []);

  const triggerDoubleTapLike = useCallback((x: number, y: number) => {
    successFeedback();
    if (!video.is_liked) onLike();
    setLikeBurst({ x, y, key: Date.now() });
    setTimeout(() => setLikeBurst(null), 720);
  }, [onLike, successFeedback, video.is_liked]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLVideoElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLVideoElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) return;

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance > 14) return;

    const now = Date.now();
    const previous = lastTapRef.current;
    const isDoubleTap = previous?.id === video.id && now - previous.at <= 285;

    if (isDoubleTap) {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
      lastTapRef.current = null;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      triggerDoubleTapLike(event.clientX - rect.left, event.clientY - rect.top);
      return;
    }

    lastTapRef.current = { at: now, id: video.id };
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      void toggleMainPlayback();
      singleTapTimerRef.current = null;
    }, 235);
  }, [toggleMainPlayback, triggerDoubleTapLike, video.id]);

  const seekTo = useCallback((ratio: number) => {
    const element = videoRef.current;
    if (!element || !element.duration) return;
    element.currentTime = Math.min(1, Math.max(0, ratio)) * element.duration;
    setCurrentTime(element.currentTime);
  }, []);

  const openProfile = useCallback(() => {
    const username = video.profile?.username;
    if (!username) return;
    navigate(`/user/${encodeURIComponent(username)}`);
  }, [navigate, video.profile?.username]);

  const openPreview = useCallback(() => {
    videoRef.current?.pause();
    setPreviewPlaying(true);
    setPreviewOpen(true);
  }, []);

  const closePreview = useCallback(() => {
    previewRef.current?.pause();
    setPreviewOpen(false);
  }, []);

  const togglePreviewPlayback = useCallback(async () => {
    const element = previewRef.current;
    if (!element) return;
    if (element.paused || element.ended) await playElement(element);
    else element.pause();
  }, [playElement]);

  const handleLikeButton = useCallback(() => {
    successFeedback();
    onLike();
  }, [onLike, successFeedback]);

  return (
    <div className="relative flex h-full w-full snap-start snap-always items-center justify-center bg-black">
      <div className={cn(
        'relative h-full w-full overflow-hidden bg-black',
        !isMobile && 'max-w-[430px] rounded-2xl shadow-2xl',
      )}>
        <video
          ref={videoRef}
          src={videoUrl}
          className="absolute inset-0 h-full w-full select-none object-contain bg-black touch-manipulation"
          loop
          muted={muted}
          playsInline
          preload={isActive ? 'auto' : 'metadata'}
          poster={video.media_urls?.[1]}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { pointerStartRef.current = null; }}
          onContextMenu={(event) => event.preventDefault()}
          onLoadedMetadata={(event) => {
            setDuration(event.currentTarget.duration || 0);
            event.currentTarget.volume = volume;
            event.currentTarget.muted = muted;
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/75" />

        {(showPlaybackFeedback || !isPlaying) && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
              {isPlaying ? <Pause className="h-8 w-8" /> : <Play className="ml-1 h-8 w-8" />}
            </div>
          </div>
        )}

        {likeBurst && (
          <div
            key={likeBurst.key}
            className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 animate-in zoom-in-50 fade-in duration-150"
            style={{ left: likeBurst.x, top: likeBurst.y }}
          >
            <Heart className="h-24 w-24 fill-white text-white drop-shadow-2xl" />
          </div>
        )}

        <div className={cn(
          'absolute right-2 z-20 flex flex-col items-center gap-3 text-white',
          isMobile ? 'bottom-28' : 'bottom-20',
        )}>
          <div className="flex flex-col items-center">
            <button onClick={handleLikeButton} className="p-1.5 active:scale-90" aria-label="Like">
              <Heart className={cn('h-7 w-7', video.is_liked && 'fill-red-500 text-red-500')} />
            </button>
            <button onClick={onLikes} className="text-[11px] font-semibold tabular-nums">
              {formatNumber(video.likes_count)}
            </button>
          </div>

          <button onClick={onComment} className="flex flex-col items-center p-1.5 active:scale-90" aria-label="Comments">
            <MessageCircle className="h-7 w-7 -scale-x-100" />
            <span className="text-[11px] font-semibold tabular-nums">{formatNumber(video.comments_count)}</span>
          </button>

          <button onClick={onShare} className="p-1.5 active:scale-90" aria-label="Share">
            <Send className="h-7 w-7" />
          </button>
          <button className="p-1.5 active:scale-90" aria-label="Repost">
            <Repeat2 className="h-7 w-7" />
          </button>
          <button onClick={onBookmark} className="p-1.5 active:scale-90" aria-label="Save">
            <Bookmark className={cn('h-7 w-7', video.is_bookmarked && 'fill-white')} />
          </button>
          <button onClick={openPreview} className="p-1.5 active:scale-90" aria-label="Open large player">
            <Maximize2 className="h-6 w-6" />
          </button>
        </div>

        <div className={cn('absolute left-4 right-14 z-20 text-white', isMobile ? 'bottom-24' : 'bottom-6')}>
          <button onClick={openProfile} className="mb-2 flex max-w-full items-center gap-2.5 text-left active:opacity-75">
            <Avatar className="h-10 w-10 border border-white/25">
              <AvatarImage src={video.profile?.avatar_url || ''} />
              <AvatarFallback>{video.profile?.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 items-center gap-1.5 font-semibold">
              <span className="truncate">@{video.profile?.username || 'user'}</span>
              {video.profile?.is_verified && <VerifiedBadge size="xs" />}
            </span>
          </button>

          <div className="mb-2 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFollowing((value) => !value)}
              className="h-7 rounded-full border-white/45 bg-black/20 px-3 text-xs text-white hover:bg-white/10 hover:text-white"
            >
              {isFollowing ? 'Following' : 'Follow'}
            </Button>
          </div>

          {video.content && (
            <button
              onClick={() => setExpanded((value) => !value)}
              className="mb-2 block w-full text-left"
            >
              <p className={cn('text-[13px] leading-snug whitespace-pre-wrap break-words', !expanded && 'line-clamp-2')}>
                {video.content}
              </p>
            </button>
          )}

          <div className="flex items-center gap-2 text-[12px]">
            <Music2 className="h-3.5 w-3.5" />
            <span className="truncate">Original Sound · {video.profile?.display_name || video.profile?.username}</span>
          </div>
        </div>

        <div
          className={cn(
            'absolute left-3 right-3 z-20 transition-opacity',
            isMobile ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+82px)]' : 'bottom-1',
            isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100',
          )}
        >
          <div
            className="group flex h-4 cursor-pointer items-center"
            onPointerDown={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              seekTo((event.clientX - rect.left) / rect.width);
            }}
          >
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/25">
              <div className="h-full bg-white" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-white/90">
            <span className="tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span>
            <div className="flex-1" />
            <button
              onClick={(event) => { event.stopPropagation(); onMutedChange(!muted); }}
              className="rounded-full p-1.5"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            {!isMobile && (
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(event) => onVolumeChange(Number(event.target.value))}
                className="w-20 accent-white"
                aria-label="Volume"
              />
            )}
          </div>
        </div>
      </div>

      {previewOpen && createPortal(
        <div className="fixed inset-0 z-[45] flex flex-col bg-black text-white" onClick={(event) => event.stopPropagation()}>
          <div className="relative flex w-full flex-none items-center justify-center bg-black" style={{ aspectRatio: '16/9' }}>
            <video
              ref={previewRef}
              src={videoUrl}
              autoPlay
              playsInline
              loop={false}
              muted={muted}
              className="absolute inset-0 h-full w-full object-contain"
              onPlay={() => setPreviewPlaying(true)}
              onPause={() => setPreviewPlaying(false)}
              onEnded={() => {
                setPreviewPlaying(false);
                if (previewRef.current) previewRef.current.pause();
              }}
              onClick={() => void togglePreviewPlayback()}
            />
            <button
              onClick={closePreview}
              className="absolute left-3 top-[calc(env(safe-area-inset-top,0px)+12px)] flex h-10 w-10 items-center justify-center rounded-full bg-black/55 backdrop-blur-md"
              aria-label="Close preview"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              onClick={() => onMutedChange(!muted)}
              className="absolute right-3 top-[calc(env(safe-area-inset-top,0px)+12px)] flex h-10 w-10 items-center justify-center rounded-full bg-black/55 backdrop-blur-md"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            {!previewPlaying && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55">
                  <Play className="ml-1 h-8 w-8" />
                </div>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-background text-foreground">
            <div className="px-4 pb-3 pt-4">
              <h1 className="text-[17px] font-semibold leading-snug">
                {video.content?.split('\n')[0] || `@${video.profile?.username || 'user'}`}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">{formatNumber(video.views_count)} views</p>
            </div>

            <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide">
              <button onClick={handleLikeButton} className="flex shrink-0 items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-semibold">
                <Heart className={cn('h-4 w-4', video.is_liked && 'fill-current')} />
                {formatNumber(video.likes_count)}
              </button>
              <button onClick={onShare} className="flex shrink-0 items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-semibold">
                <Send className="h-4 w-4" /> Share
              </button>
              <button onClick={onBookmark} className="flex shrink-0 items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-semibold">
                <Bookmark className={cn('h-4 w-4', video.is_bookmarked && 'fill-current')} /> Save
              </button>
              <button onClick={onComment} className="flex shrink-0 items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-semibold">
                <MessageCircle className="h-4 w-4" /> {formatNumber(video.comments_count)}
              </button>
            </div>

            <button onClick={openProfile} className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left">
              <Avatar className="h-10 w-10">
                <AvatarImage src={video.profile?.avatar_url || ''} />
                <AvatarFallback>{video.profile?.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 font-semibold">
                  <span className="truncate">{video.profile?.display_name || video.profile?.username}</span>
                  {video.profile?.is_verified && <VerifiedBadge size="xs" />}
                </div>
                <span className="text-xs text-muted-foreground">@{video.profile?.username}</span>
              </div>
            </button>

            {video.content && (
              <div className="border-t border-border px-4 py-3 text-sm whitespace-pre-wrap break-words">
                {video.content}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function LoadingVideos({ isMobile }: { isMobile: boolean }) {
  return (
    <div className={cn('flex items-center justify-center bg-black', isMobile ? 'fixed inset-0 z-40' : 'h-screen w-full')}>
      <div className={cn('relative h-full w-full', !isMobile && 'max-w-[430px] rounded-2xl overflow-hidden')}>
        <Skeleton className="absolute inset-0 bg-muted/20" />
      </div>
    </div>
  );
}

function EmptyVideos({ isMobile }: { isMobile: boolean }) {
  return (
    <div className={cn('flex items-center justify-center bg-black text-white', isMobile ? 'fixed inset-0 z-40' : 'h-screen w-full')}>
      <div className="text-center">
        <Play className="mx-auto mb-3 h-12 w-12 text-white/55" />
        <p className="font-semibold">Hozircha video yo‘q</p>
      </div>
    </div>
  );
}

export default function VideosPageProfessional() {
  const isMobile = useIsMobile();
  const { videos, isLoading, likeVideo, toggleBookmark } = useVideoPosts();
  const { isMuted, volume, setMuted, setVolume } = useVideoPlayerContext();
  const { mediumTap } = useHapticFeedback();
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentsVideoId, setCommentsVideoId] = useState<string | null>(null);
  const [shareVideoId, setShareVideoId] = useState<string | null>(null);
  const [likesVideoId, setLikesVideoId] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container || !container.clientHeight) return;
      const nextIndex = Math.max(0, Math.min(videos.length - 1, Math.round(container.scrollTop / container.clientHeight)));
      setActiveIndex((previous) => {
        if (previous !== nextIndex) mediumTap();
        return nextIndex;
      });
    });
  }, [mediumTap, videos.length]);

  useEffect(() => () => {
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
  }, []);

  useEffect(() => {
    const restorePlayback = () => {
      if (document.visibilityState === 'visible') {
        containerRef.current?.dispatchEvent(new Event('scroll'));
      }
    };
    window.addEventListener('pageshow', restorePlayback);
    window.addEventListener('focus', restorePlayback);
    return () => {
      window.removeEventListener('pageshow', restorePlayback);
      window.removeEventListener('focus', restorePlayback);
    };
  }, []);

  if (isLoading) return <LoadingVideos isMobile={isMobile} />;
  if (!videos.length) return <EmptyVideos isMobile={isMobile} />;

  const commentsVideo = videos.find((item) => item.id === commentsVideoId);
  const shareVideo = videos.find((item) => item.id === shareVideoId);
  const likesVideo = videos.find((item) => item.id === likesVideoId);

  return (
    <div className={cn('bg-black', isMobile ? 'fixed inset-0 z-40' : 'h-screen w-full')}>
      <div className="pointer-events-none absolute right-3 top-[calc(env(safe-area-inset-top,0px)+12px)] z-[45]">
        <button
          onClick={() => setMuted(!isMuted)}
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md ring-1 ring-white/10 active:scale-90"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory overscroll-contain scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch', scrollSnapType: 'y mandatory' }}
      >
        {videos.map((video, index) => (
          <div key={video.id} className="h-full w-full snap-start" style={{ scrollSnapAlign: 'start' }}>
            <VideoCard
              video={video}
              isActive={index === activeIndex}
              isMobile={isMobile}
              muted={isMuted}
              volume={volume}
              onMutedChange={setMuted}
              onVolumeChange={setVolume}
              onLike={() => void likeVideo(video.id)}
              onBookmark={() => toggleBookmark(video.id)}
              onComment={() => {
                setCommentsVideoId(video.id);
                setCommentsOpen(true);
              }}
              onShare={() => {
                setShareVideoId(video.id);
                setShareOpen(true);
              }}
              onLikes={() => {
                setLikesVideoId(video.id);
                setLikesOpen(true);
              }}
            />
          </div>
        ))}
      </div>

      <VideoCommentsSheet
        isOpen={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={commentsVideoId || ''}
        commentsCount={commentsVideo?.comments_count || 0}
      />

      <SharePostDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        postId={shareVideoId || ''}
        postContent={shareVideo?.content || undefined}
      />

      <PostLikesViewsDialog
        postId={likesVideoId || ''}
        open={likesOpen}
        onOpenChange={setLikesOpen}
        likesCount={likesVideo?.likes_count || 0}
        viewsCount={likesVideo?.views_count || 0}
      />
    </div>
  );
}
