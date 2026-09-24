import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  Clock,
  Eye,
  EyeOff,
  Play,
  SlidersHorizontal,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { FeedPostCard, type FeedPostCardPost } from '@/components/posts/FeedPostCard';
import { PostViewModal } from '@/components/PostViewModal';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useRealtimePostCounts } from '@/hooks/useRealtimePostCounts';
import { db } from '@/lib/db';
import { formatCompactCount } from '@/lib/postMarkers';
import { togglePostLike } from '@/lib/postLikes';

interface PostProfile {
  id?: string | null;
  username: string | null;
  avatar_url: string | null;
  display_name: string | null;
  is_verified?: boolean | null;
}

interface Post {
  id: string;
  user_id?: string | null;
  content: string | null;
  formatted_content?: unknown;
  media_urls: string[] | null;
  media_type: string | null;
  thumbnail_url?: string | null;
  likes_count: number;
  comments_count: number;
  shares_count?: number;
  reposts_count?: number;
  views_count?: number;
  is_pinned?: boolean;
  is_liked?: boolean;
  is_bookmarked?: boolean;
  profile_hidden_at?: string | null;
  post_kind?: string | null;
  has_poll?: boolean | null;
  created_at: string;
  profile?: PostProfile | null;
}

interface ProfilePostsGridProps {
  posts: Post[];
  isOwnProfile: boolean;
  profile: PostProfile;
  onLike?: (postId: string) => void | Promise<void>;
  onDelete?: (postId: string) => void | Promise<void>;
  onPin?: (postId: string) => void | Promise<void>;
  /**
   * Profile display is decided by the active tab, not by a second user-facing
   * view switch. Only the Videos/Reels tab should use the compact 3-column grid.
   */
  layout?: 'feed' | 'reels-grid';
  /** Postlar hali yuklanayotgan bo'lsa premium skeleton ko'rsatiladi. */
  isLoading?: boolean;
}

type SortMode = 'newest' | 'oldest' | 'most_viewed' | 'least_viewed';

/** Home bilan aynan bir xil vaqt ko‘rinishi. */
function formatFeedPostTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 24) {
    return formatDistanceToNow(date, { addSuffix: false }) + ' ago';
  }
  return format(date, 'MMM d');
}

function ReelsGridSkeleton() {
  return (
    <div className="relative left-1/2 grid w-screen -translate-x-1/2 grid-cols-3 gap-[2px] sm:left-auto sm:w-full sm:translate-x-0 sm:gap-1.5">
      {Array.from({ length: 9 }).map((_, idx) => (
        <div
          key={idx}
          className="aspect-[3/4] animate-pulse bg-muted sm:rounded-lg"
          style={{ animationDelay: `${idx * 60}ms` }}
        />
      ))}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="relative left-1/2 w-screen max-w-[640px] -translate-x-1/2 space-y-4 md:left-auto md:mx-auto md:w-full md:translate-x-0 md:space-y-6">
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="overflow-hidden border-y border-border/70 bg-card/95 md:rounded-3xl md:border"
          style={{ animationDelay: `${idx * 90}ms` }}
        >
          <div className="flex items-center gap-3 p-4 md:p-5">
            <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 animate-pulse rounded-full bg-muted" />
              <div className="h-2.5 w-24 animate-pulse rounded-full bg-muted" />
            </div>
          </div>
          <div className="space-y-2 px-4 pb-4 md:px-5">
            <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-4/5 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="h-64 animate-pulse bg-muted" />
          <div className="h-14 animate-pulse border-t border-border/70 bg-muted/20" />
        </div>
      ))}
    </div>
  );
}

