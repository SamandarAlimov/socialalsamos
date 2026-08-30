import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  BarChart3,
  Bookmark,
  Check,
  Clock,
  Copy,
  Eye,
  Grid3x3,
  Heart,
  Images,
  LayoutList,
  MessageCircle,
  MoreHorizontal,
  Music2,
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
import { PostCollaboratorByline } from '@/components/PostCollaboratorByline';
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
import { PostMusicCard } from '@/components/PostMusicCard';
import { RichText } from '@/components/RichText';
import { useToast } from '@/hooks/use-toast';
import { formatCompactCount, parseMusicFromContent } from '@/lib/postMarkers';

interface Post {
  id: string;
  content: string | null;
  formatted_content?: unknown;
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
  /** Postlar hali yuklanayotgan bo'lsa premium skeleton ko'rsatiladi. */
  isLoading?: boolean;
}

type ViewMode = 'feed' | 'grid';
type SortMode = 'newest' | 'oldest' | 'most_viewed' | 'least_viewed';

const DATE_LOCALES = { uz, ru, en: enUS } as const;

/** Grid uchun yuklanish skeleti */
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

/** Feed uchun yuklanish skeleti */
function FeedSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="overflow-hidden rounded-2xl border border-border/60 bg-card"
          style={{ animationDelay: `${idx * 90}ms` }}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 animate-pulse rounded-full bg-muted" />
              <div className="h-2.5 w-20 animate-pulse rounded-full bg-muted" />
            </div>
          </div>
          <div className="space-y-2 px-4 pb-3">
            <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-4/5 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="h-64 animate-pulse bg-muted" />
          <div className="flex gap-3 border-t border-border/60 px-4 py-3">
            <div className="h-7 w-16 animate-pulse rounded-full bg-muted" />
            <div className="h-7 w-16 animate-pulse rounded-full bg-muted" />
            <div className="h-7 w-10 animate-pulse rounded-full bg-muted" />
          </div>
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
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  // Bir ustunli feed asosiy ko'rinish: postlarning nisbati juda xilma-xil,
  // 3 ustunli katak ko'pini kesib yuboradi.
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
    most_viewed: t('profile.sort.mostViewed', { defaultValue: 'Ko\u2019p ko\u2019rilgan' }),
    least_viewed: t('profile.sort.leastViewed', { defaultValue: 'Kam ko\u2019rilgan' }),
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
      // Mahkamlangan postlar boshqa professional platformalarda bo'lgani kabi
      // doim yuqorida turadi.
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

  const relativeTime = (value: string) => {
    try {
      return formatDistanceToNow(new Date(value), { addSuffix: true, locale: dateLocale });
    } catch {
      return '';
    }
  };

  const sharePost = async (postId: string) => {
    const url = `${window.location.origin}/user/${profile.username ?? ''}?post=${postId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: profile.display_name || profile.username || 'Alsamos', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast({ title: t('post.share.copied', { defaultValue: 'Havola nusxalandi' }) });
    } catch {
      // foydalanuvchi bekor qildi
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
  );

  if (isLoading) {
    return (
      <div>
        {toolbar}
        {viewMode === 'grid' ? <GridSkeleton /> : <FeedSkeleton />}
      </div>
    );
  }

  if (posts.length === 0) {
    return null;
  }

  return (
    <div>
      {toolbar}

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sortedPosts.map((post) => {
            const { pollData, cleanContent } = parsePollFromContent(post.content || '');
            const { music, cleanContent: textContent } = parseMusicFromContent(cleanContent);
            const mediaUrls = post.media_urls ?? [];
            const hasMedia = mediaUrls.length > 0;
            const isVideo = post.media_type === 'video';
            const isCarousel = mediaUrls.length > 1;
            const isAudio = post.media_type === 'audio' || (!hasMedia && !!music);

            return (
              <button
                key={post.id}
                type="button"
                onClick={() => handlePostClick(post)}
                className="group relative aspect-square overflow-hidden rounded-2xl border border-border/60 bg-muted text-left outline-none ring-primary/40 transition-shadow focus-visible:ring-2"
              >
                {hasMedia ? (
                  <>
                    {/* Xiralashgan fon har qanday nisbatni saqlab qoladi. */}
                    <div
                      className="absolute inset-0 scale-110 bg-cover bg-center opacity-60 blur-xl"
                      style={{ backgroundImage: `url(${mediaUrls[0]})` }}
                      aria-hidden="true"
                    />
                    {isVideo ? (
                      <video
                        src={mediaUrls[0]}
                        className="relative h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={mediaUrls[0]}
                        alt=""
                        loading="lazy"
                        className="relative h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                        onError={(e) => {
                          e.currentTarget.src = '/placeholder.svg';
                        }}
                      />
                    )}
                  </>
                ) : isAudio && music ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-3">
                    {music.coverUrl ? (
                      <img
                        src={music.coverUrl}
                        alt=""
                        loading="lazy"
                        className="h-16 w-16 rounded-xl object-cover shadow-md"
                      />
                    ) : (
                      <Music2 className="h-7 w-7 text-primary" />
                    )}
                    <p className="line-clamp-2 text-center text-xs font-medium">{music.title}</p>
                    {music.artist && (
                      <p className="line-clamp-1 text-center text-[11px] text-muted-foreground">
                        {music.artist}
                      </p>
                    )}
                  </div>
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
                      {textContent || cleanContent || post.content}
                    </p>
                  </div>
                )}

                {/* Chap yuqori: mahkamlangan belgisi */}
                {post.is_pinned && (
                  <span className="absolute left-2 top-2 rounded-full bg-primary p-1 text-primary-foreground shadow-sm">
                    <Pin className="h-3 w-3" />
                  </span>
                )}

                {/* O'ng yuqori: media turi belgilari (ustma-ust tushmaydi) */}
                <div className="absolute right-2 top-2 flex items-center gap-1">
                  {isCarousel && (
                    <span className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
                      <Images className="h-3 w-3" />
                      {mediaUrls.length}
                    </span>
                  )}
                  {isVideo && (
                    <span className="rounded-full bg-black/55 p-1 text-white backdrop-blur">
                      <Play className="h-3 w-3 fill-white" />
                    </span>
                  )}
                  {isAudio && (
                    <span className="rounded-full bg-black/55 p-1 text-white backdrop-blur">
                      <Music2 className="h-3 w-3" />
                    </span>
                  )}
                  {!hasMedia && !isAudio && pollData && (
                    <span className="rounded-full bg-black/55 p-1 text-white backdrop-blur">
                      <BarChart3 className="h-3 w-3" />
                    </span>
                  )}
                </div>

                {/* Statistika overlay: hover/fokusda, mobil ekranda doim */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:opacity-100" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 px-3 pb-2.5 text-xs font-semibold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:opacity-100">
                  <span className="flex items-center gap-1 tabular-nums">
                    <Heart className={cn('h-4 w-4', post.is_liked && 'fill-current text-red-400')} />
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
        <div className="mx-auto max-w-2xl space-y-5">
          {sortedPosts.map((post) => {
            const { pollData, cleanContent } = parsePollFromContent(post.content || '');
            const { music, cleanContent: textContent } = parseMusicFromContent(cleanContent);
            const mediaUrls = post.media_urls ?? [];
            const hasMedia = mediaUrls.length > 0;
            const isVideo = post.media_type === 'video';

            return (
              <article
                key={post.id}
                className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all hover:border-border hover:shadow-md"
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
                        <PostCollaboratorByline
                          postId={post.id}
                          isOwner={isOwnProfile}
                          className="ml-1 text-sm"
                        />
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
                          aria-label={t('common.more', { defaultValue: 'Ko\u2019proq' })}
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
                        <DropdownMenuItem onClick={() => void sharePost(post.id)}>
                          <Copy className="mr-2 h-4 w-4" />
                          {t('post.copyLink', { defaultValue: 'Havolani nusxalash' })}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(post.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('post.delete', { defaultValue: 'O\u2019chirish' })}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Matn */}
                {(textContent || post.formatted_content) && (
                  <div className="px-4 pb-3">
                    <RichText
                      content={textContent}
                      formattedContent={post.formatted_content}
                      className="text-[15px] leading-relaxed text-foreground"
                    />
                  </div>
                )}

                {/* Musiqa — avval bu yerda xom JSON chiqib ketardi */}
                {music && (
                  <div className="px-4 pb-3">
                    <PostMusicCard music={music} />
                  </div>
                )}

                {/* So'rovnoma */}
                {pollData && (
                  <div className="px-4 pb-3">
                    <PollDisplay postId={post.id} pollData={pollData} />
                  </div>
                )}

                {/* Media: kesilmaydi, har qanday nisbat uchun xira fon */}
                {hasMedia && (
                  <button
                    type="button"
                    onClick={() => handlePostClick(post)}
                    className="group/media relative block w-full overflow-hidden bg-black/90"
                  >
                    <div
                      className="absolute inset-0 scale-110 bg-cover bg-center opacity-40 blur-2xl"
                      style={{ backgroundImage: `url(${mediaUrls[0]})` }}
                      aria-hidden="true"
                    />
                    {isVideo ? (
                      <video
                        src={mediaUrls[0]}
                        controls
                        playsInline
                        preload="metadata"
                        className="relative mx-auto max-h-[560px] w-auto max-w-full object-contain"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <img
                        src={mediaUrls[0]}
                        alt=""
                        loading="lazy"
                        className="relative mx-auto max-h-[560px] w-auto max-w-full object-contain"
                        onError={(e) => {
                          e.currentTarget.src = '/placeholder.svg';
                        }}
                      />
                    )}

                    {mediaUrls.length > 1 && (
                      <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur">
                        <Images className="h-3.5 w-3.5" />
                        1/{mediaUrls.length}
                      </span>
                    )}
                  </button>
                )}

                {/* Amallar */}
                <div className="flex items-center gap-1 border-t border-border/60 px-2 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 rounded-full transition-transform active:scale-90"
                    onClick={() => onLike(post.id)}
                    aria-label={t('post.like', { defaultValue: 'Yoqtirish' })}
                  >
                    <Heart
                      className={cn('h-[18px] w-[18px]', post.is_liked && 'fill-red-500 text-red-500')}
                    />
                    <span className="text-sm tabular-nums">{formatCompactCount(post.likes_count)}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 rounded-full"
                    onClick={() => handlePostClick(post)}
                    aria-label={t('post.comment', { defaultValue: 'Izoh' })}
                  >
                    <MessageCircle className="h-[18px] w-[18px]" />
                    <span className="text-sm tabular-nums">
                      {formatCompactCount(post.comments_count)}
                    </span>
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
                    onClick={() => void sharePost(post.id)}
                    aria-label={t('common.share', { defaultValue: 'Ulashish' })}
                  >
                    <Share2 className="h-[18px] w-[18px]" />
                  </Button>

                  <span className="ml-auto flex items-center gap-1 pr-2 text-xs tabular-nums text-muted-foreground">
                    <Eye className="h-4 w-4" />
                    {formatCompactCount(post.views_count)}
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
