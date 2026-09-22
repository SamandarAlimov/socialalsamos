import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useAuth } from '@/contexts/AuthContext';
import { usePostCollaborators } from '@/hooks/usePostCollaborators';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatCompactNumber } from '@/lib/videoFormat';

export interface VideoSocialProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean | null;
}

const FOLLOW_CHUNK_SIZE = 150;
const MAX_VISIBLE_SOCIAL_PROFILES = 3;
const SOCIAL_MATCH_LIMIT_PER_CHUNK = 24;
const FOLLOW_CACHE_TTL_MS = 5 * 60 * 1000;

let followingCache:
  | { userId: string; ids: string[]; expiresAt: number }
  | null = null;

async function getFollowingIds(userId: string): Promise<string[]> {
  if (
    followingCache?.userId === userId &&
    followingCache.expiresAt > Date.now()
  ) {
    return followingCache.ids;
  }

  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);

  if (error) throw error;

  const ids = Array.from(
    new Set(
      (data ?? [])
        .map((row) => String(row.following_id || ''))
        .filter(Boolean),
    ),
  );

  followingCache = {
    userId,
    ids,
    expiresAt: Date.now() + FOLLOW_CACHE_TTL_MS,
  };

  return ids;
}

function profileLabel(profile: VideoSocialProfile): string {
  return profile.username || profile.display_name || 'user';
}

export type VideoSocialProofKind = 'commented' | 'liked' | 'followed';

export interface VideoSocialProof {
  kind: VideoSocialProofKind;
  profiles: VideoSocialProfile[];
  totalCount: number;
}

type TimedActorRow = {
  user_id: string | null;
  created_at: string | null;
};

async function findRecentFollowingActors(
  table: 'comments' | 'post_likes',
  postId: string,
  followingIds: string[],
): Promise<string[]> {
  const candidates: Array<{ id: string; createdAt: number }> = [];

  for (let index = 0; index < followingIds.length; index += FOLLOW_CHUNK_SIZE) {
    const chunk = followingIds.slice(index, index + FOLLOW_CHUNK_SIZE);
    if (!chunk.length) continue;

    const { data, error } = await supabase
      .from(table)
      .select('user_id, created_at')
      .eq('post_id', postId)
      .in('user_id', chunk)
      .order('created_at', { ascending: false })
      .limit(SOCIAL_MATCH_LIMIT_PER_CHUNK);

    if (error) throw error;

    for (const row of (data ?? []) as TimedActorRow[]) {
      const id = String(row.user_id || '');
      if (!id) continue;
      const timestamp = row.created_at ? new Date(row.created_at).getTime() : 0;
      candidates.push({ id, createdAt: Number.isFinite(timestamp) ? timestamp : 0 });
    }
  }

  candidates.sort((a, b) => b.createdAt - a.createdAt);

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    ordered.push(candidate.id);
    if (ordered.length >= MAX_VISIBLE_SOCIAL_PROFILES) break;
  }
  return ordered;
}

async function findMutualFollowerIds(
  authorId: string,
  followingIds: string[],
): Promise<string[]> {
  const matched: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < followingIds.length; index += FOLLOW_CHUNK_SIZE) {
    const chunk = followingIds.slice(index, index + FOLLOW_CHUNK_SIZE);
    if (!chunk.length) continue;

    const { data, error } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', authorId)
      .in('follower_id', chunk)
      .limit(chunk.length);

    if (error) throw error;

    for (const row of data ?? []) {
      const id = String(row.follower_id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      matched.push(id);
    }
  }

  return matched;
}

async function loadProfiles(ids: string[]): Promise<Map<string, VideoSocialProfile>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, is_verified')
    .in('id', uniqueIds);

  if (error) throw error;
  return new Map(
    ((data ?? []) as VideoSocialProfile[]).map((profile) => [profile.id, profile]),
  );
}

function orderProfiles(
  ids: string[],
  byId: Map<string, VideoSocialProfile>,
): VideoSocialProfile[] {
  return ids
    .map((id) => byId.get(id))
    .filter((profile): profile is VideoSocialProfile => Boolean(profile));
}

