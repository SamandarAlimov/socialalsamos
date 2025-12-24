import { useState, useRef, useEffect, useCallback } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, Music2, Volume2, VolumeX, Play, Pause, Repeat2, UserPlus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useVideoPosts, VideoPost } from '@/hooks/useVideoPosts';
import { Skeleton } from '@/components/ui/skeleton';

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
}

function VideoCard({ video, isActive, onLike, onBookmark }: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
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
    if (!videoRef.current) return;
    
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
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

  const handleShare = () => {
    lightTap();
  };

  const handleRepost = () => {
    lightTap();
  };

  return (
    <div className="relative h-full w-full bg-black flex items-center justify-center snap-start snap-always">
      {/* Video Container - Fixed aspect ratio for desktop/tablet */}
      <div className="relative h-full w-full md:h-full md:w-auto md:aspect-[9/16] md:max-h-[calc(100vh-5rem)] lg:max-h-[calc(100vh-4rem)]">
        {/* Video */}
        <video
          ref={videoRef}
          src={videoUrl}
          className="absolute inset-0 h-full w-full object-cover md:rounded-xl"
          loop
          muted={isMuted}
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
          <div className="h-20 w-20 rounded-full bg-black/40 flex items-center justify-center">
            {isPlaying ? (
              <Pause className="h-10 w-10 text-white" />
            ) : (
              <Play className="h-10 w-10 text-white ml-1" />
            )}
          </div>
        </div>

        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 pointer-events-none md:rounded-xl" />

        {/* Mute button */}
        <button
          onClick={toggleMute}
          className="absolute top-4 right-4 h-10 w-10 rounded-full bg-black/40 flex items-center justify-center active:scale-95 transition-transform"
        >
          {isMuted ? (
            <VolumeX className="h-5 w-5 text-white" />
          ) : (
            <Volume2 className="h-5 w-5 text-white" />
          )}
        </button>

        {/* Right side actions */}
        <div className="absolute right-3 bottom-28 md:bottom-24 flex flex-col items-center gap-4">
          {/* Like */}
          <button 
            onClick={handleLike}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          >
            <div className={cn(
              "h-11 w-11 rounded-full bg-black/40 flex items-center justify-center",
              video.is_liked && "text-red-500"
            )}>
              <Heart className={cn("h-6 w-6", video.is_liked && "fill-current")} />
            </div>
            <span className="text-white text-xs font-medium">{formatNumber(video.likes_count || 0)}</span>
          </button>

          {/* Comments */}
          <button className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
            <div className="h-11 w-11 rounded-full bg-black/40 flex items-center justify-center text-white">
              <MessageCircle className="h-6 w-6" />
            </div>
            <span className="text-white text-xs font-medium">{formatNumber(video.comments_count || 0)}</span>
          </button>

          {/* Bookmark */}
          <button 
            onClick={handleBookmark}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          >
            <div className={cn(
              "h-11 w-11 rounded-full bg-black/40 flex items-center justify-center text-white",
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
            <div className="h-11 w-11 rounded-full bg-black/40 flex items-center justify-center text-white">
              <Share2 className="h-6 w-6" />
            </div>
            <span className="text-white text-xs font-medium">{formatNumber(video.shares_count || 0)}</span>
          </button>

          {/* Repost */}
          <button 
            onClick={handleRepost}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          >
            <div className="h-11 w-11 rounded-full bg-black/40 flex items-center justify-center text-white">
              <Repeat2 className="h-6 w-6" />
            </div>
          </button>
        </div>

        {/* Bottom info - User info and description */}
        <div className="absolute left-4 right-20 bottom-6 md:bottom-4">
          {/* User info with follow button */}
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-10 w-10 border-2 border-white">
              <AvatarImage src={video.profile?.avatar_url || ''} />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {video.profile?.display_name?.[0] || video.profile?.username?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-sm">
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
                  "h-7 px-3 text-xs font-semibold rounded-md border-white/30",
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
            <p className="text-white text-sm mb-2 line-clamp-2">{video.content}</p>
          )}
          
          {/* Music/Sound */}
          <div className="flex items-center gap-2">
            <Music2 className="h-4 w-4 text-white animate-spin" style={{ animationDuration: '3s' }} />
            <span className="text-white text-xs">Original Sound - {video.profile?.display_name || video.profile?.username}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoSkeleton() {
  return (
    <div className="relative h-full w-full bg-black flex items-center justify-center">
      <div className="relative h-full w-full md:h-full md:w-auto md:aspect-[9/16] md:max-h-[calc(100vh-5rem)]">
        <Skeleton className="absolute inset-0 bg-muted/20 md:rounded-xl" />
        <div className="absolute right-3 bottom-28 flex flex-col items-center gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-11 w-11 rounded-full bg-muted/20" />
          ))}
        </div>
        <div className="absolute left-4 right-20 bottom-6">
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="h-10 w-10 rounded-full bg-muted/20" />
            <Skeleton className="h-4 w-24 bg-muted/20" />
            <Skeleton className="h-7 w-16 rounded-md bg-muted/20" />
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
  const { videos, isLoading, likeVideo, toggleBookmark } = useVideoPosts();
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { mediumTap } = useHapticFeedback();

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)] overflow-hidden bg-black flex items-center justify-center">
        <VideoSkeleton />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)] overflow-hidden">
        <EmptyState />
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)] overflow-y-scroll snap-y snap-mandatory scrollbar-hide bg-black"
      style={{ scrollSnapType: 'y mandatory' }}
    >
      {videos.map((video, index) => (
        <div key={video.id} className="h-full w-full" style={{ scrollSnapAlign: 'start' }}>
          <VideoCard
            video={video}
            isActive={index === activeIndex}
            onLike={() => likeVideo(video.id)}
            onBookmark={() => toggleBookmark(video.id)}
          />
        </div>
      ))}
    </div>
  );
}
