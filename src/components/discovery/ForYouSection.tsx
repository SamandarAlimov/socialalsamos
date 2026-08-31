import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Heart, MessageCircle, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PostViewModal } from '@/components/PostViewModal';
import { PostThumbnailStickers } from '@/components/stickers/PostThumbnailStickers';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { fetchLikedPostIds, togglePostLike } from '@/lib/postLikes';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Flutter: lib/features/discovery/presentation/widgets/for_you_section.dart

interface ForYouProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface ForYouPost {
  id: string;
  content: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  likes_count: number | null;
  comments_count: number | null;
  views_count: number | null;
  created_at: string;
  is_liked: boolean;
  profile: ForYouProfile | null;
}

interface ForYouSectionProps {
  refreshKey?: number;
}

function formatCount(count: number | null) {
  const value = count ?? 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

export function ForYouSection({ refreshKey = 0 }: ForYouSectionProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { triggerHaptic } = useHapticFeedback();
  const [posts, setPosts] = useState<ForYouPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [selected, setSelected] = useState<ForYouPost | null>(null);

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
        .order('created_at', { ascending: false })
        .limit(12);

      if (error) throw error;

      const rows = (data ?? []) as unknown as Omit<ForYouPost, 'is_liked'>[];
      const likedIds = await fetchLikedPostIds(
        user?.id,
        rows.map((row) => row.id),
      );

      setPosts(rows.map((row) => ({ ...row, is_liked: likedIds.has(row.id) })));
    } catch (error) {
      console.error('For You postlarini yuklashda xatolik:', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts, refreshKey]);

  const handleLike = useCallback(
    async (post: ForYouPost) => {
      if (!user) {
        toast.error('Like bosish uchun tizimga kiring');
        return;
      }

      triggerHaptic('light');
      const wasLiked = post.is_liked;

      const applyLocal = (isLiked: boolean) => {
        const patch = (item: ForYouPost): ForYouPost => ({
          ...item,
          is_liked: isLiked,
          likes_count: Math.max(0, (item.likes_count ?? 0) + (isLiked ? 1 : -1)),
        });
        setPosts((prev) => prev.map((item) => (item.id === post.id ? patch(item) : item)));
        setSelected((prev) => (prev && prev.id === post.id ? patch(prev) : prev));
      };

      applyLocal(!wasLiked);

      try {
        // Ilgari bu faqat local state edi - sahifa yangilanganda like yo'qolardi.
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
    (post: ForYouPost) => {
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
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Siz uchun</h2>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          triggerHaptic('light');
          fetchPosts();
        }}
        disabled={isLoading}
        aria-label="Siz uchun bolimini yangilash"
      >
        <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
      </Button>
    </div>
  );

  if (isLoading && posts.length === 0) {
    return (
      <section aria-busy="true">
        {header}
        <div className="grid grid-cols-3 gap-1 sm:gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
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
          <p className="mb-3 text-sm text-muted-foreground">Postlarni yuklab bolmadi.</p>
          <Button variant="outline" size="sm" onClick={fetchPosts}>
            Qayta urinish
          </Button>
        </div>
      </section>
    );
  }

  if (posts.length === 0) {
    return (
      <section>
        {header}
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Hozircha ommaviy post yoq. Birinchi bolib post joylang!
          </p>
          <Button className="mt-3" size="sm" onClick={() => navigate('/create')}>
            Post yaratish
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section>
      {header}
      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        {posts.map((post) => {
          const cover = post.media_urls?.[0];
          return (
            <div key={post.id} className="group relative">
              <button
                type="button"
                onClick={() => openPost(post)}
                className="relative block aspect-square w-full overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Postni ochish"
              >
                {cover ? (
                  <img
                    src={cover}
                    alt={post.content?.slice(0, 60) || 'Post'}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-3">
                    <p className="line-clamp-5 text-xs text-muted-foreground">{post.content}</p>
                  </div>
                )}

                {post.media_type === 'video' && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white">
                    <Play className="h-3 w-3" />
                  </span>
                )}

                <span className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="flex items-center gap-1">
                    <Heart className="h-3 w-3" />
                    {formatCount(post.likes_count)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" />
                    {formatCount(post.comments_count)}
                  </span>
                </span>

                <PostThumbnailStickers postId={post.id} />
              </button>

              <button
                type="button"
                onClick={() => handleLike(post)}
                className="absolute left-1.5 top-1.5 rounded-full bg-black/50 p-1.5 text-white transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-pressed={post.is_liked}
                aria-label={post.is_liked ? 'Like olib tashlash' : 'Like bosish'}
              >
                <Heart className={cn('h-3.5 w-3.5', post.is_liked && 'fill-red-500 text-red-500')} />
              </button>
            </div>
          );
        })}
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
