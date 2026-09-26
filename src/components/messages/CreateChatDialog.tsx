import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OnlineIndicator } from '@/components/OnlineIndicator';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Loader2,
  LockKeyhole,
  Megaphone,
  Search,
  Sparkles,
  UserRoundPlus,
  UsersRound,
  X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

type ChatType = 'private' | 'group' | 'channel' | 'secret';
type Step = 'select-type' | 'select-users' | 'group-details';

interface User {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean | null;
}

interface CreateChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreatePrivate: (userId: string) => Promise<any>;
  onCreateGroup: (name: string, memberIds: string[]) => Promise<any>;
  onCreateChannel?: (name: string, description: string) => Promise<any>;
}

export function CreateChatDialog({
  open,
  onOpenChange,
  onCreatePrivate,
  onCreateGroup,
  onCreateChannel,
}: CreateChatDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [chatType, setChatType] = useState<ChatType>('private');
  const [step, setStep] = useState<Step>('select-type');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChatType('private');
    setStep('select-type');
    setSelectedUsers([]);
    setGroupName('');
    setGroupDescription('');
    setSearchQuery('');
  }, [open]);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!user || step !== 'select-users') return;
      setLoading(true);

      let query = supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_online')
        .neq('id', user.id)
        .limit(50);

      if (searchQuery.trim()) {
        const search = searchQuery.trim();
        query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (!error && data) setUsers(data);
      setLoading(false);
    };

    const timeout = window.setTimeout(() => void fetchUsers(), 180);
    return () => window.clearTimeout(timeout);
  }, [user, step, searchQuery]);

  const handleTypeSelect = (type: ChatType) => {
    if (type === 'secret') return;

    setChatType(type);
    setSearchQuery('');
    setSelectedUsers([]);

    // Kanal yaratishda a'zo tanlash natijada ishlatilmasdi. Oqimni bevosita
    // kanal ma'lumotlariga olib o'tamiz, guruh esa a'zolar bosqichini saqlaydi.
    setStep(type === 'channel' ? 'group-details' : 'select-users');
  };

  const handleUserSelect = async (userId: string) => {
    if (chatType === 'private') {
      setCreating(true);
      try {
        await onCreatePrivate(userId);
        onOpenChange(false);
      } finally {
        setCreating(false);
      }
      return;
    }

    if (chatType === 'group') {
      setSelectedUsers((previous) =>
        previous.includes(userId)
          ? previous.filter((id) => id !== userId)
          : [...previous, userId],
      );
    }
  };

  const handleNext = () => {
    if (chatType === 'group' && selectedUsers.length > 0) setStep('group-details');
  };

  const handleCreate = async () => {
    if (!groupName.trim()) return;

    setCreating(true);
    try {
      if (chatType === 'group') {
        await onCreateGroup(groupName.trim(), selectedUsers);
      } else if (chatType === 'channel' && onCreateChannel) {
        await onCreateChannel(groupName.trim(), groupDescription.trim());
      }
      onOpenChange(false);
    } finally {
      setCreating(false);
    }
  };

  const chatTypes = [
    {
      id: 'private' as const,
      icon: UserRoundPlus,
      label: t('messages.newPrivateChat'),
      description: t('messages.createChat.privateDescription'),
      iconClassName: 'bg-primary/12 text-primary ring-primary/10',
    },
    {
      id: 'group' as const,
      icon: UsersRound,
      label: t('messages.newGroup'),
      description: t('messages.createChat.groupDescription'),
      iconClassName: 'bg-blue-500/12 text-blue-500 ring-blue-500/10',
    },
    {
      id: 'channel' as const,
      icon: Megaphone,
      label: t('messages.newChannel'),
      description: t('messages.createChat.channelDescription'),
      iconClassName: 'bg-violet-500/12 text-violet-500 ring-violet-500/10',
    },
    {
      id: 'secret' as const,
      icon: LockKeyhole,
      label: t('messages.newSecretChat'),
      description: t('messages.createChat.secretDescription'),
      iconClassName: 'bg-emerald-500/12 text-emerald-500 ring-emerald-500/10',
      disabled: true,
    },
  ];

  const title =
    step === 'select-type'
      ? t('messages.createChat.title')
      : step === 'select-users'
        ? chatType === 'private'
          ? t('messages.createChat.selectUser')
          : t('messages.createChat.addMembers')
        : chatType === 'group'
          ? t('messages.createChat.groupDetails')
          : t('messages.createChat.channelDetails');

  const subtitle =
    step === 'select-type'
      ? t('messages.createChat.subtitle')
      : step === 'select-users'
        ? chatType === 'private'
          ? t('messages.createChat.selectUserHint')
          : t('messages.createChat.addMembersHint')
        : chatType === 'group'
          ? t('messages.createChat.groupDetailsHint')
          : t('messages.createChat.channelDetailsHint');

  const goBack = () => {
    if (step === 'group-details' && chatType === 'group') {
      setStep('select-users');
      return;
    }
    setStep('select-type');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideDefaultClose
        overlayClassName="bg-black/55 backdrop-blur-[3px]"
        className={cn(
          'bottom-0 left-0 right-0 top-auto max-h-[88dvh] w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-t-[30px] border-x-0 border-b-0 border-t border-border/60 bg-background/95 p-0 shadow-[0_-28px_90px_rgba(0,0,0,0.24)] backdrop-blur-2xl',
          'sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:max-h-[min(82vh,760px)] sm:w-[min(92vw,520px)] sm:max-w-[520px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[30px] sm:border',
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-11 rounded-full bg-muted-foreground/20 sm:hidden" />

        <DialogHeader className="space-y-0 border-b border-border/50 px-5 pb-4 pt-3 text-left sm:px-6 sm:pb-5 sm:pt-6">
          <div className="flex items-start gap-3">
            {step !== 'select-type' && (
              <button
                type="button"
                onClick={goBack}
                aria-label={t('common.back')}
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-foreground transition hover:bg-muted active:scale-95"
              >
                <ArrowLeft className="h-4.5 w-4.5" />
              </button>
            )}

            <div className="min-w-0 flex-1">
              {step === 'select-type' && (
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('nav.messages')}
                </div>
              )}
              <DialogTitle className="text-[22px] font-bold leading-tight tracking-[-0.02em] sm:text-2xl">
                {title}
              </DialogTitle>
              <DialogDescription className="mt-1.5 max-w-[390px] text-[13px] leading-5 text-muted-foreground sm:text-sm">
                {subtitle}
              </DialogDescription>
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t('common.close')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </DialogHeader>

        {step === 'select-type' && (
          <div className="space-y-2.5 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
            {chatTypes.map((type) => (
              <button
                key={type.id}
                type="button"
                disabled={type.disabled}
                onClick={() => handleTypeSelect(type.id)}
                className={cn(
                  'group flex w-full items-center gap-3.5 rounded-[22px] border border-border/55 bg-card/70 p-3.5 text-left shadow-[0_1px_0_rgba(255,255,255,0.04)] transition duration-200',
                  'hover:-translate-y-0.5 hover:border-border hover:bg-accent/45 hover:shadow-md active:translate-y-0 active:scale-[0.985]',
                  'disabled:cursor-default disabled:opacity-65 disabled:hover:translate-y-0 disabled:hover:bg-card/70 disabled:hover:shadow-none',
                )}
              >
                <div
                  className={cn(
                    'flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[18px] ring-1 ring-inset',
                    type.iconClassName,
                  )}
                >
                  <type.icon className="h-6 w-6" strokeWidth={1.9} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                      {type.label}
                    </p>
                    {type.disabled && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('messages.createChat.comingSoon')}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-[18px] text-muted-foreground sm:text-[13px]">
                    {type.description}
                  </p>
                </div>

                {!type.disabled && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/55 text-muted-foreground transition group-hover:bg-background group-hover:text-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {step === 'select-users' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-4 pb-3 pt-4 sm:px-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder={t('messages.createChat.searchUsers')}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-12 rounded-2xl border-border/55 bg-muted/45 pl-11 pr-10 text-sm shadow-none focus-visible:bg-background focus-visible:ring-1"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label={t('common.remove')}
                    className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground transition hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {chatType === 'group' && selectedUsers.length > 0 && (
              <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-hidden sm:px-5">
                {selectedUsers.map((userId) => {
                  const selectedUser = users.find((item) => item.id === userId);
                  return (
                    <div
                      key={userId}
                      className="flex shrink-0 items-center gap-2 rounded-full border border-border/50 bg-muted/45 py-1 pl-1 pr-2"
                    >
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={selectedUser?.avatar_url || ''} />
                        <AvatarFallback className="text-[10px]">
                          {(selectedUser?.display_name || selectedUser?.username || 'U')[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="max-w-[120px] truncate text-xs font-medium">
                        {selectedUser?.display_name || selectedUser?.username || t('profile.user')}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleUserSelect(userId)}
                        aria-label={t('common.remove')}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-background hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <ScrollArea className="min-h-0 flex-1 px-2 sm:px-3">
              <div className="pb-3">
                {loading ? (
                  <div className="flex h-44 flex-col items-center justify-center gap-3 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-xs">{t('common.loading')}</span>
                  </div>
                ) : users.length === 0 ? (
                  <div className="flex h-44 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                    {t('messages.createChat.noUsers')}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {users.map((profile) => {
                      const selected = selectedUsers.includes(profile.id);
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() => void handleUserSelect(profile.id)}
                          disabled={creating}
                          className="group flex w-full items-center gap-3 rounded-[18px] px-3 py-2.5 text-left transition hover:bg-muted/55 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
                        >
                          <div className="relative shrink-0">
                            <Avatar className="h-11 w-11 ring-1 ring-border/60">
                              <AvatarImage src={profile.avatar_url || ''} />
                              <AvatarFallback className="font-semibold">
                                {(profile.display_name || profile.username || 'U')[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <OnlineIndicator userId={profile.id} size="sm" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {profile.display_name || profile.username}
                            </p>
                            {profile.username && profile.display_name && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                @{profile.username}
                              </p>
                            )}
                          </div>

                          {chatType === 'group' ? (
                            <span
                              className={cn(
                                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition',
                                selected
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border bg-background text-transparent group-hover:border-primary/40',
                              )}
                            >
                              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                            </span>
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>

            {chatType === 'group' && (
              <div className="border-t border-border/50 bg-background/90 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-5 sm:pb-5">
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={selectedUsers.length === 0}
                  className="h-12 w-full rounded-2xl text-sm font-semibold shadow-sm"
                >
                  {t('messages.createChat.nextWithCount', { count: selectedUsers.length })}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 'group-details' && (
          <div className="space-y-5 overflow-y-auto px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-6">
            <div className="flex justify-center">
              <div
                className={cn(
                  'flex h-20 w-20 items-center justify-center rounded-[26px] ring-1 ring-inset',
                  chatType === 'group'
                    ? 'bg-blue-500/12 text-blue-500 ring-blue-500/10'
                    : 'bg-violet-500/12 text-violet-500 ring-violet-500/10',
                )}
              >
                {chatType === 'group' ? (
                  <UsersRound className="h-8 w-8" strokeWidth={1.8} />
                ) : (
                  <Megaphone className="h-8 w-8" strokeWidth={1.8} />
                )}
              </div>
            </div>

            <div className="space-y-3">
              <Input
                autoFocus
                placeholder={
                  chatType === 'group'
                    ? t('messages.createChat.groupName')
                    : t('messages.createChat.channelName')
                }
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                className="h-12 rounded-2xl border-border/55 bg-muted/40 px-4 text-sm focus-visible:bg-background focus-visible:ring-1"
              />

              {chatType === 'channel' && (
                <Input
                  placeholder={t('messages.createChat.descriptionOptional')}
                  value={groupDescription}
                  onChange={(event) => setGroupDescription(event.target.value)}
                  className="h-12 rounded-2xl border-border/55 bg-muted/40 px-4 text-sm focus-visible:bg-background focus-visible:ring-1"
                />
              )}
            </div>

            {chatType === 'group' && (
              <div className="rounded-2xl bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
                {t('messages.createChat.membersSelected', { count: selectedUsers.length })}
              </div>
            )}

            <Button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!groupName.trim() || creating}
              className="h-12 w-full rounded-2xl text-sm font-semibold shadow-sm"
            >
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('messages.createChat.creating')}
                </>
              ) : chatType === 'group' ? (
                t('messages.createChat.createGroup')
              ) : (
                t('messages.createChat.createChannel')
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
