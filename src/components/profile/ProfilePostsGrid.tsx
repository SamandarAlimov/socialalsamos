import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  BarChart3,
  Bookmark,
  Check,
  Clock,
  Eye,
  Grid3x3,
  Heart,
  ImageIcon,
  LayoutList,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Pin,
  Play,
  Repeat2,
  Share2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, ru, uz } from 'date-fns/locale';
import { PostViewModal } from '@/components/PostViewModal';
import { EditPostDialog } from '@/components/EditPostDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { PollDisplay, parsePollFromContent } from '@/components/PollDisplay';

interface Post {
  id: string;
  content: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  likes_count: number;
  comments_count: number;
  views_count?: number;
  is_pinned?: boolean;
  is_liked?: boolean;
  created_at: string;
}

interface ProfilePostsGridProps {
  posts: Post[];
  isOwnProfile: boolean;
  profile: {
    username: string | null;
    avatar_url: string | null;
    display_name: string | null;
  };
  onLike: (postId: string) => void;
  onDelete: (postId: string) => void;
  onPin: (postId: string) => void;
}

type ViewMode = 'feed' | 'grid';
type SortMode = 'newest' | 'oldest' | 'most_viewed' | 'least_viewed';

const DATE_LOCALES = { uz, ru, en: enUS } as const;

