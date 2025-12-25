import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, TrendingUp, Hash, Play, Heart, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

interface TrendingVideo {
  id: string;
  media_urls: string[];
  likes_count: number;
  content: string | null;
  profile?: {
    username: string | null;
    avatar_url: string | null;
  };
}

interface TrendingUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  followers_count: number | null;
  is_verified: boolean | null;
}

const trendingHashtags = [
  { tag: 'fyp', count: '2.5M' },
  { tag: 'viral', count: '1.8M' },
  { tag: 'trending', count: '1.2M' },
  { tag: 'comedy', count: '890K' },
  { tag: 'dance', count: '750K' },
  { tag: 'music', count: '620K' },
  { tag: 'food', count: '540K' },
  { tag: 'travel', count: '480K' },
];

export default function DiscoveryPage() {
  const navigate = useNavigate();
  const { triggerHaptic } = useHapticFeedback();
  const [trendingVideos, setTrendingVideos] = useState<TrendingVideo[]>([]);
  const [trendingUsers, setTrendingUsers] = useState<TrendingUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchTrending() {
      setIsLoading(true);
      
      const [videosRes, usersRes] = await Promise.all([
        supabase
          .from('posts')
          .select(`
            id, media_urls, likes_count, content,
            profile:profiles!posts_user_id_fkey (username, avatar_url)
          `)
          .eq('media_type', 'video')
          .eq('visibility', 'public')
          .order('likes_count', { ascending: false })
          .limit(9),
        supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, followers_count, is_verified')
          .order('followers_count', { ascending: false })
          .limit(10)
      ]);

      if (videosRes.data) setTrendingVideos(videosRes.data as TrendingVideo[]);
      if (usersRes.data) setTrendingUsers(usersRes.data);
      setIsLoading(false);
    }

    fetchTrending();
  }, []);

  const handleSearchFocus = () => {
    triggerHaptic('light');
    navigate('/search');
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border p-4">
        <div 
          className="relative cursor-pointer"
          onClick={handleSearchFocus}
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search videos, users, hashtags..."
            className="pl-10 bg-muted/50 border-0"
            readOnly
          />
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Trending Hashtags */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Hash className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Trending Hashtags</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {trendingHashtags.map((item) => (
              <Badge
                key={item.tag}
                variant="secondary"
                className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors py-2 px-3"
                onClick={() => {
                  triggerHaptic('light');
                  navigate(`/search?q=%23${item.tag}`);
                }}
              >
                #{item.tag}
                <span className="ml-1 text-xs opacity-70">{item.count}</span>
              </Badge>
            ))}
          </div>
        </section>

        {/* Trending Creators */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Popular Creators</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2 min-w-[80px]">
                  <Skeleton className="w-16 h-16 rounded-full" />
                  <Skeleton className="w-14 h-3" />
                </div>
              ))
            ) : (
              trendingUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-col items-center gap-2 min-w-[80px] cursor-pointer"
                  onClick={() => {
                    triggerHaptic('light');
                    navigate(`/user/${user.id}`);
                  }}
                >
                  <Avatar className="w-16 h-16 border-2 border-primary">
                    <AvatarImage src={user.avatar_url || ''} />
                    <AvatarFallback>{user.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium truncate max-w-[70px]">
                    @{user.username || 'user'}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Trending Videos Grid */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Trending Videos</h2>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {isLoading ? (
              Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[9/16] rounded-lg" />
              ))
            ) : trendingVideos.length > 0 ? (
              trendingVideos.map((video) => (
                <div
                  key={video.id}
                  className="relative aspect-[9/16] bg-muted rounded-lg overflow-hidden cursor-pointer group"
                  onClick={() => {
                    triggerHaptic('medium');
                    navigate('/videos');
                  }}
                >
                  <video
                    src={video.media_urls[0]}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-white text-xs">
                      <Play className="h-3 w-3" />
                      <span>{video.likes_count || 0}</span>
                    </div>
                    <div className="flex items-center gap-1 text-white text-xs">
                      <Heart className="h-3 w-3" />
                      <span>{video.likes_count || 0}</span>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="h-10 w-10 text-white" />
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-3 text-center py-12 text-muted-foreground">
                No trending videos yet
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
