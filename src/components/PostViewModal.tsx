import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Share2,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { UserName } from '@/components/UserName';
import { useRealtimeCounts } from '@/hooks/useRealtimeCounts';
import { cn } from '@/lib/utils';
import { formatPostDateTime } from '@/lib/postDateTime';
import { useTranslation } from 'react-i18next';
import { PollDisplay, parsePollFromContent } from '@/components/PollDisplay';
import { RichText } from '@/components/RichText';
import { PostLikesViewsDialog } from '@/components/PostLikesViewsDialog';
import { VideoCommentsSheet } from '@/components/VideoCommentsSheet';
import { PostMusicCard } from '@/components/PostMusicCard';
import { PostLocationCard } from '@/components/PostLocationCard';
import { usePostViews } from '@/hooks/usePostViews';
import { EditPostDialog } from '@/components/EditPostDialog';
import { useToast } from '@/hooks/use-toast';
import {
  formatCompactCount,
  legacyLocationToPostLocation,
  parseLocationFromContent,
  parseMusicFromContent,
} from '@/lib/postMarkers';
import { usePostMedia } from '@/hooks/usePostMedia';
import { MediaStickerOverlay } from '@/components/stickers/MediaStickerOverlay';
import { VideoPlayer } from '@/components/VideoPlayer';
import { PostCollaboratorByline } from '@/components/PostCollaboratorByline';
import type { WithEditState } from '@/lib/stickerPlacements';
import { resolveStorageUrl } from '@/lib/mediaUpload';
import { usePlatformScrollLock } from '@/hooks/usePlatformScrollLock';
import {
  isTallPostPreviewRatio,
  normalizePostPreviewAspectRatio,
  parsePostMediaAspectRatio,
} from '@/lib/mediaAspectRatio';

interface PostViewModalProps {
  post: {
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
  };
  profile: {
    username: string | null;
    avatar_url: string | null;
    display_name: string | null;
    is_verified?: boolean | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLike: () => void;
  isOwnProfile?: boolean;
  focusCommentId?: string | null;
  onBack?: () => void;
}

type AudienceTab = 'likes' | 'views';

function useDesktopPostPreview() {
  const getMatches = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches;
  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)');
    const sync = () => setMatches(media.matches);
    media.addEventListener('change', sync);
    sync();
    return () => media.removeEventListener('change', sync);
  }, []);

  return matches;
}

