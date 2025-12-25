import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Heart, MessageCircle, Play, Image as ImageIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useAuth } from '@/contexts/AuthContext';

interface Post {
  id: string;
  content: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  profile?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
    display_name: string | null;
  };
}

export function ForYouSection() {
  const navigate = useNavigate();
  const { triggerHaptic } = useHapticFeedback();
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchForYouPosts() {
      setIsLoading(true);
      
      // Get random selection of popular posts
      const { data } = await supabase
        .from('posts')
        .select(`
          id, content, media_urls, media_type, likes_count, comments_count, created_at,
          profile:profiles!posts_user_id_fkey (id, username, avatar_url, display_name)
        `)
        .eq('visibility', 'public')
        .order('likes_count', { ascending: false })
        .limit(20);

      if (data) {
        // Shuffle and take random posts for variety
        const shuffled = data.sort(() => Math.random() - 0.5).slice(0, 8);
        setPosts(shuffled as Post[]);
      }
      
      setIsLoading(false);
    }

    fetchForYouPosts();
  }, [user]);

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  if (isLoading) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">For You</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (posts.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-lg">For You</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {posts.map((post) => (
          <div
            key={post.id}
            className="relative aspect-square bg-muted rounded-xl overflow-hidden cursor-pointer group"
            onClick={() => {
              triggerHaptic('light');
              if (post.media_type === 'video') {
                navigate('/videos');
              } else {
                navigate(`/user/${post.profile?.id}`);
              }
            }}
          >
            {post.media_urls && post.media_urls.length > 0 ? (
              post.media_type === 'video' ? (
                <video
                  src={post.media_urls[0]}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={post.media_urls[0]}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 p-4">
                <p className="text-sm text-foreground line-clamp-4 text-center">
                  {post.content}
                </p>
              </div>
            )}
            
            {/* Media type indicator */}
            {post.media_type === 'video' && (
              <div className="absolute top-2 right-2 bg-black/50 rounded-full p-1">
                <Play className="h-3 w-3 text-white fill-white" />
              </div>
            )}
            
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            
            {/* Stats on hover */}
            <div className="absolute inset-0 flex items-center justify-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-1 text-white font-medium">
                <Heart className="h-5 w-5" />
                <span>{formatCount(post.likes_count || 0)}</span>
              </div>
              <div className="flex items-center gap-1 text-white font-medium">
                <MessageCircle className="h-5 w-5" />
                <span>{formatCount(post.comments_count || 0)}</span>
              </div>
            </div>
            
            {/* User info */}
            <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-2">
                <Avatar className="w-6 h-6 border border-white/50">
                  <AvatarImage src={post.profile?.avatar_url || ''} />
                  <AvatarFallback className="text-xs">
                    {post.profile?.username?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-white text-xs truncate">
                  @{post.profile?.username || 'user'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