export function ProfilePostsGrid({
  posts,
  isOwnProfile,
  profile,
  onLike,
  onDelete,
  onPin,
  layout = 'feed',
  isLoading = false,
}: ProfilePostsGridProps) {
  const { t } = useTranslation();
  const { user, profile: authProfile } = useAuth();
  const { toast } = useToast();
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showHiddenProfilePosts, setShowHiddenProfilePosts] = useState(false);
  const [profileVisibilityOverrides, setProfileVisibilityOverrides] = useState<Map<string, boolean>>(
    () => new Map(),
  );
  const [profileVisibilityMutations, setProfileVisibilityMutations] = useState<Set<string>>(
    () => new Set(),
  );
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(
    () => new Set(posts.filter((post) => post.is_bookmarked).map((post) => post.id)),
  );

  useEffect(() => {
    setBookmarkedIds((current) => {
      const next = new Set(current);
      posts.forEach((post) => {
        if (post.is_bookmarked) next.add(post.id);
      });
      return next;
    });
  }, [posts]);

  const resolvePostUserId = useCallback(
    (post: Post) => post.user_id || post.profile?.id || (isOwnProfile ? user?.id : null) || null,
    [isOwnProfile, user?.id],
  );

  const belongsToRenderedProfile = useCallback((post: Post) => {
    const postUserId = resolvePostUserId(post);

    if (isOwnProfile && user?.id) {
      return !postUserId || postUserId === user.id;
    }
    if (profile.id && postUserId) return profile.id === postUserId;
    if (profile.username && post.profile?.username) {
      return profile.username === post.profile.username;
    }
    return true;
  }, [isOwnProfile, profile.id, profile.username, resolvePostUserId, user?.id]);

  const isPostProfileHidden = useCallback((post: Post) => {
    const override = profileVisibilityOverrides.get(post.id);
    return override ?? Boolean(post.profile_hidden_at);
  }, [profileVisibilityOverrides]);

  const renderedProfilePosts = useMemo(
    () => posts.filter((post) => belongsToRenderedProfile(post)),
    [belongsToRenderedProfile, posts],
  );

  const hiddenProfilePostsCount = useMemo(
    () => renderedProfilePosts.filter((post) => isPostProfileHidden(post)).length,
    [isPostProfileHidden, renderedProfilePosts],
  );

  const canManageProfileVisibility = Boolean(isOwnProfile && user?.id && renderedProfilePosts.length > 0);

  const displayPosts = useMemo(() => {
    if (canManageProfileVisibility && showHiddenProfilePosts) {
      return renderedProfilePosts.filter((post) => isPostProfileHidden(post));
    }

    return posts.filter((post) => {
      if (!belongsToRenderedProfile(post)) return true;
      return !isPostProfileHidden(post);
    });
  }, [
    belongsToRenderedProfile,
    canManageProfileVisibility,
    isPostProfileHidden,
    posts,
    renderedProfilePosts,
    showHiddenProfilePosts,
  ]);

  const sortLabels: Record<SortMode, string> = {
    newest: t('profile.sort.newest', { defaultValue: 'Yangidan eskiga' }),
    oldest: t('profile.sort.oldest', { defaultValue: 'Eskidan yangiga' }),
    most_viewed: t('profile.sort.mostViewed', { defaultValue: 'Ko‘p ko‘rilgan' }),
    least_viewed: t('profile.sort.leastViewed', { defaultValue: 'Kam ko‘rilgan' }),
  };

  const sortIcons: Record<SortMode, typeof Clock> = {
    newest: ArrowDownWideNarrow,
    oldest: ArrowUpNarrowWide,
    most_viewed: Eye,
    least_viewed: Eye,
  };

  const sortedPosts = useMemo(() => {
    const list = [...displayPosts];
    const views = (post: Post) => post.views_count ?? 0;
    const time = (post: Post) => new Date(post.created_at).getTime();

    list.sort((a, b) => {
      if (Boolean(a.is_pinned) !== Boolean(b.is_pinned)) return a.is_pinned ? -1 : 1;

      switch (sortMode) {
        case 'oldest':
          return time(a) - time(b);
        case 'most_viewed':
          return views(b) - views(a) || time(b) - time(a);
        case 'least_viewed':
          return views(a) - views(b) || time(b) - time(a);
        case 'newest':
        default:
          return time(b) - time(a);
      }
    });

    return list;
  }, [displayPosts, sortMode]);

  const postIds = useMemo(() => sortedPosts.map((post) => post.id), [sortedPosts]);
  const { getPostCounts } = useRealtimePostCounts(postIds, user?.id || null);

  const toggleProfileVisibility = useCallback(async (post: Post) => {
    const postUserId = resolvePostUserId(post);
    if (!user?.id || !isOwnProfile || postUserId !== user.id) return;
    if (profileVisibilityMutations.has(post.id)) return;

    const wasHidden = isPostProfileHidden(post);
    const nextHidden = !wasHidden;
    const hiddenAt = nextHidden ? new Date().toISOString() : null;

    setProfileVisibilityMutations((current) => {
      const next = new Set(current);
      next.add(post.id);
      return next;
    });
    setProfileVisibilityOverrides((current) => {
      const next = new Map(current);
      next.set(post.id, nextHidden);
      return next;
    });

    try {
      const result = await db
        .from('posts')
        .update({ profile_hidden_at: hiddenAt })
        .eq('id', post.id)
        .eq('user_id', user.id);

      if (result.error) throw result.error;

      setSelectedPost((current) =>
        current?.id === post.id
          ? { ...current, profile_hidden_at: hiddenAt }
          : current,
      );

      toast({
        title: nextHidden ? 'Post profildan yashirildi' : 'Post profilga qaytarildi',
        description: nextHidden
          ? 'Post o‘chirilmagan. Uni Yashirilgan bo‘limidan istalgan payt qaytarishingiz mumkin.'
          : 'Post yana profilingizda ko‘rinadi.',
      });
    } catch (error) {
      setProfileVisibilityOverrides((current) => {
        const next = new Map(current);
        next.set(post.id, wasHidden);
        return next;
      });
      console.error('Profile post visibility update failed', error);
      toast({
        title: t('common.error', { defaultValue: 'Xatolik' }),
        description: 'Post ko‘rinishini yangilab bo‘lmadi',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setProfileVisibilityMutations((current) => {
        const next = new Set(current);
        next.delete(post.id);
        return next;
      });
    }
  }, [
    isOwnProfile,
    isPostProfileHidden,
    profileVisibilityMutations,
    resolvePostUserId,
    t,
    toast,
    user?.id,
  ]);

  const toggleBookmark = async (postId: string) => {
    if (!user?.id) {
      toast({ title: t('auth.loginRequired', { defaultValue: 'Tizimga kirish kerak' }) });
      return;
    }

    const isBookmarked = bookmarkedIds.has(postId);
    setBookmarkedIds((current) => {
      const next = new Set(current);
      if (isBookmarked) next.delete(postId);
      else next.add(postId);
      return next;
    });

    try {
      const result = isBookmarked
        ? await db.from('bookmarks').delete().eq('post_id', postId).eq('user_id', user.id)
        : await db.from('bookmarks').insert({ post_id: postId, user_id: user.id });

      if (result.error) throw result.error;
    } catch (error) {
      setBookmarkedIds((current) => {
        const next = new Set(current);
        if (isBookmarked) next.add(postId);
        else next.delete(postId);
        return next;
      });
      console.error('Profile post bookmark failed', error);
      toast({
        title: t('common.error', { defaultValue: 'Xatolik' }),
        description: t('post.saveFailed', { defaultValue: 'Postni saqlab bo‘lmadi' }),
        variant: 'destructive',
      });
    }
  };

  const handleLike = useCallback(async (post: Post) => {
    if (onLike) {
      await onLike(post.id);
      return;
    }

    if (!user?.id) {
      toast({ title: t('auth.loginRequired', { defaultValue: 'Tizimga kirish kerak' }) });
      return;
    }

    const canonical = getPostCounts(post.id);
    const isLikedNow = canonical.is_liked ?? post.is_liked ?? false;

    try {
      await togglePostLike(post.id, user.id, isLikedNow);
    } catch (error) {
      console.error('Profile post like failed', error);
      toast({
        title: t('common.error', { defaultValue: 'Xatolik' }),
        description: t('post.likeFailed', { defaultValue: 'Like holatini yangilab bo‘lmadi' }),
        variant: 'destructive',
      });
    }
  }, [getPostCounts, onLike, t, toast, user?.id]);

  const ActiveSortIcon = sortIcons[sortMode];

  const toolbar = (
    <div className="mb-4 flex items-center justify-between gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2 rounded-full" disabled={isLoading}>
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">{sortLabels[sortMode]}</span>
            <ActiveSortIcon className="h-4 w-4 sm:hidden" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>{t('profile.sort.label', { defaultValue: 'Saralash' })}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(Object.keys(sortLabels) as SortMode[]).map((mode) => {
            const Icon = sortIcons[mode];
            return (
              <DropdownMenuItem key={mode} onClick={() => setSortMode(mode)} className="gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">{sortLabels[mode]}</span>
                {sortMode === mode && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {canManageProfileVisibility && (
        <Button
          type="button"
          variant={showHiddenProfilePosts ? 'secondary' : 'outline'}
          size="sm"
          className="h-9 gap-2 rounded-full"
          onClick={() => setShowHiddenProfilePosts((current) => !current)}
          aria-pressed={showHiddenProfilePosts}
        >
          {showHiddenProfilePosts ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          <span className="hidden sm:inline">
            {showHiddenProfilePosts ? 'Postlar' : 'Yashirilgan'}
          </span>
          <span className="min-w-5 rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums">
            {hiddenProfilePostsCount}
          </span>
        </Button>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {toolbar}
        {layout === 'reels-grid' ? <ReelsGridSkeleton /> : <FeedSkeleton />}
      </div>
    );
  }

  if (posts.length === 0) return null;

  const emptyVisibleState = sortedPosts.length === 0;

  return (
    <div>
      {toolbar}

      {emptyVisibleState ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/10 px-6 py-14 text-center text-muted-foreground">
          {showHiddenProfilePosts ? (
            <EyeOff className="mb-3 h-10 w-10 opacity-55" />
          ) : (
            <Eye className="mb-3 h-10 w-10 opacity-55" />
          )}
          <p className="text-sm font-semibold text-foreground">
            {showHiddenProfilePosts ? 'Yashirilgan postlar yo‘q' : 'Ko‘rinadigan postlar yo‘q'}
          </p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed">
            {showHiddenProfilePosts
              ? 'Profildan yashirgan postlaringiz shu yerda paydo bo‘ladi va ularni istalgan payt qaytarish mumkin.'
              : 'Bu profil uchun ko‘rsatiladigan postlar hozircha yo‘q.'}
          </p>
        </div>
      ) : layout === 'reels-grid' ? (
        <div className="relative left-1/2 grid w-screen -translate-x-1/2 grid-cols-3 gap-[2px] sm:left-auto sm:w-full sm:translate-x-0 sm:gap-1.5">
          {sortedPosts.map((post) => {
            const mediaUrl = post.media_urls?.[0] || '';
            const counts = getPostCounts(post.id);
            const postUserId = resolvePostUserId(post);
            const canManageThisPost = Boolean(isOwnProfile && user?.id && postUserId === user.id);
            const profileHidden = isPostProfileHidden(post);
            const mutationPending = profileVisibilityMutations.has(post.id);

            return (
              <div key={post.id} className="group relative aspect-[3/4] overflow-hidden bg-black sm:rounded-lg">
                <button
                  type="button"
                  onClick={() => setSelectedPost(post)}
                  className="absolute inset-0 h-full w-full text-left outline-none ring-ring/40 focus-visible:ring-2"
                >
                  {mediaUrl ? (
                    <video
                      src={mediaUrl}
                      poster={post.thumbnail_url || undefined}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
                      muted
                      playsInline
                      preload="auto"
                      onLoadedMetadata={(event) => {
                        if (post.thumbnail_url) return;
                        const video = event.currentTarget;
                        if (!Number.isFinite(video.duration) || video.duration <= 0) return;

                        const previewTime = Math.min(0.2, Math.max(0.04, video.duration * 0.05));
                        if (video.currentTime >= previewTime) return;

                        try {
                          video.currentTime = previewTime;
                        } catch {
                          // Some browsers can reject an early seek while media ranges are loading.
                          // The decoded first frame will still be shown once enough data is available.
                        }
                      }}
                    />
                  ) : (
                    <div className="h-full w-full bg-muted" />
                  )}

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10" />
                  <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 text-[11px] font-semibold text-white drop-shadow-sm sm:text-xs">
                    <Play className="h-3.5 w-3.5 fill-current" />
                    {formatCompactCount(counts.views_count)}
                  </span>
                </button>

                {canManageThisPost && (
                  <button
                    type="button"
                    disabled={mutationPending}
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleProfileVisibility(post);
                    }}
                    aria-label={profileHidden ? 'Profilga qaytarish' : 'Profildan yashirish'}
                    title={profileHidden ? 'Profilga qaytarish' : 'Profildan yashirish'}
                    className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-black/75 active:scale-90 disabled:opacity-50"
                  >
                    {profileHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="relative left-1/2 w-screen max-w-[640px] -translate-x-1/2 space-y-4 md:left-auto md:mx-auto md:w-full md:translate-x-0 md:space-y-6">
          {sortedPosts.map((post) => {
            const author = post.profile || {
              ...profile,
              is_verified:
                profile.is_verified ?? (isOwnProfile ? Boolean(authProfile?.is_verified) : false),
            };
            const postUserId = resolvePostUserId(post) || '';
            const isBookmarked = bookmarkedIds.has(post.id);
            const canManageThisPost = Boolean(isOwnProfile && user?.id && postUserId === user.id);
            const profileHidden = isPostProfileHidden(post);
            const canonicalPost: FeedPostCardPost = {
              ...post,
              user_id: postUserId,
              media_urls: post.media_urls ?? [],
              media_type: post.media_type ?? 'image',
              shares_count: post.shares_count ?? 0,
              views_count: post.views_count ?? 0,
              is_bookmarked: isBookmarked,
              profile_hidden_at: profileHidden ? (post.profile_hidden_at || new Date(0).toISOString()) : null,
              profile: {
                id: author.id || postUserId,
                username: author.username,
                display_name: author.display_name,
                avatar_url: author.avatar_url,
                is_verified: Boolean(author.is_verified),
              },
            };

            return (
              <FeedPostCard
                key={post.id}
                post={canonicalPost}
                onLike={() => void handleLike(post)}
                formatTime={formatFeedPostTime}
                realtimeCounts={getPostCounts(post.id)}
                onDelete={onDelete ? () => void onDelete(post.id) : undefined}
                onPin={onPin ? () => void onPin(post.id) : undefined}
                onBookmark={() => toggleBookmark(post.id)}
                isProfileHidden={profileHidden}
                onToggleProfileVisibility={
                  canManageThisPost ? () => toggleProfileVisibility(post) : undefined
                }
                isOwner={canManageThisPost}
              />
            );
          })}
        </div>
      )}

      {selectedPost && (
        <PostViewModal
          post={selectedPost}
          profile={selectedPost.profile || profile}
          open={Boolean(selectedPost)}
          onOpenChange={(open) => !open && setSelectedPost(null)}
          onLike={() => void handleLike(selectedPost)}
          isOwnProfile={Boolean(isOwnProfile && resolvePostUserId(selectedPost) === user?.id)}
        />
      )}
    </div>
  );
}