export function ProfilePostsGrid({
  posts,
  isOwnProfile,
  profile,
  onLike,
  onDelete,
  onPin,
}: ProfilePostsGridProps) {
  const { t, i18n } = useTranslation();
  // Single column feed is the default: posts have very different aspect ratios
  // and a 3 column grid crops or breaks most of them.
  const [viewMode, setViewMode] = useState<ViewMode>('feed');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [editPost, setEditPost] = useState<{ id: string; content: string | null } | null>(null);

  const dateLocale =
    DATE_LOCALES[(i18n.language?.split('-')[0] as keyof typeof DATE_LOCALES) || 'uz'] || uz;

  const sortLabels: Record<SortMode, string> = {
    newest: t('profile.sort.newest', { defaultValue: 'Yangidan eskiga' }),
    oldest: t('profile.sort.oldest', { defaultValue: 'Eskidan yangiga' }),
    most_viewed: t('profile.sort.mostViewed', { defaultValue: "Ko'p ko'rilgan" }),
    least_viewed: t('profile.sort.leastViewed', { defaultValue: "Kam ko'rilgan" }),
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
      // Pinned posts always stay on top, like on other pro platforms.
      if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;

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

  const handlePostClick = (post: Post) => {
    setSelectedPost(post);
    setShowPostModal(true);
  };

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const relativeTime = (value: string) => {
    try {
      return formatDistanceToNow(new Date(value), { addSuffix: true, locale: dateLocale });
    } catch {
      return '';
    }
  };

  if (posts.length === 0) {
    return null;
  }

  const ActiveSortIcon = sortIcons[sortMode];

  return (
    <div>
      {/* Toolbar: sorting + layout */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2 rounded-full">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">{sortLabels[sortMode]}</span>
              <ActiveSortIcon className="h-4 w-4 sm:hidden" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>
              {t('profile.sort.label', { defaultValue: 'Saralash' })}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(Object.keys(sortLabels) as SortMode[]).map((mode) => {
              const Icon = sortIcons[mode];
              return (
                <DropdownMenuItem
                  key={mode}
                  onClick={() => setSortMode(mode)}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{sortLabels[mode]}</span>
                  {sortMode === mode && <Check className="h-4 w-4 text-primary" />}
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

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sortedPosts.map((post) => {
            const { pollData, cleanContent } = parsePollFromContent(post.content || '');
            const hasMedia = !!post.media_urls && post.media_urls.length > 0;

            return (
              <button
                key={post.id}
                type="button"
                onClick={() => handlePostClick(post)}
                className="group relative aspect-square overflow-hidden rounded-2xl border border-border/60 bg-muted text-left"
              >
                {hasMedia ? (
                  <>
                    {/* Blurred backdrop keeps any aspect ratio intact. */}
                    <div
                      className="absolute inset-0 scale-110 bg-cover bg-center blur-xl opacity-60"
                      style={{ backgroundImage: `url(${post.media_urls![0]})` }}
                      aria-hidden="true"
                    />
                    {post.media_type === 'video' ? (
                      <video
                        src={post.media_urls![0]}
                        className="relative h-full w-full object-contain"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={post.media_urls![0]}
                        alt=""
                        loading="lazy"
                        className="relative h-full w-full object-contain"
                        onError={(e) => {
                          e.currentTarget.src = '/placeholder.svg';
                        }}
                      />
                    )}
                  </>
                ) : pollData ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/15 to-primary/5 p-3">
                    <BarChart3 className="h-6 w-6 text-primary" />
                    <p className="line-clamp-3 text-center text-xs text-muted-foreground">
                      {pollData.question}
                    </p>
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5 p-4">
                    <p className="line-clamp-5 text-center text-sm text-foreground">
                      {cleanContent || post.content}
                    </p>
                  </div>
                )}

                {post.is_pinned && (
                  <span className="absolute left-2 top-2 rounded-full bg-primary p-1 text-primary-foreground">
                    <Pin className="h-3 w-3" />
                  </span>
                )}

                {post.media_type === 'video' && (
                  <span className="absolute right-2 top-2 rounded-full bg-black/55 p-1 text-white backdrop-blur">
                    <Play className="h-3 w-3 fill-white" />
                  </span>
                )}

                {hasMedia && post.media_urls!.length > 1 && (
                  <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white backdrop-blur">
                    <ImageIcon className="h-3 w-3" />
                    {post.media_urls!.length}
                  </span>
                )}

                <div className="absolute inset-x-0 bottom-0 flex items-center gap-4 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="flex items-center gap-1">
                    <Heart className={cn('h-4 w-4', post.is_liked && 'fill-current text-red-400')} />
                    {formatCount(post.likes_count || 0)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-4 w-4" />
                    {formatCount(post.comments_count || 0)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="h-4 w-4" />
                    {formatCount(post.views_count || 0)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mx-auto max-w-2xl space-y-5">
          {sortedPosts.map((post) => {
            const { pollData, cleanContent } = parsePollFromContent(post.content || '');
            const hasMedia = !!post.media_urls && post.media_urls.length > 0;

            return (
              <article
                key={post.id}
                className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-10 w-10 ring-2 ring-primary/15">
                      <AvatarImage src={profile.avatar_url || ''} />
                      <AvatarFallback>
                        {(profile.display_name || profile.username || 'U')[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {profile.display_name || profile.username}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {relativeTime(post.created_at)}
                        </span>
                        {post.is_pinned && (
                          <span className="flex items-center gap-1 text-primary">
                            <Pin className="h-3 w-3" />
                            {t('post.pinned', { defaultValue: 'Mahkamlangan' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isOwnProfile && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-full"
                          aria-label={t('common.more', { defaultValue: "Ko'proq" })}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditPost({ id: post.id, content: post.content })}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {t('post.edit', { defaultValue: 'Postni tahrirlash' })}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onPin(post.id)}>
                          <Pin className="mr-2 h-4 w-4" />
                          {post.is_pinned
                            ? t('post.unpin', { defaultValue: 'Mahkamlashni bekor qilish' })
                            : t('post.pin', { defaultValue: 'Profilga mahkamlash' })}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(post.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('post.delete', { defaultValue: "O'chirish" })}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Text */}
                {cleanContent && (
                  <div className="px-4 pb-3">
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">
                      {cleanContent}
                    </p>
                  </div>
                )}

                {/* Poll */}
                {pollData && (
                  <div className="px-4 pb-3">
                    <PollDisplay postId={post.id} pollData={pollData} />
                  </div>
                )}

                {/* Media: never cropped, dark blurred backdrop for any ratio */}
                {hasMedia && (
                  <button
                    type="button"
                    onClick={() => handlePostClick(post)}
                    className="relative block w-full overflow-hidden bg-black/90"
                  >
                    <div
                      className="absolute inset-0 scale-110 bg-cover bg-center opacity-40 blur-2xl"
                      style={{ backgroundImage: `url(${post.media_urls![0]})` }}
                      aria-hidden="true"
                    />
                    {post.media_type === 'video' ? (
                      <video
                        src={post.media_urls![0]}
                        controls
                        playsInline
                        preload="metadata"
                        className="relative mx-auto max-h-[560px] w-auto max-w-full object-contain"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <img
                        src={post.media_urls![0]}
                        alt=""
                        loading="lazy"
                        className="relative mx-auto max-h-[560px] w-auto max-w-full object-contain"
                        onError={(e) => {
                          e.currentTarget.src = '/placeholder.svg';
                        }}
                      />
                    )}

                    {post.media_urls!.length > 1 && (
                      <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-xs text-white backdrop-blur">
                        <ImageIcon className="h-3.5 w-3.5" />
                        1/{post.media_urls!.length}
                      </span>
                    )}
                  </button>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 border-t border-border/60 px-2 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 rounded-full"
                    onClick={() => onLike(post.id)}
                    aria-label={t('post.like', { defaultValue: 'Like' })}
                  >
                    <Heart
                      className={cn('h-[18px] w-[18px]', post.is_liked && 'fill-red-500 text-red-500')}
                    />
                    <span className="text-sm">{formatCount(post.likes_count || 0)}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 rounded-full"
                    onClick={() => handlePostClick(post)}
                    aria-label={t('post.comment', { defaultValue: 'Izoh' })}
                  >
                    <MessageCircle className="h-[18px] w-[18px]" />
                    <span className="text-sm">{formatCount(post.comments_count || 0)}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 rounded-full"
                    aria-label={t('post.repost', { defaultValue: 'Repost' })}
                  >
                    <Repeat2 className="h-[18px] w-[18px]" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 rounded-full"
                    aria-label={t('common.share', { defaultValue: 'Ulashish' })}
                  >
                    <Share2 className="h-[18px] w-[18px]" />
                  </Button>

                  <span className="ml-auto flex items-center gap-1 pr-2 text-xs text-muted-foreground">
                    <Eye className="h-4 w-4" />
                    {formatCount(post.views_count || 0)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full"
                    aria-label={t('post.save', { defaultValue: 'Saqlash' })}
                  >
                    <Bookmark className="h-[18px] w-[18px]" />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedPost && (
        <PostViewModal
          post={selectedPost}
          profile={profile}
          open={showPostModal}
          onOpenChange={(open) => {
            setShowPostModal(open);
            if (!open) setSelectedPost(null);
          }}
          onLike={() => onLike(selectedPost.id)}
          isOwnProfile={isOwnProfile}
        />
      )}

      {editPost && (
        <EditPostDialog
          postId={editPost.id}
          open={!!editPost}
          onOpenChange={(o) => !o && setEditPost(null)}
          initialContent={editPost.content || ''}
        />
      )}
    </div>
  );
}
