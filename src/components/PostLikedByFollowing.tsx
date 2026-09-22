import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PostLikesViewsDialog } from '@/components/PostLikesViewsDialog';
import { VideoCommentsSheet } from '@/components/VideoCommentsSheet';
import { useVideoSocialContext } from '@/components/video/VideoSocialContext';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { formatCompactNumber } from '@/lib/videoFormat';

interface PostLikedByFollowingProps {
  postId: string;
  likesCount?: number;
  commentsCount?: number;
  viewsCount?: number;
  authorId?: string | null;
  /** Legacy likes-row click handler. Prefer onLikesClick. */
  onClick?: () => void;
  onLikesClick?: () => void;
  onCommentsClick?: () => void;
  onProfileClick?: () => void;
  className?: string;
  visibleWrapperClassName?: string;
}

function label(profile: {
  username: string | null;
  display_name: string | null;
}) {
  return profile.username || profile.display_name || 'user';
}

/**
 * Instagram-style social proof for normal posts.
 *
 * It waits until the row approaches the viewport, then builds Instagram-style
 * social proof from accounts the current user follows. Precedence is strict:
 * commented -> liked -> followed. Only the highest-priority applicable row is
 * rendered, and its action opens the matching premium surface.
 */
export function PostLikedByFollowing({
  postId,
  likesCount,
  commentsCount,
  viewsCount,
  authorId,
  onClick,
  onLikesClick,
  onCommentsClick,
  onProfileClick,
  className,
  visibleWrapperClassName,
}: PostLikedByFollowingProps) {
  const navigate = useNavigate();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [resolvedLikes, setResolvedLikes] = useState(Math.max(0, likesCount ?? 0));
  const [resolvedComments, setResolvedComments] = useState(Math.max(0, commentsCount ?? 0));
  const [resolvedViews, setResolvedViews] = useState(Math.max(0, viewsCount ?? 0));
  const [resolvedAuthorId, setResolvedAuthorId] = useState<string | null>(authorId ?? null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  useEffect(() => {
    if (typeof likesCount === 'number') setResolvedLikes(Math.max(0, likesCount));
  }, [likesCount]);

  useEffect(() => {
    if (typeof commentsCount === 'number') setResolvedComments(Math.max(0, commentsCount));
  }, [commentsCount]);

  useEffect(() => {
    if (typeof viewsCount === 'number') setResolvedViews(Math.max(0, viewsCount));
  }, [viewsCount]);

  useEffect(() => {
    if (authorId !== undefined) setResolvedAuthorId(authorId ?? null);
  }, [authorId]);

  useEffect(() => {
    if (enabled) return;
    const node = sentinelRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setEnabled(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setEnabled(true);
        observer.disconnect();
      },
      { rootMargin: '180px 0px', threshold: 0.01 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !postId) return;
    if (
      typeof likesCount === 'number' &&
      typeof commentsCount === 'number' &&
      typeof viewsCount === 'number' &&
      authorId !== undefined
    ) {
      return;
    }

    let cancelled = false;
    void db
      .from('posts')
      .select('likes_count, comments_count, views_count, user_id')
      .eq('id', postId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        if (typeof likesCount !== 'number') {
          setResolvedLikes(Math.max(0, Number(data.likes_count || 0)));
        }
        if (typeof commentsCount !== 'number') {
          setResolvedComments(Math.max(0, Number(data.comments_count || 0)));
        }
        if (typeof viewsCount !== 'number') {
          setResolvedViews(Math.max(0, Number(data.views_count || 0)));
        }
        if (authorId === undefined) {
          setResolvedAuthorId(data.user_id ? String(data.user_id) : null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authorId, commentsCount, enabled, likesCount, postId, viewsCount]);

  const { socialProof } = useVideoSocialContext(
    postId,
    enabled,
    resolvedLikes,
    resolvedComments,
    resolvedAuthorId,
  );

  const openLikes = () => {
    if (onLikesClick) onLikesClick();
    else if (onClick) onClick();
    else setDialogOpen(true);
  };

  const openComments = () => {
    if (onCommentsClick) onCommentsClick();
    else setCommentsOpen(true);
  };

  const openProfile = () => {
    if (onProfileClick) {
      onProfileClick();
      return;
    }
    if (resolvedAuthorId) navigate(`/user/${resolvedAuthorId}`);
  };

  const hasSocialProof = Boolean(
    socialProof &&
      socialProof.profiles.length > 0 &&
      socialProof.totalCount > 0,
  );

  const firstProfile = socialProof?.profiles[0] ?? null;
  const othersCount = socialProof
    ? Math.max(0, socialProof.totalCount - 1)
    : 0;
  const othersLabel =
    othersCount === 1 ? '1 other' : `${formatCompactNumber(othersCount)} others`;

  const handleSocialProofClick = () => {
    if (!socialProof) return;
    if (socialProof.kind === 'commented') {
      openComments();
      return;
    }
    if (socialProof.kind === 'liked') {
      openLikes();
      return;
    }
    openProfile();
  };

  return (
    <>
      <div
        ref={sentinelRef}
        className={cn(
          hasSocialProof ? visibleWrapperClassName : 'h-px w-full',
        )}
      >
        {hasSocialProof && socialProof && firstProfile && (
          <button
            type="button"
            onClick={handleSocialProofClick}
            className={cn(
              'flex max-w-full items-center gap-2 text-left text-xs leading-none text-muted-foreground transition hover:text-foreground active:opacity-75',
              className,
            )}
            aria-label={
              socialProof.kind === 'commented'
                ? 'Izohlarni ko‘rish'
                : socialProof.kind === 'liked'
                  ? 'Yoqtirganlarni ko‘rish'
                  : 'Post muallifi profilini ko‘rish'
            }
          >
            <span className="flex shrink-0 -space-x-1.5">
              {socialProof.profiles.slice(0, 2).map((profile) => (
                <Avatar
                  key={profile.id}
                  className="h-5 w-5 border border-background bg-muted shadow-sm"
                >
                  <AvatarImage src={profile.avatar_url || ''} />
                  <AvatarFallback className="text-[8px] font-semibold">
                    {label(profile).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
            </span>

            <span className="min-w-0 truncate">
              {socialProof.kind === 'commented' ? (
                <>
                  <span className="font-semibold text-foreground">{label(firstProfile)}</span>
                  {othersCount > 0 ? (
                    <> and <span className="font-semibold text-foreground">{othersLabel}</span></>
                  ) : null}
                  {' '}commented
                </>
              ) : socialProof.kind === 'liked' ? (
                <>
                  Liked by <span className="font-semibold text-foreground">{label(firstProfile)}</span>
                  {othersCount > 0 ? (
                    <> and <span className="font-semibold text-foreground">{othersLabel}</span></>
                  ) : null}
                </>
              ) : (
                <>
                  Followed by <span className="font-semibold text-foreground">{label(firstProfile)}</span>
                  {othersCount > 0 ? (
                    <> and <span className="font-semibold text-foreground">{othersLabel}</span></>
                  ) : null}
                </>
              )}
            </span>
          </button>
        )}
      </div>
      {!onCommentsClick && (
        <VideoCommentsSheet
          isOpen={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          postId={postId}
          commentsCount={resolvedComments}
          previewVideo={false}
        />
      )}

      {!onLikesClick && !onClick && (
        <PostLikesViewsDialog
          postId={postId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          likesCount={resolvedLikes}
          viewsCount={resolvedViews}
          defaultTab="likes"
        />
      )}
    </>
  );
}
