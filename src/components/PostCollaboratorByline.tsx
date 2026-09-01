import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Clock3, LogOut, Trash2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
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
import { MentionCollaborator } from '@/components/create/MentionCollaborator';

interface PostCollaboratorBylineProps {
  postId: string;
  isOwner?: boolean;
  className?: string;
}

/**
 * Post sarlavhasidagi hammuallif satri (Instagram uslubi):
 *   Samandar va @alsamos
 *
 * Hammuallif nomi asosiy matn rangida va qalin: ustiga bosilganda uning
 * profiliga otiladi. Royxat va boshqaruv esa "va N kishi" ustiga bosilganda
 * ochiladigan oynada: lentada alohida boshqaruv kartasi chizilmaydi.
 */
export function PostCollaboratorByline({
  postId,
  isOwner = false,
  className,
}: PostCollaboratorBylineProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    collaborators,
    isLoading,
    invite,
    respond,
    remove,
    leave,
  } = usePostCollaborators(postId);

  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const accepted = useMemo(
    () => collaborators.filter((item) => item.status === 'accepted'),
    [collaborators],
  );
  const active = useMemo(
    () =>
      collaborators.filter(
        (item) => item.status === 'accepted' || item.status === 'pending',
      ),
    [collaborators],
  );
  const pending = useMemo(
    () => collaborators.filter((item) => item.status === 'pending'),
    [collaborators],
  );
  const selfCollaboration = useMemo(
    () => collaborators.find((item) => item.user_id === user?.id) ?? null,
    [collaborators, user?.id],
  );

  const selectedProfiles = useMemo(
    () =>
      active
        .map((item) => item.profile)
        .filter((profile): profile is PostCollaboratorProfile => Boolean(profile)),
    [active],
  );

  const run = async (
    id: string,
    action: () => Promise<void>,
    successMessage: string,
  ) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await action();
      toast.success(successMessage);
    } catch (error) {
      console.error('Hammualliflik amali xatosi:', error);
      toast.error('Hammualliflik amali bajarilmadi');
    } finally {
      setBusyId(null);
    }
  };

  const handleInvite = (profile: PostCollaboratorProfile) => {
    void run(
      'invite-' + profile.id,
      () => invite(profile.id),
      '@' + profile.username + ' ga taklif yuborildi',
    );
  };

  /** Hammuallif profiliga otish. */
  const openProfile = (
    event: React.MouseEvent,
    profile: PostCollaboratorProfile | null,
    userId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    navigate('/user/' + (profile?.username || userId));
  };

  if (isLoading) return null;

  const hasLifecycle =
    isOwner ||
    accepted.length > 0 ||
    selfCollaboration?.status === 'pending' ||
    selfCollaboration?.status === 'accepted';

  if (!hasLifecycle) return null;

  const first = accepted[0] ?? null;

  return (
    <>
      <span className={cn('inline min-w-0 text-sm', className)}>
        {first ? (
          <>
            <span className="text-muted-foreground">{' va '}</span>
            <button
              type="button"
              onClick={(event) => openProfile(event, first.profile, first.user_id)}
              className="font-semibold text-foreground transition hover:underline"
            >
              {first.profile?.display_name || '@' + (first.profile?.username || 'user')}
            </button>

            {accepted.length > 1 && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(true);
                }}
                className="font-semibold text-foreground transition hover:underline"
              >
                {' va yana ' + (accepted.length - 1) + ' kishi'}
              </button>
            )}
          </>
        ) : selfCollaboration?.status === 'pending' ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(true);
            }}
            className="font-medium text-primary transition hover:underline"
          >
            Hammualliflik taklifi
          </button>
        ) : isOwner && pending.length > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(true);
            }}
            className="text-muted-foreground transition hover:text-foreground"
          >
            {pending.length + ' taklif kutilmoqda'}
          </button>
        ) : null}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[86dvh] max-w-sm flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-4">
            <DialogTitle className="text-base">Hammualliflar</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isOwner && (
              <button
                type="button"
                disabled={active.length >= 10}
                onClick={() => setPickerOpen(true)}
                className="flex min-h-12 w-full items-center gap-3 border-b border-border/50 px-4 text-sm font-medium transition hover:bg-muted/50 disabled:opacity-40"
              >
                <UserPlus className="h-4 w-4 text-primary" />
                Hammuallif qoshish
                <span className="ml-auto text-xs text-muted-foreground">
                  {active.length}/10
                </span>
              </button>
            )}

            {collaborators.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Hammuallif yoq
              </div>
            ) : (
              collaborators.map((item) => {
                const label =
                  item.profile?.display_name ||
                  item.profile?.username ||
                  'Foydalanuvchi';
                const isSelf = item.user_id === user?.id;

                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 border-b border-border/40 px-4 py-3 last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={(event) => openProfile(event, item.profile, item.user_id)}
                      className="shrink-0"
                      aria-label={label + ' profiliga otish'}
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={item.profile?.avatar_url || ''} />
                        <AvatarFallback className="text-xs">
                          {label.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </button>

                    <button
                      type="button"
                      onClick={(event) => openProfile(event, item.profile, item.user_id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-semibold text-foreground">
                        {label}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        @{item.profile?.username || 'user'}
                        {' · '}
                        {item.status === 'accepted'
                          ? 'Qabul qilingan'
                          : item.status === 'pending'
                            ? 'Kutilmoqda'
                            : 'Rad etilgan'}
                      </p>
                    </button>

                    {isSelf && item.status === 'pending' && !isOwner ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={Boolean(busyId)}
                          onClick={() =>
                            void run(
                              item.id,
                              () => respond(item.id, true),
                              'Hammualliflik qabul qilindi',
                            )
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
                          aria-label="Qabul qilish"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyId)}
                          onClick={() =>
                            void run(
                              item.id,
                              () => respond(item.id, false),
                              'Taklif rad etildi',
                            )
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground disabled:opacity-40"
                          aria-label="Rad etish"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : isSelf && item.status === 'accepted' && !isOwner ? (
                      <button
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={() =>
                          void run(
                            item.id,
                            () => leave(item.id),
                            'Hammualliflikdan chiqdingiz',
                          )
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                        aria-label="Hammualliflikdan chiqish"
                      >
                        <LogOut className="h-4 w-4" />
                      </button>
                    ) : isOwner && item.status !== 'declined' ? (
                      <button
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={() =>
                          void run(
                            item.id,
                            () => remove(item.id),
                            item.status === 'pending'
                              ? 'Taklif bekor qilindi'
                              : 'Hammuallif olib tashlandi',
                          )
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                        aria-label="Hammuallifni olib tashlash"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : item.status === 'pending' ? (
                      <Clock3 className="h-4 w-4 text-muted-foreground" />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {isOwner && (
        <MentionCollaborator
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          mode="collaborate"
          maxUsers={10}
          selectedUsers={selectedProfiles}
          onSelectUser={handleInvite}
          onRemoveUser={(userId) => {
            const item = active.find((row) => row.user_id === userId);
            if (item) {
              void run(
                item.id,
                () => remove(item.id),
                item.status === 'pending'
                  ? 'Taklif bekor qilindi'
                  : 'Hammuallif olib tashlandi',
              );
            }
          }}
        />
      )}
    </>
  );
}
