import { useState, useRef, useEffect, useCallback } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, Music2, Volume2, VolumeX, Play, Pause, Repeat2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useVideoPosts, VideoPost } from '@/hooks/useVideoPosts';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoCommentsSheet } from '@/components/VideoCommentsSheet';
import { PostLikesDialog } from '@/components/PostLikesDialog';
import { SharePostDialog } from '@/components/SharePostDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StoryAvatar } from '@/components/stories/StoryAvatar';

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

interface VideoCardProps {
  video: VideoPost;
  isActive: boolean;
  onLike: () => void;
  onBookmark: () => void;
  onCommentClick: () => void;
  onShareClick: () => void;
  onLikesClick: () => void;
  isMobile: boolean;
  globalMuted: boolean;
  onMuteToggle: () => void;
}

function VideoCard({ video, isActive, onLike, onBookmark, onCommentClick, onShareClick, onLikesClick, isMobile, globalMuted, onMuteToggle }: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const { lightTap, successFeedback } = useHapticFeedback();

  const videoUrl = video.media_urls?.[0] || '';

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
    setTimeout(() => setShowPlayButton(false), 500);
  };

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
      {/* Video Container */}
      <div className={cn(
        "relative h-full w-full",
        !isMobile && "max-w-[400px] aspect-[9/16] rounded-2xl overflow-hidden shadow-2xl"
      )}>
        {/* Video */}
        <video
          ref={videoRef}
          src={videoUrl}
          className="absolute inset-0 h-full w-full object-cover"
          loop
          muted={globalMuted}
          playsInline
          onClick={togglePlay}
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

        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70 pointer-events-none" />

        {/* Mute button - positioned below mobile header safe area */}
        <button
          onClick={toggleMute}
          className={cn(
            "absolute right-4 h-10 w-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center active:scale-95 transition-transform z-10",
            isMobile ? "top-16" : "top-4"
          )}
        >
          {globalMuted ? (
            <VolumeX className="h-5 w-5 text-white" />
          ) : (
            <Volume2 className="h-5 w-5 text-white" />
          )}
        </button>

        {/* Right side actions */}
        <div className={cn(
          "absolute right-3 flex flex-col items-center gap-5",
          isMobile ? "bottom-24" : "bottom-20"
        )}>
          {/* Like */}
          <button 
            onClick={handleLike}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          >
            <div className={cn(
              "h-12 w-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10",
              video.is_liked && "text-red-500"
            )}>
              <Heart className={cn("h-6 w-6", video.is_liked && "fill-current")} />
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLikesClick();
              }}
              className="text-white text-xs font-medium drop-shadow-lg hover:underline"
            >
              {formatNumber(video.likes_count || 0)}
            </button>
          </button>

          {/* Comments */}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              lightTap();
              onCommentClick();
            }}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          >
            <div className="h-12 w-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white border border-white/10">
              <MessageCircle className="h-6 w-6" />
            </div>
            <span className="text-white text-xs font-medium drop-shadow-lg">{formatNumber(video.comments_count || 0)}</span>
          </button>

          {/* Bookmark */}
          <button 
            onClick={handleBookmark}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          >
            <div className={cn(
              "h-12 w-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white border border-white/10",
              video.is_bookmarked && "text-yellow-400"
            )}>
              <Bookmark className={cn("h-6 w-6", video.is_bookmarked && "fill-current")} />
            </div>
          </button>

          {/* Share */}
          <button 
            onClick={handleShare}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          >
            <div className="h-12 w-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white border border-white/10">
              <Share2 className="h-6 w-6" />
            </div>
            <span className="text-white text-xs font-medium drop-shadow-lg">{formatNumber(video.shares_count || 0)}</span>
          </button>

          {/* Repost */}
          <button 
            onClick={handleRepost}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          >
            <div className="h-12 w-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white border border-white/10">
              <Repeat2 className="h-6 w-6" />
            </div>
          </button>
        </div>

        {/* Bottom info - User info and description */}
        <div className={cn(
          "absolute left-4 right-20",
          isMobile ? "bottom-20" : "bottom-6"
        )}>
          {/* User info with follow button */}
          <div className="flex items-center gap-3 mb-3">
            <StoryAvatar
              userId={video.profile?.id || video.user_id}
              username={video.profile?.username}
              displayName={video.profile?.display_name}
              avatarUrl={video.profile?.avatar_url}
              isVerified={!!video.profile?.is_verified}
              size="md"
              showRing
            />
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-sm drop-shadow-lg">
                @{video.profile?.username || 'user'}
              </span>
              {video.profile?.is_verified && (
                <span className="h-4 w-4 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] text-white">✓</span>
                </span>
              )}
              <span className="text-white/60 mx-1">•</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFollow}
                className={cn(
                  "h-7 px-3 text-xs font-semibold rounded-full border-white/30",
                  isFollowing 
                    ? "bg-white/10 text-white hover:bg-white/20" 
                    : "bg-white text-black hover:bg-white/90"
                )}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </Button>
            </div>
          </div>
          
          {/* Description */}
          {video.content && (
            <p className="text-white text-sm mb-2 line-clamp-2 drop-shadow-lg">{video.content}</p>
          )}
          
          {/* Music/Sound */}
          <div className="flex items-center gap-2">
            <Music2 className="h-4 w-4 text-white animate-spin" style={{ animationDuration: '3s' }} />
            <span className="text-white text-xs drop-shadow-lg">Original Sound - {video.profile?.display_name || video.profile?.username}</span>
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
  const [globalMuted, setGlobalMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const { mediumTap } = useHapticFeedback();
  
  // Touch gesture tracking
  const touchStartY = useRef<number>(0);
  const touchStartTime = useRef<number>(0);
  const [swipeProgress, setSwipeProgress] = useState(0);

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
    touchStartTime.current = Date.now();
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const deltaY = e.touches[0].clientY - touchStartY.current;
    const progress = Math.max(-1, Math.min(1, deltaY / 150));
    setSwipeProgress(progress);
  }, []);

  const handleTouchEnd = useCallback(() => {
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
  }, [swipeProgress, activeIndex, videos.length, mediumTap]);

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

  return (
    <div className={cn(
      "bg-black",
      isMobile ? "fixed inset-0 z-40" : "h-screen w-full flex items-center justify-center"
    )}>
      {/* Mobile back button */}
      {isMobile && (
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 z-50 h-10 w-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
        >
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
      )}

      <div 
        ref={containerRef}
        className={cn(
          "overflow-y-scroll snap-y snap-mandatory scrollbar-hide",
          isMobile ? "h-full w-full" : "h-full w-full max-w-[400px]"
        )}
        style={{ scrollSnapType: 'y mandatory' }}
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchMove={isMobile ? handleTouchMove : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
      >
        {videos.map((video, index) => (
          <div key={video.id} className="h-full w-full" style={{ scrollSnapAlign: 'start' }}>
            <VideoCard
              video={video}
              isActive={index === activeIndex}
              onLike={() => likeVideo(video.id)}
              onBookmark={() => toggleBookmark(video.id)}
              onCommentClick={() => openComments(video.id)}
              onShareClick={() => openShareDialog(video.id)}
              onLikesClick={() => openLikesDialog(video.id)}
              isMobile={isMobile}
              globalMuted={globalMuted}
              onMuteToggle={handleMuteToggle}
            />
          </div>
        ))}
      </div>

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

      {/* Likes Dialog */}
      <PostLikesDialog
        postId={likesVideoId || ''}
        open={likesDialogOpen}
        onOpenChange={setLikesDialogOpen}
        likesCount={likesVideo?.likes_count || 0}
      />
    </div>
  );
}
