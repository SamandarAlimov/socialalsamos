import { useState, useRef, useEffect, useCallback } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, Music2, Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

interface VideoItem {
  id: string;
  videoUrl: string;
  thumbnail: string;
  user: {
    username: string;
    displayName: string;
    avatar: string;
    isVerified: boolean;
  };
  description: string;
  music: string;
  likes: number;
  comments: number;
  shares: number;
  isLiked: boolean;
  isBookmarked: boolean;
}

// Mock data for demo
const mockVideos: VideoItem[] = [
  {
    id: '1',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnail: '',
    user: {
      username: '@alex_travels',
      displayName: 'Alex Travels',
      avatar: '',
      isVerified: true,
    },
    description: 'Beautiful sunset at the beach 🌅 #travel #sunset #vibes',
    music: 'Original Sound - Alex',
    likes: 12500,
    comments: 342,
    shares: 156,
    isLiked: false,
    isBookmarked: false,
  },
  {
    id: '2',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbnail: '',
    user: {
      username: '@foodie_sam',
      displayName: 'Sam Cooks',
      avatar: '',
      isVerified: false,
    },
    description: 'Quick recipe for the best pasta ever! 🍝 #cooking #foodie #recipe',
    music: 'Cooking Vibes - Chef Mix',
    likes: 8900,
    comments: 567,
    shares: 234,
    isLiked: true,
    isBookmarked: true,
  },
  {
    id: '3',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    thumbnail: '',
    user: {
      username: '@fitness_pro',
      displayName: 'Pro Fitness',
      avatar: '',
      isVerified: true,
    },
    description: '5 minute morning workout routine 💪 #fitness #workout #motivation',
    music: 'Pump It Up - Workout Hits',
    likes: 45200,
    comments: 1230,
    shares: 890,
    isLiked: false,
    isBookmarked: false,
  },
];

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
  video: VideoItem;
  isActive: boolean;
  onLike: () => void;
  onBookmark: () => void;
}

function VideoCard({ video, isActive, onLike, onBookmark }: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const { lightTap, successFeedback } = useHapticFeedback();

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

  return (
    <div className="relative h-full w-full bg-black snap-start snap-always">
      {/* Video */}
      <video
        ref={videoRef}
        src={video.videoUrl}
        className="absolute inset-0 h-full w-full object-cover"
        loop
        muted={isMuted}
        playsInline
        onClick={togglePlay}
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
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 pointer-events-none" />

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
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5">
        {/* Profile */}
        <div className="relative">
          <Avatar className="h-12 w-12 border-2 border-white">
            <AvatarImage src={video.user.avatar} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {video.user.displayName[0]}
            </AvatarFallback>
          </Avatar>
          <button className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-6 w-6 rounded-full bg-primary text-primary-foreground text-lg flex items-center justify-center">
            +
          </button>
        </div>

        {/* Like */}
        <button 
          onClick={handleLike}
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
        >
          <div className={cn(
            "h-12 w-12 rounded-full bg-black/40 flex items-center justify-center",
            video.isLiked && "text-red-500"
          )}>
            <Heart className={cn("h-7 w-7", video.isLiked && "fill-current")} />
          </div>
          <span className="text-white text-xs font-medium">{formatNumber(video.likes)}</span>
        </button>

        {/* Comments */}
        <button className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
          <div className="h-12 w-12 rounded-full bg-black/40 flex items-center justify-center text-white">
            <MessageCircle className="h-7 w-7" />
          </div>
          <span className="text-white text-xs font-medium">{formatNumber(video.comments)}</span>
        </button>

        {/* Bookmark */}
        <button 
          onClick={handleBookmark}
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
        >
          <div className={cn(
            "h-12 w-12 rounded-full bg-black/40 flex items-center justify-center text-white",
            video.isBookmarked && "text-yellow-400"
          )}>
            <Bookmark className={cn("h-7 w-7", video.isBookmarked && "fill-current")} />
          </div>
        </button>

        {/* Share */}
        <button className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
          <div className="h-12 w-12 rounded-full bg-black/40 flex items-center justify-center text-white">
            <Share2 className="h-7 w-7" />
          </div>
          <span className="text-white text-xs font-medium">{formatNumber(video.shares)}</span>
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute left-4 right-20 bottom-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-white font-bold">{video.user.username}</span>
          {video.user.isVerified && (
            <span className="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
              <span className="text-[10px] text-white">✓</span>
            </span>
          )}
        </div>
        <p className="text-white text-sm mb-3 line-clamp-2">{video.description}</p>
        <div className="flex items-center gap-2">
          <Music2 className="h-4 w-4 text-white animate-spin" style={{ animationDuration: '3s' }} />
          <span className="text-white text-xs">{video.music}</span>
        </div>
      </div>
    </div>
  );
}

export default function VideosPage() {
  const [videos, setVideos] = useState(mockVideos);
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

  const toggleLike = (id: string) => {
    setVideos(prev => prev.map(v => 
      v.id === id 
        ? { ...v, isLiked: !v.isLiked, likes: v.isLiked ? v.likes - 1 : v.likes + 1 }
        : v
    ));
  };

  const toggleBookmark = (id: string) => {
    setVideos(prev => prev.map(v => 
      v.id === id 
        ? { ...v, isBookmarked: !v.isBookmarked }
        : v
    ));
  };

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
            onLike={() => toggleLike(video.id)}
            onBookmark={() => toggleBookmark(video.id)}
          />
        </div>
      ))}
    </div>
  );
}
