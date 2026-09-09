import { useEffect, useRef, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useVideoSocialContext } from '@/components/video/VideoSocialContext';
import { cn } from '@/lib/utils';
import { formatCompactNumber } from '@/lib/videoFormat';

interface PostLikedByFollowingProps {
  postId: string;
  likesCount: number;
  onClick: () => void;
  className?: string;
}

function label(profile: {
  username: string | null;
  display_name: string | null;
}) {
  return profile.username || profile.display_name || 'user';
}

/**
 * Instagram-style social proof for normal feed posts.
 *
 * The expensive follower/like intersection is delayed until this row first
 * enters the viewport. After that it stays hydrated, so scrolling away and
 * back does not repeat the query.
 */
export function PostLikedByFollowing({
  postId,
  likesCount,
  onClick,
  className,
}: PostLikedByFollowingProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const { likedByFollowing } = useVideoSocialContext(postId, enabled, likesCount);

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

  if (likedByFollowing.length === 0 || likesCount <= 0) {
    return <div ref={sentinelRef} aria-hidden className="h-px w-full" />;
  }

  const first = likedByFollowing[0];
  const others = Math.max(0, likesCount - 1);

  return (
    <div ref={sentinelRef} className={cn('px-4 pb-3 md:px-5', className)}>
      <button
        type="button"
        onClick={onClick}
        className="flex max-w-full items-center gap-2 text-left text-xs leading-none text-muted-foreground transition hover:text-foreground active:opacity-75"
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
          Liked by <span className="font-semibold text-foreground">{label(first)}</span>
          {others > 0 ? (
            <>
              {' '}and{' '}
              <span className="font-semibold text-foreground">
                {formatCompactNumber(others)} others
              </span>
            </>
          ) : null}
        </span>
      </button>
    </div>
  );
}
