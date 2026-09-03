import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Flame, Heart, MapPin, MessageCircle, Music2, Quote } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PostViewModal } from '@/components/PostViewModal';
import { StoryAvatar } from '@/components/stories/StoryAvatar';
import { PostCardVisual, resolvePostVisualKind } from '@/components/discovery/PostCardVisual';
import { getPostPreview } from '@/components/discovery/PostPreviewContent';
import { mapDestinationHref } from '@/components/map/MapDestinationPreview';
import { fetchPostLocations, type PostLocation } from '@/hooks/usePostLocation';
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
  location: PostLocation | null;
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

function DiscoveryAuthor({
  post,
  onOpenProfile,
}: {
  post: TrendingPost;
  onOpenProfile: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpenProfile}
      className="flex max-w-full items-center gap-2 focus-visible:outline-none"
    >
      <StoryAvatar
        avatarUrl={post.profile?.avatar_url ?? null}
        username={post.profile?.username ?? ''}
        size="xs"
      />
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-foreground">
          {post.profile?.display_name || post.profile?.username || 'Foydalanuvchi'}
        </span>
        {post.profile?.username && (
          <span className="block truncate text-[10px] text-muted-foreground">
            @{post.profile.username}
          </span>
        )}
      </span>
    </button>
  );
}

function DiscoveryPostMetrics({
  post,
  onLike,
}: {
  post: TrendingPost;
  onLike: () => void;
}) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <button
        type="button"
        onClick={onLike}
        className="flex items-center gap-1 transition-colors hover:text-foreground focus-visible:outline-none"
        aria-pressed={post.is_liked}
        aria-label={post.is_liked ? 'Like olib tashlash' : 'Like bosish'}
      >
        <Heart
          className={cn(
            'h-4 w-4',
            post.is_liked && 'fill-red-500 text-red-500',
          )}
        />
        {formatCount(post.likes_count)}
      </button>
      <span className="flex items-center gap-1">
        <MessageCircle className="h-4 w-4" />
        {formatCount(post.comments_count)}
      </span>
      <span className="ml-auto flex items-center gap-1">
        <Eye className="h-4 w-4" />
        {formatCount(post.views_count)}
      </span>
    </div>
  );
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

      const rows = (data ?? []) as unknown as Omit<TrendingPost, 'is_liked' | 'location'>[];
      const postIds = rows.map((row) => row.id);
      const [likedIds, locationsByPost] = await Promise.all([
        fetchLikedPostIds(user?.id, postIds),
        fetchPostLocations(postIds),
      ]);

      setPosts(
        rows.map((row) => ({
          ...row,
          is_liked: likedIds.has(row.id),
          location: locationsByPost.get(row.id) ?? null,
        })),
      );
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
      const preview = getPostPreview(post.content);
      const location = post.location ?? preview.location;
      const kind = resolvePostVisualKind(
        post.media_type,
        post.media_urls?.[0] ?? null,
        Boolean(preview.music),
        Boolean(location),
      );

      if (kind === 'video') {
        navigate(`/videos?v=${post.id}`);
        return;
      }

      if (kind === 'location' && location) {
        navigate(
          mapDestinationHref({
            latitude: location.latitude,
            longitude: location.longitude,
            title: location.place?.name ?? location.label ?? 'Joylashuv',
            address: location.place?.address ?? null,
          }),
        );
        return;
      }

      setSelected(post);
    },
    [navigate, triggerHaptic],
  );

  // Sarlavha ikoni dekorativ — bosiladigan harakatni bildirmaydi, neytral.
  const header = (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Flame className="h-5 w-5 text-muted-foreground" />
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
      <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
        {posts.map((post) => {
          const preview = getPostPreview(post.content);
          const firstMedia = post.media_urls?.[0] ?? null;
          const location = post.location ?? preview.location;
          const kind = resolvePostVisualKind(
            post.media_type,
            firstMedia,
            Boolean(preview.music),
            Boolean(location),
          );
          const isVisual = kind === 'image' || kind === 'video' || kind === 'location';
          const isAudio = kind === 'audio';

          return (
            <article
              key={post.id}
              className={cn(
                'group mb-3 inline-block w-full break-inside-avoid overflow-hidden rounded-2xl border border-border/60 bg-card align-top shadow-sm transition-all duration-200',
                'hover:-translate-y-0.5 hover:border-border hover:shadow-md',
              )}
            >
              {isVisual ? (
                <>
                  <button
                    type="button"
                    onClick={() => openPost(post)}
                    className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Postni ochish"
                  >
                    <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
                      <PostCardVisual
                        content={post.content}
                        mediaUrls={post.media_urls}
                        mediaType={post.media_type}
                        location={post.location}
                        variant="grid"
                      />
                    </div>
                  </button>

                  <div className="space-y-2.5 p-3.5">
                    <button
                      type="button"
                      onClick={() => post.profile && navigate(`/user/${post.profile.username}`)}
                      className="flex max-w-full items-center gap-2 focus-visible:outline-none"
                    >
                      <StoryAvatar
                        avatarUrl={post.profile?.avatar_url ?? null}
                        username={post.profile?.username ?? ''}
                        size="xs"
                      />
                      <span className="truncate text-xs font-semibold">
                        {post.profile?.display_name || post.profile?.username}
                      </span>
                    </button>

                    {preview.text && (
                      <button
                        type="button"
                        onClick={() => openPost(post)}
                        className="line-clamp-2 block w-full text-left text-[13px] leading-relaxed text-foreground/90"
                      >
                        {preview.text}
                      </button>
                    )}

                    <DiscoveryPostMetrics
                      post={post}
                      onLike={() => handleLike(post)}
                    />
                  </div>
                </>
              ) : isAudio ? (
                <div className="p-4">
                  <DiscoveryAuthor
                    post={post}
                    onOpenProfile={() =>
                      post.profile && navigate(`/user/${post.profile.username}`)
                    }
                  />

                  <button
                    type="button"
                    onClick={() => openPost(post)}
                    className="mt-4 block w-full rounded-2xl bg-muted/55 p-4 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Audio postni ochish"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border/60">
                        <Music2 className="h-5 w-5 text-muted-foreground" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {preview.music?.title || 'Audio'}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {preview.music?.artist || 'Audio post'}
                        </span>
                      </span>
                    </div>
                  </button>

                  {preview.text && (
                    <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-foreground/85">
                      {preview.text}
                    </p>
                  )}

                  <div className="mt-4">
                    <DiscoveryPostMetrics
                      post={post}
                      onLike={() => handleLike(post)}
                    />
                  </div>
                </div>
              ) : (
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => openPost(post)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openPost(post);
                    }
                  }}
                  className="block w-full cursor-pointer p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Matnli postni ochish"
                >
                  <div
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    className="mb-5"
                  >
                    <DiscoveryAuthor
                      post={post}
                      onOpenProfile={() =>
                        post.profile && navigate(`/user/${post.profile.username}`)
                      }
                    />
                  </div>

                  <Quote className="mb-3 h-5 w-5 text-muted-foreground/30" aria-hidden="true" />

                  <p
                    className={cn(
                      'whitespace-pre-wrap font-medium leading-[1.55] text-foreground',
                      preview.text.length < 90 ? 'text-lg' : 'text-[15px]',
                    )}
                  >
                    {preview.text || 'Matnsiz post'}
                  </p>

                  {preview.location && (
                    <span className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {preview.location.label ||
                          preview.location.place?.name ||
                          'Joylashuv'}
                      </span>
                    </span>
                  )}

                  <div
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    className="mt-5 border-t border-border/55 pt-3"
                  >
                    <DiscoveryPostMetrics
                      post={post}
                      onLike={() => handleLike(post)}
                    />
                  </div>
                </div>
              )}
            </article>
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
