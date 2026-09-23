import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  Clock,
  Eye,
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
  likes_count: number;
  comments_count: number;
  shares_count?: number;
  reposts_count?: number;
  views_count?: number;
  is_pinned?: boolean;
  is_liked?: boolean;
  is_bookmarked?: boolean;
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
    <div className="grid grid-cols-3 gap-[2px] sm:gap-1.5">
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
    <div className="relative left-1/2 w-[calc(100vw-24px)] max-w-[640px] -translate-x-1/2 space-y-4 sm:left-auto sm:mx-auto sm:w-full sm:translate-x-0 md:space-y-6">
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="overflow-hidden rounded-2xl border border-border/70 bg-card/95 md:rounded-3xl"
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
    const list = [...posts];
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
  }, [posts, sortMode]);

  const postIds = useMemo(() => sortedPosts.map((post) => post.id), [sortedPosts]);
  const { getPostCounts } = useRealtimePostCounts(postIds, user?.id || null);

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
    <div className="mb-4 flex items-center">
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

  return (
    <div>
      {toolbar}

      {layout === 'reels-grid' ? (
        <div className="grid grid-cols-3 gap-[2px] sm:gap-1.5">
          {sortedPosts.map((post) => {
            const mediaUrl = post.media_urls?.[0] || '';
            const counts = getPostCounts(post.id);

            return (
              <button
                key={post.id}
                type="button"
                onClick={() => setSelectedPost(post)}
                className="group relative aspect-[3/4] overflow-hidden bg-black text-left outline-none ring-ring/40 focus-visible:ring-2 sm:rounded-lg"
              >
                {mediaUrl ? (
                  <video
                    src={mediaUrl}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
                    muted
                    playsInline
                    preload="metadata"
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
            );
          })}
        </div>
      ) : (
        <div className="relative left-1/2 w-[calc(100vw-24px)] max-w-[640px] -translate-x-1/2 space-y-4 sm:left-auto sm:mx-auto sm:w-full sm:translate-x-0 md:space-y-6">
          {sortedPosts.map((post) => {
            const author = post.profile || {
              ...profile,
              is_verified:
                profile.is_verified ?? (isOwnProfile ? Boolean(authProfile?.is_verified) : false),
            };
            const postUserId = post.user_id || post.profile?.id || (isOwnProfile ? user?.id : null) || '';
            const isBookmarked = bookmarkedIds.has(post.id);
            const canonicalPost: FeedPostCardPost = {
              ...post,
              user_id: postUserId,
              media_urls: post.media_urls ?? [],
              media_type: post.media_type ?? 'image',
              shares_count: post.shares_count ?? 0,
              views_count: post.views_count ?? 0,
              is_bookmarked: isBookmarked,
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
                isOwner={Boolean(isOwnProfile && postUserId === user?.id)}
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
          isOwnProfile={Boolean(isOwnProfile && (selectedPost.user_id || user?.id) === user?.id)}
        />
      )}
    </div>
  );
}
