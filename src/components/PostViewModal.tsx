import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  Pin,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CommentsSection } from '@/components/CommentsSection';
import { UserName } from '@/components/UserName';
import { useRealtimeCounts } from '@/hooks/useRealtimeCounts';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { PollDisplay, parsePollFromContent } from '@/components/PollDisplay';
import { RichText } from '@/components/RichText';
import { PostViewsDialog } from '@/components/PostViewsDialog';
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
    /**
     * Tasdiqlangan foydalanuvchi nishoni uchun. Ixtiyoriy - berilmasa
     * nishon chizilmaydi, shuning uchun eski chaqiruvlar buzilmaydi.
     */
    is_verified?: boolean | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLike: () => void;
  isOwnProfile?: boolean;
  focusCommentId?: string | null;
  onBack?: () => void;
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
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const { recordView } = usePostViews();

  const counts = useRealtimeCounts(post.id);

  // Modal eski `media_urls` bilan ishlaydi, stikerlar esa yangi
  // `post_media.edit_state` da saqlanadi - shuning uchun ikkisini
  // bog'lab, joriy kadrning tahrir holatini topamiz.
  const { media } = usePostMedia(open ? post.id : undefined);

  const mediaUrls = post.media_urls || [];
  const hasMedia = mediaUrls.length > 0;
  const hasMultipleMedia = mediaUrls.length > 1;
  const currentUrl = mediaUrls[currentMediaIndex];

  const currentEditState = useMemo(() => {
    if (!currentUrl || media.length === 0) return null;

    // Avval URL bo'yicha aniq moslik - tartib o'zgargan bo'lsa ham to'g'ri.
    const byUrl = media.find((item) => item.storage_url === currentUrl);
    const fallback = media[currentMediaIndex];
    const match = byUrl ?? fallback;

    return (match as (typeof media)[number] & WithEditState | undefined)?.edit_state ?? null;
  }, [currentUrl, media, currentMediaIndex]);

  useEffect(() => {
    if (open) {
      setCurrentMediaIndex(0);
      recordView(post.id);
    }
  }, [open, post.id, recordView]);

  const nextMedia = useCallback(() => {
    setCurrentMediaIndex((prev) => (mediaUrls.length ? (prev + 1) % mediaUrls.length : 0));
  }, [mediaUrls.length]);

  const prevMedia = useCallback(() => {
    setCurrentMediaIndex((prev) =>
      mediaUrls.length ? (prev - 1 + mediaUrls.length) % mediaUrls.length : 0,
    );
  }, [mediaUrls.length]);

  // Klaviatura bilan boshqarish - premium galereya tajribasi
  useEffect(() => {
    if (!open || !hasMultipleMedia) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') nextMedia();
      if (event.key === 'ArrowLeft') prevMedia();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hasMultipleMedia, nextMedia, prevMedia]);

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
      toast({
        title: t('post.share.copied', { defaultValue: 'Havola nusxalandi' }),
      });
    } catch {
      // foydalanuvchi bekor qildi - xabar kerak emas
    }
  };

  const likes = counts.likes_count ?? post.likes_count ?? 0;
  const comments = counts.comments_count ?? post.comments_count ?? 0;
  const views = counts.views_count ?? post.views_count ?? 0;

  const { pollData, cleanContent } = parsePollFromContent(post.content || '');
  const { location: legacyLocation, cleanContent: locationCleanContent } =
    parseLocationFromContent(cleanContent);
  const { music, cleanContent: textContent } = parseMusicFromContent(locationCleanContent);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[96vw] max-w-6xl overflow-hidden rounded-2xl border-border/60 bg-background p-0 shadow-2xl sm:rounded-2xl md:max-h-[92vh]">
          <div className="flex max-h-[92vh] flex-col md:flex-row">
            {/* Media */}
            {hasMedia && (
              <div className="group relative flex flex-1 items-center justify-center bg-gradient-to-b from-neutral-950 to-black min-h-[46vh] md:min-h-[560px]">
                {/*
                  Stiker qatlami media bilan bir xil o'lchamda bo'lishi shart.
                  `object-contain` konteynerni to'liq egallamaydi, shuning uchun
                  media'ni o'z o'lchamiga moslashuvchi `relative` o'ramga olamiz.
                */}
                <div className="relative inline-block max-h-[92vh]">
                  {post.media_type === 'video' ? (
                    <VideoPlayer
                      key={currentUrl}
                      src={currentUrl}
                      autoPlay
                      aspectMode="auto"
                      className="max-h-[92vh] max-w-full"
                    />
                  ) : (
                    <img
                      key={currentUrl}
                      src={currentUrl}
                      alt=""
                      className="max-h-[92vh] max-w-full animate-in fade-in duration-200 object-contain"
                    />
                  )}

                  <MediaStickerOverlay
                    editState={currentEditState}
                    idPrefix={`${post.id}-${currentMediaIndex}`}
                  />
                </div>

                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    aria-label={t('common.back', { defaultValue: 'Orqaga' })}
                    className="absolute left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                )}

                {post.is_pinned && (
                  <span
                    className={cn(
                      'absolute top-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur',
                      onBack ? 'left-14' : 'left-3',
                    )}
                  >
                    <Pin className="h-3 w-3" />
                    {t('post.pinned', { defaultValue: 'Mahkamlangan' })}
                  </span>
                )}

                {hasMultipleMedia && (
                  <>
                    <span className="absolute right-14 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                      {currentMediaIndex + 1} / {mediaUrls.length}
                    </span>

                    <button
                      type="button"
                      onClick={prevMedia}
                      aria-label={t('common.previous', { defaultValue: 'Oldingi' })}
                      className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition hover:bg-black/70 focus-visible:opacity-100 group-hover:opacity-100 md:opacity-0"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={nextMedia}
                      aria-label={t('common.next', { defaultValue: 'Keyingi' })}
                      className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition hover:bg-black/70 focus-visible:opacity-100 group-hover:opacity-100 md:opacity-0"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>

                    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
                      {mediaUrls.map((url, idx) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => setCurrentMediaIndex(idx)}
                          aria-label={`${idx + 1}`}
                          className={cn(
                            'h-1.5 rounded-full transition-all',
                            idx === currentMediaIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80',
                          )}
                        />
                      ))}
                    </div>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label={t('common.close', { defaultValue: 'Yopish' })}
                  className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Tafsilotlar */}
            <div
              className={cn(
                'flex min-h-0 flex-col bg-background',
                hasMedia ? 'md:w-[400px] md:border-l md:border-border/60' : 'w-full',
              )}
            >
              <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {onBack && !hasMedia && (
                    <button
                      type="button"
                      onClick={onBack}
                      aria-label={t('common.back', { defaultValue: 'Orqaga' })}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </button>
                  )}
                  <Avatar className="h-10 w-10 ring-2 ring-primary/25">
                    <AvatarImage src={profile.avatar_url || ''} />
                    <AvatarFallback>{profile.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    {/* Markazlashtirilgan: ism + tasdiq nishoni (UserName) */}
                    <div className="flex min-w-0 items-center gap-1">
                      <UserName
                        displayName={profile.display_name}
                        username={profile.username}
                        isVerified={profile.is_verified}
                        badgeSize="xs"
                        className="text-sm font-semibold leading-tight"
                      />
                      <PostCollaboratorByline
                        postId={post.id}
                        isOwner={isOwnProfile}
                        className="text-sm"
                      />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {profile.username ? `@${profile.username} \u00b7 ` : ''}
                      {format(new Date(post.created_at), 'd MMM yyyy, HH:mm')}
                    </p>
                  </div>
                </div>

                {isOwnProfile && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 rounded-full"
                    onClick={() => setShowEdit(true)}
                    aria-label={t('post.edit', { defaultValue: 'Postni tahrirlash' })}
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {(textContent || post.formatted_content || music || pollData || legacyLocation) && (
                  <div className="space-y-3 border-b border-border/60 px-4 py-3">
                    {(textContent || post.formatted_content) && (
                      <RichText
                        content={textContent}
                        formattedContent={post.formatted_content}
                        className="text-sm leading-relaxed"
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
                )}

                <div className="px-4 py-3">
                  <CommentsSection postId={post.id} focusCommentId={focusCommentId} />
                </div>
              </div>

              {/* Amallar paneli */}
              <div className="border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
                <div className="mb-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onLike}
                    aria-label={t('post.like', { defaultValue: 'Yoqtirish' })}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-90',
                      post.is_liked
                        ? 'text-red-500 hover:bg-red-500/10'
                        : 'text-muted-foreground hover:bg-muted hover:text-red-500',
                    )}
                  >
                    <Heart className={cn('h-[22px] w-[22px]', post.is_liked && 'fill-current')} />
                  </button>

                  <span className="mr-2 text-sm font-semibold tabular-nums">
                    {formatCompactCount(likes)}
                  </span>

                  <div className="flex h-10 items-center gap-1.5 rounded-full px-2 text-muted-foreground">
                    <MessageCircle className="h-[22px] w-[22px]" />
                    <span className="text-sm font-semibold tabular-nums">
                      {formatCompactCount(comments)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleShare}
                    aria-label={t('post.share.action', { defaultValue: 'Ulashish' })}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-90"
                  >
                    <Share2 className="h-[22px] w-[22px]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsBookmarked((prev) => !prev)}
                    aria-label={t('post.save', { defaultValue: 'Saqlash' })}
                    className={cn(
                      'ml-auto flex h-10 w-10 items-center justify-center rounded-full transition-all active:scale-90',
                      isBookmarked
                        ? 'text-primary hover:bg-primary/10'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Bookmark className={cn('h-[22px] w-[22px]', isBookmarked && 'fill-current')} />
                  </button>
                </div>

                <PostViewsDialog
                  postId={post.id}
                  viewsCount={views}
                  iconClassName="h-3.5 w-3.5"
                  textClassName="text-xs"
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <EditPostDialog
        postId={post.id}
        open={showEdit}
        onOpenChange={setShowEdit}
        initialContent={post.content || ''}
      />
    </>
  );
}