export function useVideoSocialContext(
  postId: string,
  enabled: boolean,
  likesCount: number,
  commentsCount = 0,
  authorId?: string | null,
) {
  const { user } = useAuth();
  const { collaborators } = usePostCollaborators(enabled ? postId : null);
  const [commentedByFollowing, setCommentedByFollowing] = useState<VideoSocialProfile[]>([]);
  const [likedByFollowing, setLikedByFollowing] = useState<VideoSocialProfile[]>([]);
  const [followedByFollowing, setFollowedByFollowing] = useState<VideoSocialProfile[]>([]);
  const [followedByFollowingCount, setFollowedByFollowingCount] = useState(0);

  const acceptedCollaborators = useMemo<VideoSocialProfile[]>(
    () =>
      collaborators
        .filter((item) => item.status === 'accepted' && item.profile)
        .map((item) => ({
          id: item.profile!.id,
          username: item.profile!.username,
          display_name: item.profile!.display_name,
          avatar_url: item.profile!.avatar_url,
          is_verified: item.profile!.is_verified,
        })),
    [collaborators],
  );

  useEffect(() => {
    let cancelled = false;

    const reset = () => {
      if (cancelled) return;
      setCommentedByFollowing([]);
      setLikedByFollowing([]);
      setFollowedByFollowing([]);
      setFollowedByFollowingCount(0);
    };

    const load = async () => {
      if (!enabled || !user?.id || !postId) {
        reset();
        return;
      }

      try {
        const followingIds = await getFollowingIds(user.id);
        if (cancelled) return;

        if (followingIds.length === 0) {
          reset();
          return;
        }

        // Comments and likes are both loaded so the shared hook remains useful
        // to normal feed cards. Reels then applies Instagram-style precedence:
        // commented -> liked -> followed.
        const [commenterIds, likerIds] = await Promise.all([
          commentsCount > 0
            ? findRecentFollowingActors('comments', postId, followingIds)
            : Promise.resolve([] as string[]),
          likesCount > 0
            ? findRecentFollowingActors('post_likes', postId, followingIds)
            : Promise.resolve([] as string[]),
        ]);

        let mutualFollowerIds: string[] = [];
        if (
          commenterIds.length === 0 &&
          likerIds.length === 0 &&
          authorId &&
          authorId !== user.id
        ) {
          mutualFollowerIds = await findMutualFollowerIds(authorId, followingIds);
        }

        const profileIds = [
          ...commenterIds,
          ...likerIds,
          ...mutualFollowerIds.slice(0, MAX_VISIBLE_SOCIAL_PROFILES),
        ];
        const profileMap = await loadProfiles(profileIds);
        if (cancelled) return;

        setCommentedByFollowing(orderProfiles(commenterIds, profileMap));
        setLikedByFollowing(orderProfiles(likerIds, profileMap));
        setFollowedByFollowing(
          orderProfiles(
            mutualFollowerIds.slice(0, MAX_VISIBLE_SOCIAL_PROFILES),
            profileMap,
          ),
        );
        setFollowedByFollowingCount(mutualFollowerIds.length);
      } catch (error) {
        console.warn('Video social kontekstini yuklab bo‘lmadi:', error);
        reset();
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authorId, commentsCount, enabled, likesCount, postId, user?.id]);

  const socialProof = useMemo<VideoSocialProof | null>(() => {
    if (commentedByFollowing.length > 0 && commentsCount > 0) {
      return {
        kind: 'commented',
        profiles: commentedByFollowing,
        totalCount: Math.max(commentsCount, commentedByFollowing.length),
      };
    }

    if (likedByFollowing.length > 0 && likesCount > 0) {
      return {
        kind: 'liked',
        profiles: likedByFollowing,
        totalCount: Math.max(likesCount, likedByFollowing.length),
      };
    }

    if (followedByFollowing.length > 0 && followedByFollowingCount > 0) {
      return {
        kind: 'followed',
        profiles: followedByFollowing,
        totalCount: followedByFollowingCount,
      };
    }

    return null;
  }, [
    commentedByFollowing,
    commentsCount,
    followedByFollowing,
    followedByFollowingCount,
    likedByFollowing,
    likesCount,
  ]);

  return {
    acceptedCollaborators,
    commentedByFollowing,
    likedByFollowing,
    followedByFollowing,
    followedByFollowingCount,
    socialProof,
  };
}

export function VideoCollaboratorByline({
  collaborators,
  className,
}: {
  collaborators: VideoSocialProfile[];
  className?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (collaborators.length === 0) return null;

  const first = collaborators[0];
  const openProfile = (profile: VideoSocialProfile) => {
    setOpen(false);
    navigate('/user/' + encodeURIComponent(profile.username || profile.id));
  };

  return (
    <>
      {collaborators.length === 1 ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openProfile(first);
          }}
          className={cn(
            'min-w-0 truncate text-sm font-semibold text-white transition hover:text-white/85 hover:underline',
            className,
          )}
        >
          and {profileLabel(first)}
        </button>
      ) : (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
          className={cn(
            'shrink-0 text-sm font-semibold text-white transition hover:text-white/85 hover:underline',
            className,
          )}
        >
          and {collaborators.length} more
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="dark flex max-h-[78dvh] max-w-sm flex-col overflow-hidden border-white/10 bg-neutral-950 p-0 text-white">
          <DialogHeader className="shrink-0 border-b border-white/10 px-4 py-4 text-left">
            <DialogTitle className="text-base text-white">Hammualliflar</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {collaborators.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => openProfile(profile)}
                className="flex w-full items-center gap-3 border-b border-white/8 px-4 py-3 text-left transition last:border-b-0 hover:bg-white/[0.06]"
              >
                <Avatar className="h-10 w-10 shrink-0 ring-1 ring-white/10">
                  <AvatarImage src={profile.avatar_url || ''} />
                  <AvatarFallback className="bg-white/10 text-xs text-white">
                    {profileLabel(profile).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1 text-sm font-semibold text-white">
                    <span className="truncate">{profile.display_name || profileLabel(profile)}</span>
                    {profile.is_verified && <VerifiedBadge size="xs" />}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-white/55">
                    @{profile.username || 'user'} · Hammuallif
                  </span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function VideoSocialProofRow({
  proof,
  onLikesClick,
  onCommentsClick,
  onProfileClick,
  className,
}: {
  proof: VideoSocialProof | null;
  onLikesClick: () => void;
  onCommentsClick: () => void;
  onProfileClick: () => void;
  className?: string;
}) {
  if (!proof || proof.profiles.length === 0 || proof.totalCount <= 0) return null;

  const first = proof.profiles[0];
  const others = Math.max(0, proof.totalCount - 1);
  const othersLabel =
    others === 1 ? '1 other' : `${formatCompactNumber(others)} others`;

  const handleClick =
    proof.kind === 'commented'
      ? onCommentsClick
      : proof.kind === 'liked'
        ? onLikesClick
        : onProfileClick;

  const ariaLabel =
    proof.kind === 'commented'
      ? 'Izohlarni ko‘rish'
      : proof.kind === 'liked'
        ? 'Yoqtirganlarni ko‘rish'
        : 'Profilni ko‘rish';

  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        handleClick();
      }}
      className={cn(
        'flex max-w-full items-center gap-2 text-left text-[12px] leading-none text-white/90 transition active:opacity-75',
        className,
      )}
      aria-label={ariaLabel}
    >
      <span className="flex shrink-0 -space-x-1.5">
        {proof.profiles.slice(0, 2).map((profile) => (
          <Avatar
            key={profile.id}
            className="h-5 w-5 border border-white/85 bg-neutral-900 shadow-sm"
          >
            <AvatarImage src={profile.avatar_url || ''} />
            <AvatarFallback className="bg-neutral-800 text-[8px] font-semibold text-white">
              {profileLabel(profile).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ))}
      </span>

      <span className="min-w-0 truncate drop-shadow-sm">
        {proof.kind === 'commented' ? (
          <>
            <span className="font-semibold text-white">{profileLabel(first)}</span>
            {others > 0 ? (
              <> and <span className="font-semibold text-white">{othersLabel}</span></>
            ) : null}
            {' '}commented
          </>
        ) : proof.kind === 'liked' ? (
          <>
            Liked by <span className="font-semibold text-white">{profileLabel(first)}</span>
            {others > 0 ? (
              <> and <span className="font-semibold text-white">{othersLabel}</span></>
            ) : null}
          </>
        ) : (
          <>
            Followed by <span className="font-semibold text-white">{profileLabel(first)}</span>
            {others > 0 ? (
              <> and <span className="font-semibold text-white">{othersLabel}</span></>
            ) : null}
          </>
        )}
      </span>
    </button>
  );
}

export function VideoLikedByFollowing({
  profiles,
  likesCount,
  onClick,
  className,
}: {
  profiles: VideoSocialProfile[];
  likesCount: number;
  onClick: () => void;
  className?: string;
}) {
  if (profiles.length === 0 || likesCount <= 0) return null;

  const first = profiles[0];
  const others = Math.max(0, likesCount - 1);

  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex max-w-full items-center gap-2 text-left text-[12px] leading-none text-white/90 transition active:opacity-75',
        className,
      )}
      aria-label="Yoqtirganlarni ko‘rish"
    >
      <span className="flex shrink-0 -space-x-1.5">
        {profiles.slice(0, 2).map((profile) => (
          <Avatar
            key={profile.id}
            className="h-5 w-5 border border-white/85 bg-neutral-900 shadow-sm"
          >
            <AvatarImage src={profile.avatar_url || ''} />
            <AvatarFallback className="bg-neutral-800 text-[8px] font-semibold text-white">
              {profileLabel(profile).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ))}
      </span>
      <span className="min-w-0 truncate drop-shadow-sm">
        Liked by <span className="font-semibold text-white">{profileLabel(first)}</span>
        {others > 0 ? (
          <> and <span className="font-semibold text-white">{formatCompactNumber(others)} others</span></>
        ) : null}
      </span>
    </button>
  );
}
