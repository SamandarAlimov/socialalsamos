import { useEffect, useRef, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PostLikesViewsDialog } from '@/components/PostLikesViewsDialog';
import { useVideoSocialContext } from '@/components/video/VideoSocialContext';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { formatCompactNumber } from '@/lib/videoFormat';

interface PostLikedByFollowingProps {
  postId: string;
  likesCount?: number;
  viewsCount?: number;
  onClick?: () => void;
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
 * It waits until the row approaches the viewport, then intersects the current
 * user's following list with the post's likers. If counts are not supplied by
 * the parent, they are fetched lazily. Clicking the row opens the existing
 * premium likes/views sheet.
 */
export function PostLikedByFollowing({
  postId,
  likesCount,
  viewsCount,
  onClick,
  className,
  visibleWrapperClassName,
}: PostLikedByFollowingProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [resolvedLikes, setResolvedLikes] = useState(Math.max(0, likesCount ?? 0));
  const [resolvedViews, setResolvedViews] = useState(Math.max(0, viewsCount ?? 0));
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (typeof likesCount === 'number') setResolvedLikes(Math.max(0, likesCount));
  }, [likesCount]);

  useEffect(() => {
    if (typeof viewsCount === 'number') setResolvedViews(Math.max(0, viewsCount));
  }, [viewsCount]);

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
    if (typeof likesCount === 'number' && typeof viewsCount === 'number') return;

    let cancelled = false;
    void db
      .from('posts')
      .select('likes_count, views_count')
      .eq('id', postId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        if (typeof likesCount !== 'number') {
          setResolvedLikes(Math.max(0, Number(data.likes_count || 0)));
        }
        if (typeof viewsCount !== 'number') {
          setResolvedViews(Math.max(0, Number(data.views_count || 0)));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, likesCount, postId, viewsCount]);

  const { likedByFollowing } = useVideoSocialContext(
    postId,
    enabled,
    resolvedLikes,
  );

  const openLikes = () => {
    if (onClick) onClick();
    else setDialogOpen(true);
  };

  const hasSocialProof = likedByFollowing.length > 0 && resolvedLikes > 0;

  return (
    <>
      <div
        ref={sentinelRef}
        className={cn(
          hasSocialProof ? visibleWrapperClassName : 'h-px w-full',
        )}
      >
        {hasSocialProof && (
          <button
            type="button"
            onClick={openLikes}
            className={cn(
              'flex max-w-full items-center gap-2 text-left text-xs leading-none text-muted-foreground transition hover:text-foreground active:opacity-75',
              className,
            )}
            aria-label="Yoqtirganlarni ko‘rish"
          >
            <span className="flex shrink-0 -space-x-1.5">
              {likedByFollowing.slice(0, 2).map((profile) => (
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
              Liked by <span className="font-semibold text-foreground">{label(likedByFollowing[0])}</span>
              {resolvedLikes > 1 ? (
                <>
                  {' '}and{' '}
                  <span className="font-semibold text-foreground">
                    {formatCompactNumber(Math.max(0, resolvedLikes - 1))} others
                  </span>
                </>
              ) : null}
            </span>
          </button>
        )}
      </div>
      {!onClick && (
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
