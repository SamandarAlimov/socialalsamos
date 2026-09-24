import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Eye, Heart, MessageCircle, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PollDisplay, parsePollFromContent } from '@/components/PollDisplay';
import { PostActionsMenu } from '@/components/PostActionsMenu';
import { PostAuthorAvatars } from '@/components/PostAuthorAvatars';
import { PostCollaboratorByline } from '@/components/PostCollaboratorByline';
import { PostExtras } from '@/components/PostExtras';
import { PostLikesViewsDialog } from '@/components/PostLikesViewsDialog';
import { PostMusicCard } from '@/components/PostMusicCard';
import { RepostButton } from '@/components/RepostButton';
import { RichText } from '@/components/RichText';
import { SharePostDialog } from '@/components/SharePostDialog';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { VideoCommentsSheet } from '@/components/VideoCommentsSheet';
import { usePostViews } from '@/hooks/usePostViews';
import { cn } from '@/lib/utils';
import {
  parseLocationFromContent,
  parseMusicFromContent,
  resolvePostMusic,
} from '@/lib/postMarkers';

export interface FeedPostCardPost {
  id: string;
  user_id: string;
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
  profile_hidden_at?: string | null;
  post_kind?: string | null;
  has_poll?: boolean | null;
  created_at: string;
  profile?: {
    id?: string | null;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified?: boolean | null;
  } | null;
}

export interface FeedPostCardCounts {
  id: string;
  likes_count: number;
  comments_count: number;
  views_count: number;
  reposts_count: number;
  is_liked?: boolean;
}

interface FeedPostCardProps {
  post: FeedPostCardPost;
  onLike: () => void;
  formatTime: (date: string) => string;
  realtimeCounts: FeedPostCardCounts;
  onDelete?: () => void;
  onPin?: () => void;
  onBookmark?: () => void | Promise<void>;
  onHide?: () => void | Promise<void>;
  isProfileHidden?: boolean;
  onToggleProfileVisibility?: () => void | Promise<void>;
  isOwner?: boolean;
}

/**
 * Canonical Alsamos feed card.
 *
 * Public engagement numbers are read from source-of-truth interaction tables
 * through `useRealtimePostCounts`. `posts.*_count` denormalized columns are not
 * used for visible counts because historical rows can drift.
 */
