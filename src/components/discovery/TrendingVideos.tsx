import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Play, Heart, MessageCircle, Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

interface TrendingVideo {
  id: string;
  media_urls: string[];
  likes_count: number;
  comments_count: number;
  content: string | null;
  profile?: {
    username: string | null;
    avatar_url: string | null;
  };
}

export function TrendingVideos() {
  const navigate = useNavigate();
  const { triggerHaptic } = useHapticFeedback();
  const [videos, setVideos] = useState<TrendingVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredVideo, setHoveredVideo] = useState<string | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  useEffect(() => {
    async function fetchVideos() {
      setIsLoading(true);
      
      const { data } = await supabase
        .from('posts')
        .select(`
          id, media_urls, likes_count, comments_count, content,
          profile:profiles!posts_user_id_fkey (username, avatar_url)
        `)
        .eq('media_type', 'video')
        .eq('visibility', 'public')
        .order('likes_count', { ascending: false })
        .limit(12);

      if (data) {
        setVideos(data as TrendingVideo[]);
      }
      
      setIsLoading(false);
    }

    fetchVideos();
  }, []);

  // Real-time subscription for video counts
  useEffect(() => {
    if (videos.length === 0) return;

    const channel = supabase
      .channel('trending-videos-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_likes',
        },
        (payload) => {
          const postId = (payload.new as any)?.post_id || (payload.old as any)?.post_id;
          setVideos(prev => prev.map(v => {
            if (v.id !== postId) return v;
            const delta = payload.eventType === 'INSERT' ? 1 : payload.eventType === 'DELETE' ? -1 : 0;
            return { ...v, likes_count: Math.max(0, v.likes_count + delta) };
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
        },
        (payload) => {
          const postId = (payload.new as any)?.post_id || (payload.old as any)?.post_id;
          setVideos(prev => prev.map(v => {
            if (v.id !== postId) return v;
            const delta = payload.eventType === 'INSERT' ? 1 : payload.eventType === 'DELETE' ? -1 : 0;
            return { ...v, comments_count: Math.max(0, v.comments_count + delta) };
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [videos.length]);

  const handleMouseEnter = (videoId: string) => {
    setHoveredVideo(videoId);
    const video = videoRefs.current[videoId];
    if (video) {
      video.play().catch(() => {});
    }
  };

  const handleMouseLeave = (videoId: string) => {
    setHoveredVideo(null);
    const video = videoRefs.current[videoId];
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
  };

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  if (isLoading) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">Trending Videos</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[9/16] rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (videos.length === 0) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">Trending Videos</h2>
        </div>
        <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-xl">
          <Play className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No trending videos yet</p>
          <p className="text-sm">Be the first to post a video!</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">Trending Videos</h2>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {videos.map((video) => (
          <div
            key={video.id}
            className="relative aspect-[9/16] bg-muted rounded-xl overflow-hidden cursor-pointer group"
            onClick={() => {
              triggerHaptic('medium');
              navigate(`/videos?v=${video.id}`);
            }}
            onMouseEnter={() => handleMouseEnter(video.id)}
            onMouseLeave={() => handleMouseLeave(video.id)}
          >
            <video
              ref={(el) => { videoRefs.current[video.id] = el; }}
              src={video.media_urls[0]}
              className="w-full h-full object-cover"
              muted
              playsInline
              loop
              preload="metadata"
            />
            
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            
            {/* Play icon */}
            <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${
              hoveredVideo === video.id ? 'opacity-0' : 'opacity-100'
            }`}>
              <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
                <Play className="h-6 w-6 text-white fill-white" />
              </div>
            </div>
            
            {/* Stats overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-2">
              <div className="flex items-center justify-between text-white text-xs">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Heart className="h-3 w-3" />
                    <span>{formatCount(video.likes_count || 0)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" />
                    <span>{formatCount(video.comments_count || 0)}</span>
                  </div>
                </div>
              </div>
              {video.profile && (
                <p className="text-white text-xs mt-1 truncate">
                  @{video.profile.username || 'user'}
                </p>
              )}
            </div>
            
            {/* Hover ring */}
            <div className={`absolute inset-0 ring-2 ring-primary rounded-xl transition-opacity ${
              hoveredVideo === video.id ? 'opacity-100' : 'opacity-0'
            }`} />
          </div>
        ))}
      </div>
    </section>
  );
}
