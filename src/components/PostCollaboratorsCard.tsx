import { useMemo, useState } from 'react';
import {
  Check,
  Clock3,
  LogOut,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MentionCollaborator } from '@/components/create/MentionCollaborator';
import {
  usePostCollaborators,
  type PostCollaborator,
  type PostCollaboratorProfile,
} from '@/hooks/usePostCollaborators';
import { cn } from '@/lib/utils';

interface PostCollaboratorsCardProps {
  postId: string;
  isOwner?: boolean;
  className?: string;
}

function statusLabel(status: PostCollaborator['status']) {
  if (status === 'accepted') return 'Qabul qilingan';
  if (status === 'pending') return 'Kutilmoqda';
  return 'Rad etilgan';
}

/** Xatoning haqiqiy matnini chiqaradi — sabab yashirilmasin. */
function errorText(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === 'string') return error.trim() || null;

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    for (const key of ['message', 'details', 'hint', 'error_description']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }

  return null;
}

function CollaboratorAvatar({ profile }: { profile: PostCollaboratorProfile | null }) {
  const label = profile?.display_name || profile?.username || '?';
  return (
    <Avatar className="h-9 w-9 border-2 border-background">
      <AvatarImage src={profile?.avatar_url || ''} />
      <AvatarFallback className="text-xs">{label.charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

export function PostCollaboratorsCard({
  postId,
  isOwner = false,
  className,
}: PostCollaboratorsCardProps) {
  const { user } = useAuth();
  const {
    collaborators,
    isLoading,
    invite,
    respond,
    remove,
    leave,
  } = usePostCollaborators(postId);

  const [manageOpen, setManageOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const accepted = useMemo(
    () => collaborators.filter((item) => item.status === 'accepted'),
    [collaborators],
  );
  const pending = useMemo(
    () => collaborators.filter((item) => item.status === 'pending'),
    [collaborators],
  );
  const active = useMemo(
    () => collaborators.filter((item) => item.status === 'accepted' || item.status === 'pending'),
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

  const run = async (id: string, action: () => Promise<void>, success: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await action();
      toast.success(success);
    } catch (error) {
      console.error('Hammualliflik amali xatosi:', error);
      const reason = errorText(error);
      toast.error(
        reason
          ? 'Hammualliflik amali bajarilmadi: ' + reason
          : 'Hammualliflik amalini bajarib bo\u2018lmadi',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleInvite = (profile: PostCollaboratorProfile) => {
    void run(
      `invite-${profile.id}`,
      () => invite(profile.id),
      `@${profile.username} ga taklif yuborildi`,
    );
  };

  const shouldRender =
    isOwner ||
    accepted.length > 0 ||
    selfCollaboration?.status === 'pending' ||
    selfCollaboration?.status === 'accepted';

  if (!shouldRender || isLoading) return null;

  return (
    <>
      <div
        className={cn(
          'rounded-2xl border border-border/60 bg-muted/25 p-3',
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Users className="h-5 w-5" />
          </span>

          <div className="flex min-w-0 flex-1 items-center gap-3">
            {accepted.length > 0 ? (
              <div className="flex -space-x-2">
                {accepted.slice(0, 4).map((item) => (
                  <CollaboratorAvatar key={item.id} profile={item.profile} />
                ))}
                {accepted.length > 4 && (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-semibold">
                    +{accepted.length - 4}
                  </span>
                )}
              </div>
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                <UserPlus className="h-4 w-4" />
              </span>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {accepted.length > 0
                  ? `${accepted.length} hammuallif`
                  : isOwner
                    ? 'Hammuallif qo‘shish'
                    : 'Hammualliflik taklifi'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {isOwner && pending.length > 0
                  ? `${pending.length} ta javob kutilmoqda`
                  : accepted
                      .slice(0, 3)
                      .map((item) => '@' + (item.profile?.username || 'user'))
                      .join(', ') || 'Postni birga yarating'}
              </p>
            </div>
          </div>

          {isOwner && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 rounded-full"
              onClick={() => setManageOpen(true)}
            >
              Boshqarish
            </Button>
          )}
        </div>

        {selfCollaboration?.status === 'pending' && !isOwner && (
          <div className="mt-3 flex gap-2 border-t border-border/50 pt-3">
            <Button
              type="button"
              size="sm"
              className="flex-1 rounded-full"
              disabled={Boolean(busyId)}
              onClick={() =>
                void run(
                  selfCollaboration.id,
                  () => respond(selfCollaboration.id, true),
                  'Hammualliflik qabul qilindi',
                )
              }
            >
              <Check className="mr-1.5 h-4 w-4" />
              Qabul qilish
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1 rounded-full"
              disabled={Boolean(busyId)}
              onClick={() =>
                void run(
                  selfCollaboration.id,
                  () => respond(selfCollaboration.id, false),
                  'Taklif rad etildi',
                )
              }
            >
              <X className="mr-1.5 h-4 w-4" />
              Rad etish
            </Button>
          </div>
        )}

        {selfCollaboration?.status === 'accepted' && !isOwner && (
          <div className="mt-3 flex justify-end border-t border-border/50 pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full text-muted-foreground hover:text-destructive"
              disabled={Boolean(busyId)}
              onClick={() =>
                void run(
                  selfCollaboration.id,
                  () => leave(selfCollaboration.id),
                  'Hammualliflikdan chiqdingiz',
                )
              }
            >
              <LogOut className="mr-1.5 h-4 w-4" />
              Hammualliflikdan chiqish
            </Button>
          </div>
        )}
      </div>

      {isOwner && (
        <>
          <Dialog open={manageOpen} onOpenChange={setManageOpen}>
            <DialogContent className="flex max-h-[90dvh] max-w-md flex-col overflow-hidden p-0">
              <DialogHeader className="shrink-0 border-b border-border/60 px-5 pb-4 pt-5">
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  Hammualliflar
                </DialogTitle>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  className="mb-4 w-full rounded-xl"
                  disabled={active.length >= 10}
                  onClick={() => setPickerOpen(true)}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Yangi hammuallif taklif qilish
                  <span className="ml-auto text-xs text-muted-foreground">
                    {active.length}/10
                  </span>
                </Button>

                {collaborators.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Hali hammuallif taklif qilinmagan.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {collaborators.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 rounded-xl border border-border/60 p-3"
                      >
                        <CollaboratorAvatar profile={item.profile} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {item.profile?.display_name || item.profile?.username || 'Foydalanuvchi'}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className="truncate text-xs text-muted-foreground">
                              @{item.profile?.username || 'user'}
                            </span>
                            <Badge
                              variant={item.status === 'accepted' ? 'default' : 'secondary'}
                              className="h-5 rounded-full px-2 text-[10px]"
                            >
                              {item.status === 'pending' && <Clock3 className="mr-1 h-3 w-3" />}
                              {statusLabel(item.status)}
                            </Badge>
                          </div>
                        </div>

                        {item.status !== 'declined' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
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
                            aria-label="Hammuallifni olib tashlash"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

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
        </>
      )}
    </>
  );
}