export function FeedPostCard({
  post,
  onLike,
  formatTime,
  realtimeCounts,
  onDelete,
  onPin,
  onBookmark,
  onHide,
  isProfileHidden = false,
  onToggleProfileVisibility,
  isOwner,
}: FeedPostCardProps) {
  const navigate = useNavigate();
  const articleRef = useRef<HTMLElement | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [showAudienceDialog, setShowAudienceDialog] = useState(false);
  const [audienceDefaultTab, setAudienceDefaultTab] = useState<'likes' | 'views'>('likes');
  const [showShareDialog, setShowShareDialog] = useState(false);
  const { recordView, markEngaged, markProfileClick } = usePostViews();

  useEffect(() => {
    const node = articleRef.current;
    if (!node) return;

    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    const clearDwell = () => {
      if (dwellTimer) clearTimeout(dwellTimer);
      dwellTimer = null;
    };

    if (typeof IntersectionObserver === 'undefined') {
      dwellTimer = setTimeout(() => void recordView(post.id, node), 900);
      return clearDwell;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
          if (!dwellTimer) {
            dwellTimer = setTimeout(() => {
              dwellTimer = null;
              void recordView(post.id, node);
            }, 900);
          }
        } else {
          clearDwell();
        }
      },
      { threshold: [0, 0.55, 0.8] },
    );

    observer.observe(node);
    return () => {
      clearDwell();
      observer.disconnect();
    };
  }, [post.id, recordView]);

  const likesCount = realtimeCounts.likes_count;
  const commentsCount = realtimeCounts.comments_count;
  const viewsCount = realtimeCounts.views_count;
  const repostsCount = realtimeCounts.reposts_count;
  const isLiked = realtimeCounts.is_liked ?? post.is_liked;
  const hasStructuredPoll = Boolean(post.has_poll) || post.post_kind === 'poll';

  const markers = useMemo(() => {
    const poll = parsePollFromContent(post.content || '');
    const location = parseLocationFromContent(poll.cleanContent);
    const music = parseMusicFromContent(location.cleanContent);

    return {
      pollData: poll.pollData,
      legacyLocation: location.location,
      legacyLocationLabel: location.labelOnly,
      legacyMusic: resolvePostMusic({
        contentMusic: music.music,
        formattedContent: post.formatted_content,
        mediaUrls: post.media_urls,
        mediaType: post.media_type,
      }),
      textContent: music.cleanContent,
    };
  }, [post.content, post.formatted_content, post.media_urls, post.media_type]);

  const handleUserClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    markProfileClick(post.id);
    if (post.profile?.username) {
      navigate(`/user/${post.profile.username}`);
    } else if (post.user_id) {
      navigate(`/user/${post.user_id}`);
    }
  };

  const openAudience = (tab: 'likes' | 'views') => {
    markEngaged(post.id);
    setAudienceDefaultTab(tab);
    setShowAudienceDialog(true);
  };

  return (
    <article
      ref={articleRef}
      className="relative left-1/2 w-screen -translate-x-1/2 animate-fade-in overflow-hidden border-y border-border/70 bg-card/95 shadow-none transition-[box-shadow,border-color] duration-200 md:left-auto md:w-auto md:translate-x-0 md:rounded-3xl md:border md:shadow-sm md:hover:border-border md:hover:shadow-md"
    >
      <div className="flex items-center justify-between p-4 md:p-5">
        <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
          <PostAuthorAvatars
            postId={post.id}
            userId={post.user_id}
            username={post.profile?.username}
            displayName={post.profile?.display_name}
            avatarUrl={post.profile?.avatar_url}
            isVerified={Boolean(post.profile?.is_verified)}
            onOwnerClick={handleUserClick}
          />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <span
                className="cursor-pointer text-sm font-semibold hover:underline"
                onClick={handleUserClick}
              >
                {post.profile?.display_name || post.profile?.username || 'Anonymous'}
              </span>
              {post.profile?.is_verified && <VerifiedBadge size="xs" />}
              <PostCollaboratorByline postId={post.id} isOwner={isOwner} />
            </div>
            <p className="text-[11px] text-muted-foreground md:text-xs">
              <span className="cursor-pointer hover:underline" onClick={handleUserClick}>
                @{post.profile?.username || 'user'}
              </span>{' '}
              · {formatTime(post.created_at)}
            </p>
          </div>
        </div>
        <PostActionsMenu
          postId={post.id}
          postUserId={post.user_id}
          postContent={post.content ?? undefined}
          isPinned={post.is_pinned}
          isBookmarked={Boolean(post.is_bookmarked)}
          onToggleBookmark={onBookmark}
          onHide={onHide}
          onDelete={onDelete}
          onPin={onPin}
          isProfileHidden={isProfileHidden}
          onToggleProfileVisibility={onToggleProfileVisibility}
        />
      </div>

      {markers.textContent && (
        <div className="px-4 pb-3 md:px-5 md:pb-4">
          <RichText
            content={markers.textContent}
            formattedContent={post.formatted_content}
            className="text-sm leading-relaxed"
          />
        </div>
      )}

      {markers.legacyMusic && (
        <div className="px-4 pb-3 md:px-5 md:pb-4">
          <PostMusicCard music={markers.legacyMusic} />
        </div>
      )}

      {markers.pollData && !hasStructuredPoll && (
        <div className="px-4 pb-3 md:px-5 md:pb-4">
          <PollDisplay postId={post.id} pollData={markers.pollData} />
        </div>
      )}

      <PostExtras
        postId={post.id}
        hasPoll={hasStructuredPoll}
        isOwner={isOwner}
        legacyMediaUrls={post.media_urls}
        legacyMediaType={post.media_type}
        legacyLocation={markers.legacyLocation}
        legacyLocationLabel={markers.legacyLocationLabel}
        className="px-4 pb-4 md:px-5"
      />

      <div className="flex items-center justify-between border-t border-border/70 p-4 md:px-5">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="flex items-center gap-1.5 md:gap-2">
            <button
              type="button"
              onClick={() => {
                markEngaged(post.id);
                onLike();
              }}
              className={cn(
                'transition-colors touch-feedback',
                isLiked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500',
              )}
              aria-label="Yoqtirish"
            >
              <Heart className={cn('h-5 w-5', isLiked && 'fill-current')} />
            </button>
            <button
              type="button"
              onClick={() => openAudience('likes')}
              className={cn(
                'text-xs font-medium hover:underline md:text-sm',
                isLiked ? 'text-red-500' : 'text-muted-foreground',
              )}
            >
              {likesCount}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              markEngaged(post.id);
              setShowComments(true);
            }}
            className={cn(
              'flex items-center gap-1.5 transition-colors touch-feedback md:gap-2',
              showComments ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            aria-label="Izohlar"
          >
            <MessageCircle className="h-5 w-5" />
            <span className="text-xs font-medium md:text-sm">{commentsCount}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              markEngaged(post.id);
              setShowShareDialog(true);
            }}
            className="flex items-center text-muted-foreground transition-colors touch-feedback hover:text-foreground"
            aria-label="Ulashish"
            title="Ulashish"
          >
            <Share2 className="h-5 w-5" />
          </button>
          <RepostButton
            postId={post.id}
            postUserId={post.user_id}
            initialCount={repostsCount}
            size="sm"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => openAudience('views')}
            className="flex items-center gap-1.5 text-muted-foreground transition-colors touch-feedback hover:text-foreground md:gap-2"
            aria-label="Ko‘rishlar"
          >
            <Eye className="h-5 w-5" />
            <span className="text-xs font-medium md:text-sm">{viewsCount}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              markEngaged(post.id);
              void onBookmark?.();
            }}
            aria-pressed={Boolean(post.is_bookmarked)}
            aria-label={post.is_bookmarked ? 'Saqlanganlardan olib tashlash' : 'Postni saqlash'}
            className={cn(
              'transition-colors touch-feedback',
              post.is_bookmarked
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Bookmark className={cn('h-5 w-5', post.is_bookmarked && 'fill-current')} />
          </button>
        </div>
      </div>

      <VideoCommentsSheet
        isOpen={showComments}
        onClose={() => setShowComments(false)}
        postId={post.id}
        commentsCount={commentsCount}
        previewVideo={false}
      />

      <PostLikesViewsDialog
        postId={post.id}
        open={showAudienceDialog}
        onOpenChange={setShowAudienceDialog}
        likesCount={likesCount}
        viewsCount={viewsCount}
        defaultTab={audienceDefaultTab}
      />

      <SharePostDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        postId={post.id}
        postContent={post.content || undefined}
      />
    </article>
  );
}
