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
const MAX_VISIBLE_SOCIAL_LIKERS = 3;

function profileLabel(profile: VideoSocialProfile): string {
  return profile.username || profile.display_name || 'user';
}

export function useVideoSocialContext(
  postId: string,
  enabled: boolean,
  likesCount: number,
) {
  const { user } = useAuth();
  const { collaborators } = usePostCollaborators(enabled ? postId : null);
  const [likedByFollowing, setLikedByFollowing] = useState<VideoSocialProfile[]>([]);

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

    const load = async () => {
      if (!enabled || !user?.id || !postId || likesCount <= 0) {
        if (!cancelled) setLikedByFollowing([]);
        return;
      }

      try {
        const { data: followRows, error: followError } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);

        if (followError) throw followError;

        const followingIds = Array.from(
          new Set(
            (followRows ?? [])
              .map((row) => String(row.following_id || ''))
              .filter(Boolean),
          ),
        );

        if (followingIds.length === 0) {
          if (!cancelled) setLikedByFollowing([]);
          return;
        }

        const matchedIds: string[] = [];
        const seen = new Set<string>();

        for (
          let index = 0;
          index < followingIds.length && matchedIds.length < MAX_VISIBLE_SOCIAL_LIKERS;
          index += FOLLOW_CHUNK_SIZE
        ) {
          const chunk = followingIds.slice(index, index + FOLLOW_CHUNK_SIZE);
          const { data: likeRows, error: likeError } = await supabase
            .from('post_likes')
            .select('user_id')
            .eq('post_id', postId)
            .in('user_id', chunk)
            .limit(MAX_VISIBLE_SOCIAL_LIKERS - matchedIds.length);

          if (likeError) throw likeError;

          for (const row of likeRows ?? []) {
            const id = String(row.user_id || '');
            if (!id || seen.has(id)) continue;
            seen.add(id);
            matchedIds.push(id);
            if (matchedIds.length >= MAX_VISIBLE_SOCIAL_LIKERS) break;
          }
        }

        if (matchedIds.length === 0) {
          if (!cancelled) setLikedByFollowing([]);
          return;
        }

        const { data: profileRows, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, is_verified')
          .in('id', matchedIds);

        if (profileError) throw profileError;

        const byId = new Map(
          ((profileRows ?? []) as VideoSocialProfile[]).map((profile) => [
            profile.id,
            profile,
          ]),
        );
        const ordered = matchedIds
          .map((id) => byId.get(id))
          .filter((profile): profile is VideoSocialProfile => Boolean(profile));

        if (!cancelled) setLikedByFollowing(ordered);
      } catch (error) {
        console.warn('Video social like kontekstini yuklab bo‘lmadi:', error);
        if (!cancelled) setLikedByFollowing([]);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled, likesCount, postId, user?.id]);

  return {
    acceptedCollaborators,
    likedByFollowing,
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