export function PostViewModal({
  post,
  profile,
  open,
  onOpenChange,
  onLike,
  isOwnProfile = false,
  focusCommentId = null,
  onBack,
}: PostViewModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { recordView } = usePostViews();
  const isDesktopPreview = useDesktopPostPreview();

  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showAudience, setShowAudience] = useState(false);
  const [audienceTab, setAudienceTab] = useState<AudienceTab>('likes');
  const [runtimeAspectRatios, setRuntimeAspectRatios] = useState<Record<string, number>>({});

  usePlatformScrollLock(open);

  const counts = useRealtimeCounts(post.id);
  const { media } = usePostMedia(open ? post.id : undefined);
  const [resolvedLegacyMedia, setResolvedLegacyMedia] = useState<string[]>(post.media_urls ?? []);

  useEffect(() => {
    let cancelled = false;
    const source = (post.media_urls ?? []).filter(Boolean);

    if (!source.length) {
      setResolvedLegacyMedia([]);
      return;
    }

    void Promise.all(
      source.map(async (url) => {
        try {
          return await resolveStorageUrl(url);
        } catch (error) {
          console.warn('Post preview media URL resolve failed:', error);
          return url;
        }
      }),
    ).then((resolved) => {
      if (!cancelled) setResolvedLegacyMedia(resolved);
    });

    return () => {
      cancelled = true;
    };
  }, [post.id, post.media_urls]);

  useEffect(() => {
    setRuntimeAspectRatios({});
  }, [post.id]);

  const structuredVisuals = useMemo(
    () => media.filter((item) => item.kind === 'image' || item.kind === 'video'),
    [media],
  );

  const mediaEntries = useMemo(() => {
    if (structuredVisuals.length) {
      return structuredVisuals.map((item) => ({
        url: item.storage_url,
        kind: item.kind as 'image' | 'video',
        poster: item.thumbnail_url ?? null,
        editState: (item as typeof item & WithEditState).edit_state ?? null,
        aspectRatio: parsePostMediaAspectRatio(item.aspect_ratio, item.width, item.height),
      }));
    }

    return resolvedLegacyMedia.map((url) => {
      const isVideo =
        post.media_type === 'video' ||
        post.media_type === 'reel' ||
        post.media_type === 'short' ||
        /\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|hevc)(?:[?#].*)?$/i.test(url);

      return {
        url,
        kind: isVideo ? ('video' as const) : ('image' as const),
        poster: null,
        editState: null,
        aspectRatio: null,
      };
    });
  }, [post.media_type, resolvedLegacyMedia, structuredVisuals]);

  const mediaUrls = useMemo(() => mediaEntries.map((item) => item.url), [mediaEntries]);
  const hasMedia = mediaEntries.length > 0;
  const hasMultipleMedia = mediaEntries.length > 1;
  const currentEntry = mediaEntries[currentMediaIndex];
  const currentPreviewRatio = normalizePostPreviewAspectRatio(
    currentEntry?.aspectRatio ?? (currentEntry?.url ? runtimeAspectRatios[currentEntry.url] : null),
  );
  const currentPreviewIsTall = isTallPostPreviewRatio(currentPreviewRatio);

  const rememberCurrentAspectRatio = useCallback((ratio: number) => {
    if (!currentEntry?.url || !Number.isFinite(ratio) || ratio <= 0) return;
    const normalized = normalizePostPreviewAspectRatio(ratio);
    setRuntimeAspectRatios((current) => {
      if (current[currentEntry.url] === normalized) return current;
      return { ...current, [currentEntry.url]: normalized };
    });
  }, [currentEntry?.url]);

  useEffect(() => {
    setCurrentMediaIndex((index) =>
      mediaEntries.length === 0 ? 0 : Math.min(index, mediaEntries.length - 1),
    );
  }, [mediaEntries.length]);

  useEffect(() => {
    if (!open) return;
    setCurrentMediaIndex(0);
    setShowComments(Boolean(focusCommentId));
    setShowAudience(false);
    recordView(post.id);
  }, [focusCommentId, open, post.id, recordView]);

  const nextMedia = useCallback(() => {
    setCurrentMediaIndex((prev) => (mediaUrls.length ? (prev + 1) % mediaUrls.length : 0));
  }, [mediaUrls.length]);

  const prevMedia = useCallback(() => {
    setCurrentMediaIndex((prev) =>
      mediaUrls.length ? (prev - 1 + mediaUrls.length) % mediaUrls.length : 0,
    );
  }, [mediaUrls.length]);

  useEffect(() => {
    if (!open || !hasMultipleMedia) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') nextMedia();
      if (event.key === 'ArrowLeft') prevMedia();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasMultipleMedia, nextMedia, open, prevMedia]);

  const handleShare = async () => {
    const url = `${window.location.origin}/user/${profile.username ?? ''}?post=${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: profile.display_name || profile.username || 'Alsamos',
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast({ title: t('post.share.copied', { defaultValue: 'Havola nusxalandi' }) });
    } catch {
      // Native share cancellation is not an error for the user.
    }
  };

  const openAudience = useCallback((tab: AudienceTab) => {
    setAudienceTab(tab);
    setShowAudience(true);
  }, []);

  const dismissPreview = useCallback(() => onOpenChange(false), [onOpenChange]);
  const goBack = useCallback(() => {
    if (onBack) onBack();
    else dismissPreview();
  }, [dismissPreview, onBack]);

  const likes = counts.likes_count ?? post.likes_count ?? 0;
  const comments = counts.comments_count ?? post.comments_count ?? 0;
  const views = counts.views_count ?? post.views_count ?? 0;

  const { pollData, cleanContent } = parsePollFromContent(post.content || '');
  const { location: legacyLocation, cleanContent: locationCleanContent } = parseLocationFromContent(cleanContent);
  const { music, cleanContent: textContent } = parseMusicFromContent(locationCleanContent);

  const authorHeader = (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar className="h-10 w-10 shrink-0 ring-1 ring-border/70">
        <AvatarImage src={profile.avatar_url || ''} />
        <AvatarFallback>{profile.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <UserName
            displayName={profile.display_name}
            username={profile.username}
            isVerified={profile.is_verified}
            badgeSize="xs"
            className="truncate text-[15px] font-semibold leading-tight"
          />
          <PostCollaboratorByline postId={post.id} isOwner={isOwnProfile} className="text-sm" />
        </div>
        <p className="text-xs leading-snug text-muted-foreground">
          {profile.username ? `@${profile.username} · ` : ''}
          {formatPostDateTime(post.created_at)}
        </p>
      </div>
    </div>
  );

  const contentBlock = (textContent || post.formatted_content || music || pollData || legacyLocation) ? (
    <div className="space-y-3 px-4 py-3">
      {(textContent || post.formatted_content) && (
        <RichText
          content={textContent}
          formattedContent={post.formatted_content}
          className="text-[15px] leading-relaxed"
        />
      )}
      {music && <PostMusicCard music={music} />}
      {pollData && <PollDisplay postId={post.id} pollData={pollData} />}
      {legacyLocation && (
        <PostLocationCard
          location={legacyLocationToPostLocation(post.id, legacyLocation)}
          isOwner={false}
        />
      )}
    </div>
  ) : null;

  const mediaSurface = hasMedia ? (
    <div className="group relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-black">
      <div className="relative flex h-full max-h-full w-full items-center justify-center">
        {currentEntry?.kind === 'video' ? (
          <VideoPlayer
            key={currentEntry.url}
            src={currentEntry.url || ''}
            poster={currentEntry.poster || undefined}
            autoPlay={open}
            aspectMode="auto"
            onAspectRatio={rememberCurrentAspectRatio}
            className="h-full max-h-full w-full max-w-full"
          />
        ) : (
          <img
            key={currentEntry?.url}
            src={currentEntry?.url}
            alt=""
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth && image.naturalHeight) {
                rememberCurrentAspectRatio(image.naturalWidth / image.naturalHeight);
              }
            }}
            className="h-full w-full animate-in object-contain fade-in duration-200"
          />
        )}

        <MediaStickerOverlay
          editState={currentEntry?.editState ?? null}
          idPrefix={`${post.id}-${currentMediaIndex}`}
        />
      </div>

      {post.is_pinned && (
        <span className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
          <Pin className="h-3 w-3" />
          {t('post.pinned', { defaultValue: 'Mahkamlangan' })}
        </span>
      )}

      {hasMultipleMedia && (
        <>
          <span className="absolute right-3 top-3 z-20 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
            {currentMediaIndex + 1} / {mediaUrls.length}
          </span>
          <button
            type="button"
            onClick={prevMedia}
            aria-label={t('common.previous', { defaultValue: 'Oldingi' })}
            className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/70 active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={nextMedia}
            aria-label={t('common.next', { defaultValue: 'Keyingi' })}
            className="absolute right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/70 active:scale-95"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
            {mediaUrls.map((url, index) => (
              <button
                key={url}
                type="button"
                onClick={() => setCurrentMediaIndex(index)}
                aria-label={`${index + 1}`}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  index === currentMediaIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/45',
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  ) : null;

  const actions = (
    <div className="border-t border-border/60 bg-background px-3 py-2.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onLike}
          aria-label={t('post.like', { defaultValue: 'Yoqtirish' })}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90',
            post.is_liked ? 'text-red-500' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Heart className={cn('h-[23px] w-[23px]', post.is_liked && 'fill-current')} />
        </button>
        <button
          type="button"
          onClick={() => openAudience('likes')}
          className="-ml-1 mr-1 rounded-full px-1.5 py-2 text-sm font-semibold tabular-nums hover:bg-muted"
          aria-label={t('post.likes', { defaultValue: 'Likes' })}
        >
          {formatCompactCount(likes)}
        </button>

        <button
          type="button"
          onClick={() => setShowComments(true)}
          aria-label={t('post.comment', { defaultValue: 'Izohlar' })}
          className="flex h-10 items-center gap-1.5 rounded-full px-2 text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-[0.97]"
        >
          <MessageCircle className="h-[23px] w-[23px]" />
          <span className="text-sm font-semibold tabular-nums">{formatCompactCount(comments)}</span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          aria-label={t('post.share.action', { defaultValue: 'Ulashish' })}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-90"
        >
          <Share2 className="h-[22px] w-[22px]" />
        </button>

        <button
          type="button"
          onClick={() => openAudience('views')}
          className="ml-auto flex h-10 items-center gap-1.5 rounded-full px-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={t('post.views', { defaultValue: 'Views' })}
        >
          <Eye className="h-[22px] w-[22px]" />
          <span className="text-sm font-semibold tabular-nums">{formatCompactCount(views)}</span>
        </button>

        <button
          type="button"
          onClick={() => setIsBookmarked((value) => !value)}
          aria-label={t('post.save', { defaultValue: 'Saqlash' })}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90',
            isBookmarked ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Bookmark className={cn('h-[22px] w-[22px]', isBookmarked && 'fill-current')} />
        </button>
      </div>

      {comments > 0 && (
        <button
          type="button"
          onClick={() => setShowComments(true)}
          className="mt-0.5 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          {t('post.viewComments', {
            count: comments,
            defaultValue: `View all ${comments} comments`,
          })}
        </button>
      )}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          hideDefaultClose
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className={cn(
            'left-0 top-0 block h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 bg-background p-0 shadow-none sm:rounded-none',
            'xl:left-1/2 xl:top-1/2 xl:h-[min(860px,92dvh)] xl:w-[min(1180px,calc(100vw-48px))] xl:-translate-x-1/2 xl:-translate-y-1/2 xl:rounded-[28px] xl:border xl:border-border/60 xl:shadow-[0_28px_90px_rgba(15,23,42,0.28)]',
          )}
        >
          <DialogTitle className="sr-only">{t('post.preview', { defaultValue: 'Post preview' })}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('post.previewDescription', { defaultValue: 'Post details, media and engagement actions.' })}
          </DialogDescription>

          {!isDesktopPreview ? (
            <div className="flex h-full min-h-0 flex-col bg-background">
              <div className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/95 px-2 backdrop-blur-xl">
                <button
                  type="button"
                  onClick={goBack}
                  aria-label={onBack ? t('common.back', { defaultValue: 'Orqaga' }) : t('common.close', { defaultValue: 'Yopish' })}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition hover:bg-muted active:scale-95"
                >
                  {onBack ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
                </button>
                <span className="text-[16px] font-semibold">{t('post.post', { defaultValue: 'Post' })}</span>
                {isOwnProfile ? (
                  <button
                    type="button"
                    onClick={() => setShowEdit(true)}
                    aria-label={t('post.edit', { defaultValue: 'Postni tahrirlash' })}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                ) : <span className="h-10 w-10" />}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  {authorHeader}
                  {isOwnProfile && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hidden rounded-full sm:flex"
                      onClick={() => setShowEdit(true)}
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  )}
                </div>

                {contentBlock}

                {hasMedia && (
                  <div className="flex w-full items-center justify-center overflow-hidden bg-black">
                    <div
                      className={cn(
                        'relative flex max-w-full flex-none items-center justify-center overflow-hidden bg-black',
                        currentPreviewIsTall
                          ? 'h-[min(78dvh,860px)] w-auto'
                          : 'w-full',
                      )}
                      style={{ aspectRatio: String(currentPreviewRatio) }}
                    >
                      {mediaSurface}
                    </div>
                  </div>
                )}

                {actions}
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-0">
              {hasMedia && (
                <div className="relative flex min-w-0 flex-1 bg-black">
                  {mediaSurface}
                  {onBack && (
                    <button
                      type="button"
                      onClick={onBack}
                      aria-label={t('common.back', { defaultValue: 'Orqaga' })}
                      className="absolute left-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </button>
                  )}
                </div>
              )}

              <div className={cn('flex min-h-0 flex-col bg-background', hasMedia ? 'w-[420px] border-l border-border/60' : 'w-full')}>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                  {authorHeader}
                  <div className="flex items-center gap-1">
                    {isOwnProfile && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full"
                        onClick={() => setShowEdit(true)}
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={dismissPreview}
                      aria-label={t('common.close', { defaultValue: 'Yopish' })}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  {contentBlock}
                  {!hasMedia && <div className="min-h-[140px]" />}
                </div>
                {actions}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <VideoCommentsSheet
        isOpen={showComments}
        onClose={() => setShowComments(false)}
        postId={post.id}
        commentsCount={comments}
        previewVideo={false}
      />

      <PostLikesViewsDialog
        postId={post.id}
        open={showAudience}
        onOpenChange={setShowAudience}
        likesCount={likes}
        viewsCount={views}
        defaultTab={audienceTab}
      />

      <EditPostDialog
        postId={post.id}
        open={showEdit}
        onOpenChange={setShowEdit}
        initialContent={post.content || ''}
      />
    </>
  );
}
