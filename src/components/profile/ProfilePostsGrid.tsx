import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  BarChart3,
  Check,
  Clock,
  Eye,
  Grid3x3,
  Heart,
  Images,
  LayoutList,
  MessageCircle,
  Music2,
  Pin,
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
import { cn } from '@/lib/utils';
import { parsePollFromContent } from '@/components/PollDisplay';
import { useToast } from '@/hooks/use-toast';
import { useRealtimePostCounts } from '@/hooks/useRealtimePostCounts';
import { db } from '@/lib/db';
import {
  formatCompactCount,
  parseLocationFromContent,
  parseMusicFromContent,
} from '@/lib/postMarkers';

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
  onLike: (postId: string) => void | Promise<void>;
  onDelete: (postId: string) => void | Promise<void>;
  onPin: (postId: string) => void | Promise<void>;
  /** Postlar hali yuklanayotgan bo'lsa premium skeleton ko'rsatiladi. */
  isLoading?: boolean;
}

type ViewMode = 'feed' | 'grid';
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

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {Array.from({ length: 9 }).map((_, idx) => (
        <div
          key={idx}
          className="aspect-square animate-pulse rounded-2xl border border-border/60 bg-muted"
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
  isLoading = false,
}: ProfilePostsGridProps) {
  const { t } = useTranslation();
  const { user, profile: authProfile } = useAuth();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('feed');
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

      <div className="flex rounded-full bg-muted p-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('profile.view.feed', { defaultValue: 'Bir qator' })}
          className={cn('h-7 rounded-full px-3', viewMode === 'feed' && 'bg-background shadow-sm')}
          onClick={() => setViewMode('feed')}
        >
          <LayoutList className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('profile.view.grid', { defaultValue: 'Katakcha' })}
          className={cn('h-7 rounded-full px-3', viewMode === 'grid' && 'bg-background shadow-sm')}
          onClick={() => setViewMode('grid')}
        >
          <Grid3x3 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {toolbar}
        {viewMode === 'grid' ? <GridSkeleton /> : <FeedSkeleton />}
      </div>
    );
  }

  if (posts.length === 0) return null;

  return (
    <div>
      {toolbar}

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sortedPosts.map((post) => {
            const { pollData, cleanContent } = parsePollFromContent(post.content || '');
            const { location, cleanContent: locationCleanContent } = parseLocationFromContent(cleanContent);
            const { music, cleanContent: textContent } = parseMusicFromContent(locationCleanContent);
            const mediaUrls = post.media_urls ?? [];
            const hasMedia = mediaUrls.length > 0;
            const isVideo = post.media_type === 'video';
            const isCarousel = mediaUrls.length > 1;
            const isAudio = post.media_type === 'audio' || (!hasMedia && Boolean(music));

            return (
              <button
                key={post.id}
                type="button"
                onClick={() => setSelectedPost(post)}
                className="group relative aspect-square overflow-hidden rounded-2xl border border-border/60 bg-muted text-left outline-none ring-ring/40 transition-[box-shadow,transform] hover:shadow-md focus-visible:ring-2"
              >
                {hasMedia ? (
                  <>
                    <div
                      className="absolute inset-0 scale-110 bg-cover bg-center opacity-55 blur-xl"
                      style={{ backgroundImage: `url(${mediaUrls[0]})` }}
                      aria-hidden="true"
                    />
                    {isVideo ? (
                      <video
                        src={mediaUrls[0]}
                        className="relative h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.025]"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={mediaUrls[0]}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className="relative h-full w-full select-none object-contain transition-transform duration-300 group-hover:scale-[1.025]"
                        onError={(event) => {
                          event.currentTarget.src = '/placeholder.svg';
                        }}
                      />
                    )}
                  </>
                ) : isAudio && music ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/60 p-3">
                    {music.coverUrl ? (
                      <img src={music.coverUrl} alt="" className="h-16 w-16 rounded-xl object-cover shadow-sm" />
                    ) : (
                      <Music2 className="h-7 w-7" />
                    )}
                    <p className="line-clamp-2 text-center text-xs font-medium">{music.title}</p>
                    {music.artist && (
                      <p className="line-clamp-1 text-center text-[11px] text-muted-foreground">{music.artist}</p>
                    )}
                  </div>
                ) : location ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/50 p-3">
                    <p className="line-clamp-2 text-center text-xs font-medium">
                      {location.label || location.place?.name || 'Joylashuv'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                    </p>
                  </div>
                ) : pollData ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/50 p-3">
                    <BarChart3 className="h-6 w-6" />
                    <p className="line-clamp-3 text-center text-xs text-muted-foreground">{pollData.question}</p>
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted/40 p-4">
                    <p className="line-clamp-5 text-center text-sm text-foreground">{textContent || ''}</p>
                  </div>
                )}

                {post.is_pinned && (
                  <span className="absolute left-2 top-2 rounded-full bg-black/60 p-1 text-white backdrop-blur">
                    <Pin className="h-3 w-3" />
                  </span>
                )}

                <div className="absolute right-2 top-2 flex items-center gap-1">
                  {isCarousel && (
                    <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
                      <Images className="h-3 w-3" />
                      {mediaUrls.length}
                    </span>
                  )}
                  {isVideo && (
                    <span className="rounded-full bg-black/60 p-1 text-white backdrop-blur">
                      <Play className="h-3 w-3 fill-white" />
                    </span>
                  )}
                  {isAudio && (
                    <span className="rounded-full bg-black/60 p-1 text-white backdrop-blur">
                      <Music2 className="h-3 w-3" />
                    </span>
                  )}
                </div>

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:opacity-100" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 px-3 pb-2.5 text-xs font-semibold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:opacity-100">
                  <span className="flex items-center gap-1 tabular-nums">
                    <Heart className={cn('h-4 w-4', post.is_liked && 'fill-current')} />
                    {formatCompactCount(post.likes_count)}
                  </span>
                  <span className="flex items-center gap-1 tabular-nums">
                    <MessageCircle className="h-4 w-4" />
                    {formatCompactCount(post.comments_count)}
                  </span>
                  <span className="ml-auto flex items-center gap-1 tabular-nums">
                    <Eye className="h-4 w-4" />
                    {formatCompactCount(post.views_count)}
                  </span>
                </div>
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
                onLike={() => void onLike(post.id)}
                formatTime={formatFeedPostTime}
                realtimeCounts={getPostCounts(post.id)}
                onDelete={() => void onDelete(post.id)}
                onPin={() => void onPin(post.id)}
                onBookmark={() => toggleBookmark(post.id)}
                isOwner={isOwnProfile && postUserId === user?.id}
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
          onLike={() => void onLike(selectedPost.id)}
          isOwnProfile={isOwnProfile}
        />
      )}
    </div>
  );
}
