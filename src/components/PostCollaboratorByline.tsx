import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { cn } from '@/lib/utils';
import {
  usePostCollaborators,
  type PostCollaboratorProfile,
} from '@/hooks/usePostCollaborators';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';

interface PostCollaboratorBylineProps {
  postId: string;
  isOwner?: boolean;
  className?: string;
}

function profileHandle(profile: PostCollaboratorProfile | null) {
  return profile?.username || profile?.display_name || 'user';
}

/**
 * Instagram-style public collaborator byline.
 *
 * Only accepted collaborators are surfaced publicly. Pending invitations stay
 * inside the edit/invitation flow and are never presented as co-authors.
 */
export function PostCollaboratorByline({
  postId,
  className,
}: PostCollaboratorBylineProps) {
  const navigate = useNavigate();
  const {
    collaborators,
    ownerProfile,
    ownerUserId,
    isLoading,
  } = usePostCollaborators(postId);

  const [open, setOpen] = useState(false);

  const accepted = useMemo(
    () => collaborators.filter((item) => item.status === 'accepted'),
    [collaborators],
  );

  const openProfile = (
    event: React.MouseEvent,
    profile: PostCollaboratorProfile | null,
    userId: string | null,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!profile && !userId) return;
    setOpen(false);
    navigate('/user/' + (profile?.username || userId));
  };

  const openList = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  };

  if (isLoading || accepted.length === 0) return null;

  const first = accepted[0];

  return (
    <>
      <span className={cn('inline min-w-0 text-sm', className)}>
        {accepted.length === 1 ? (
          <>
            <span className="font-semibold text-foreground"> and </span>
            <button
              type="button"
              onClick={(event) => openProfile(event, first.profile, first.user_id)}
              className="font-semibold text-foreground transition hover:underline"
            >
              {profileHandle(first.profile)}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={openList}
            className="font-semibold text-foreground transition hover:underline"
          >
            {' and ' + accepted.length + ' more'}
          </button>
        )}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[86dvh] max-w-sm flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-4">
            <DialogTitle className="text-base">Hammualliflar</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {ownerUserId && (
              <button
                type="button"
                onClick={(event) => openProfile(event, ownerProfile, ownerUserId)}
                className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-3 text-left transition hover:bg-muted/40"
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={ownerProfile?.avatar_url || ''} />
                  <AvatarFallback className="text-xs">
                    {(ownerProfile?.display_name || ownerProfile?.username || 'M')
                      .charAt(0)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1 text-sm font-semibold text-foreground">
                    <span className="truncate">
                      {ownerProfile?.display_name || ownerProfile?.username || 'Muallif'}
                    </span>
                    {ownerProfile?.is_verified && <VerifiedBadge size="xs" />}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    @{ownerProfile?.username || 'user'} · Muallif
                  </span>
                </span>
              </button>
            )}

            {accepted.map((item) => {
              const label =
                item.profile?.display_name ||
                item.profile?.username ||
                'Foydalanuvchi';

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={(event) => openProfile(event, item.profile, item.user_id)}
                  className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-3 text-left transition last:border-b-0 hover:bg-muted/40"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={item.profile?.avatar_url || ''} />
                    <AvatarFallback className="text-xs">
                      {label.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1 text-sm font-semibold text-foreground">
                      <span className="truncate">{label}</span>
                      {item.profile?.is_verified && <VerifiedBadge size="xs" />}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      @{item.profile?.username || 'user'} · Hammuallif
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
