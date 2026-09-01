import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Heart, MessageCircle, Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PostViewModal } from '@/components/PostViewModal';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { PostCardVisual } from '@/components/discovery/PostCardVisual';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { fetchLikedPostIds, togglePostLike } from '@/lib/postLikes';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Flutter: lib/features/discovery/presentation/widgets/trending_public_posts.dart

interface TrendingProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface TrendingPost {
  id: string;
  content: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  likes_count: number | null;
  comments_count: number | null;
  views_count: number | null;
  created_at: string;
  is_liked: boolean;
  profile: TrendingProfile | null;
}

interface TrendingPublicPostsProps {
  refreshKey?: number;
}

function formatCount(count: number | null) {
  const value = count ?? 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

export function TrendingPublicPosts({ refreshKey = 0 }: TrendingPublicPostsProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { triggerHaptic } = useHapticFeedback();
  const [posts, setPosts] = useState<TrendingPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [selected, setSelected] = useState<TrendingPost | null>(null);

  const fetchPosts = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);

    try {
      const { data, error } = await supabase
        .from('posts')
        .select(
          `id, content, media_urls, media_type, likes_count, comments_count, views_count, created_at,
           profile:profiles!posts_user_id_fkey (id, username, display_name, avatar_url)`,
        )
        .eq('visibility', 'public')
        .order('likes_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(6);

      if (error) throw error;

      const rows = (data ?? []) as unknown as Omit<TrendingPost, 'is_liked'>[];
      const likedIds = await fetchLikedPostIds(
        user?.id,
        rows.map((row) => row.id),
      );

      setPosts(rows.map((row) => ({ ...row, is_liked: likedIds.has(row.id) })));
    } catch (error) {
      console.error('Trend postlarni yuklashda xatolik:', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts, refreshKey]);

  const handleLike = useCallback(
    async (post: TrendingPost) => {
      if (!user) {
        toast.error('Like bosish uchun tizimga kiring');
        return;
      }

      triggerHaptic('light');
      const wasLiked = post.is_liked;

      const applyLocal = (isLiked: boolean) => {
        setPosts((prev) =>
          prev.map((item) =>
            item.id === post.id
              ? {
                  ...item,
                  is_liked: isLiked,
                  likes_count: Math.max(0, (item.likes_count ?? 0) + (isLiked ? 1 : -1)),
                }
              : item,
          ),
        );
        setSelected((prev) =>
          prev && prev.id === post.id
            ? {
                ...prev,
                is_liked: isLiked,
                likes_count: Math.max(0, (prev.likes_count ?? 0) + (isLiked ? 1 : -1)),
              }
            : prev,
        );
      };

      applyLocal(!wasLiked);

      try {
        await togglePostLike(post.id, user.id, wasLiked);
      } catch (error) {
        console.error('Like saqlanmadi:', error);
        applyLocal(wasLiked);
        toast.error('Like saqlanmadi, qayta urinib koring');
      }
    },
    [triggerHaptic, user],
  );

  const openPost = useCallback(
    (post: TrendingPost) => {
      triggerHaptic('light');
      if (post.media_type === 'video') {
        navigate(`/videos?v=${post.id}`);
        return;
      }
      setSelected(post);
    },
    [navigate, triggerHaptic],
  );

  const header = (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Flame className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Trend postlar</h2>
      </div>
      <Button variant="ghost" size="sm" onClick={() => navigate('/discover?tab=trending')}>
        Barchasi
      </Button>
    </div>
  );

  if (isLoading && posts.length === 0) {
    return (
      <section aria-busy="true">
        {header}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (hasError) {
    return (
      <section>
        {header}
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">Trend postlarni yuklab bolmadi.</p>
          <Button variant="outline" size="sm" onClick={fetchPosts}>
            Qayta urinish
          </Button>
        </div>
      </section>
    );
  }

  if (posts.length === 0) return null;

  return (
    <section>
      {header}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {posts.map((post) => (
          <article
            key={post.id}
            className="group overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md"
          >
            <button
              type="button"
              onClick={() => openPost(post)}
              className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Postni ochish"
            >
              <div className="relative aspect-square w-full">
                <PostCardVisual
                  content={post.content}
                  mediaUrls={post.media_urls}
                  mediaType={post.media_type}
                  variant="grid"
                />
              </div>
            </button>

            <div className="space-y-2 p-3">
              <button
                type="button"
                onClick={() => post.profile && navigate(`/user/${post.profile.username}`)}
                className="flex items-center gap-2 focus-visible:outline-none"
              >
                <StoryAvatar
                  avatarUrl={post.profile?.avatar_url ?? null}
                  username={post.profile?.username ?? ''}
                  size="xs"
                />
                <span className="truncate text-xs font-medium">
                  {post.profile?.display_name || post.profile?.username}
                </span>
              </button>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => handleLike(post)}
                  className="flex items-center gap-1 transition-colors hover:text-foreground focus-visible:outline-none"
                  aria-pressed={post.is_liked}
                  aria-label={post.is_liked ? 'Like olib tashlash' : 'Like bosish'}
                >
                  <Heart className={cn('h-4 w-4', post.is_liked && 'fill-red-500 text-red-500')} />
                  {formatCount(post.likes_count)}
                </button>
                <span className="flex items-center gap-1">
                  <MessageCircle className="h-4 w-4" />
                  {formatCount(post.comments_count)}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {formatCount(post.views_count)}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>

      {selected && (
        <PostViewModal
          post={selected as any}
          profile={selected.profile as any}
          open={!!selected}
          onOpenChange={(open: boolean) => !open && setSelected(null)}
          onLike={() => handleLike(selected)}
        />
      )}
    </section>
  );
}
