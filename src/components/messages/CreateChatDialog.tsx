import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OnlineIndicator } from '@/components/OnlineIndicator';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  LockKeyhole,
  Megaphone,
  Search,
  UserRoundPlus,
  UsersRound,
  X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { createSecretConversation } from '@/lib/secretChatCrypto';
import { cn } from '@/lib/utils';

type ChatType = 'private' | 'group' | 'channel' | 'secret';
type Step = 'select-type' | 'select-users';

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
  onCreateGroup?: (name: string, memberIds: string[]) => Promise<any>;
  onCreateChannel?: (name: string, description: string) => Promise<any>;
}

export function CreateChatDialog({
  open,
  onOpenChange,
  onCreatePrivate,
}: CreateChatDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [chatType, setChatType] = useState<ChatType>('private');
  const [step, setStep] = useState<Step>('select-type');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChatType('private');
    setStep('select-type');
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
    if (type === 'group' || type === 'channel') {
      onOpenChange(false);
      navigate(`/messages/new/${type}`);
      return;
    }

    setChatType(type);
    setSearchQuery('');
    setStep('select-users');
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

    if (chatType === 'secret') {
      setCreating(true);
      try {
        const conversationId = await createSecretConversation(userId);
        onOpenChange(false);
        navigate(`/messages?conversation=${encodeURIComponent(conversationId)}`);
        toast({ title: t('messages.createChat.secretCreated') });
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        const title =
          code === 'E2EE_PEER_NOT_READY'
            ? t('messages.createChat.secretPeerNotReady')
            : code === 'E2EE_PEER_DISABLED'
              ? t('messages.createChat.secretDisabled')
              : code === 'E2EE_UNSUPPORTED'
                ? t('messages.createChat.secretUnsupported')
                : t('messages.createChat.secretFailed');
        toast({ title, variant: 'destructive' });
      } finally {
        setCreating(false);
      }
    }
  };

  const chatTypes = [
    {
      id: 'private' as const,
      icon: UserRoundPlus,
      label: t('messages.newPrivateChat'),
      iconClassName: 'bg-primary/10 text-primary ring-primary/15',
    },
    {
      id: 'group' as const,
      icon: UsersRound,
      label: t('messages.newGroup'),
      iconClassName: 'bg-blue-500/10 text-blue-500 ring-blue-500/15',
    },
    {
      id: 'channel' as const,
      icon: Megaphone,
      label: t('messages.newChannel'),
      iconClassName: 'bg-violet-500/10 text-violet-500 ring-violet-500/15',
    },
    {
      id: 'secret' as const,
      icon: LockKeyhole,
      label: t('messages.newSecretChat'),
      iconClassName: 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/15',
    },
  ];

  const title =
    step === 'select-type'
      ? t('messages.createChat.title')
      : chatType === 'secret'
        ? t('messages.createChat.selectSecretUser')
        : t('messages.createChat.selectUser');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideDefaultClose
        overlayClassName="bg-black/40 backdrop-blur-[2px]"
        className={cn(
          'left-1/2 top-1/2 flex min-h-0 w-[calc(100vw-24px)] max-w-[500px] -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-[28px] border border-border bg-background p-0 shadow-2xl',
          step === 'select-type'
            ? 'h-auto max-h-[calc(100dvh-32px)]'
            : 'h-[min(82dvh,680px)]',
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border bg-background px-5 py-5 text-left sm:px-6">
          <div className="flex items-center gap-3">
            {step !== 'select-type' && (
              <button
                type="button"
                onClick={() => setStep('select-type')}
                aria-label={t('common.back')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground transition hover:bg-muted active:scale-95"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}

            <DialogTitle className="min-w-0 flex-1 text-[22px] font-bold leading-tight tracking-[-0.02em] sm:text-2xl">
              {title}
            </DialogTitle>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t('common.close')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition hover:text-foreground active:scale-95"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        {step === 'select-type' && (
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-4 touch-pan-y sm:p-5">
            {chatTypes.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => handleTypeSelect(type.id)}
                className="group flex w-full items-center gap-3.5 rounded-[22px] border border-border bg-card px-3.5 py-3.5 text-left shadow-sm transition hover:bg-muted/60 active:scale-[0.985]"
              >
                <div
                  className={cn(
                    'flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[18px] ring-1 ring-inset',
                    type.iconClassName,
                  )}
                >
                  <type.icon className="h-6 w-6" strokeWidth={1.9} />
                </div>

                <p className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                  {type.label}
                </p>

                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition group-hover:text-foreground">
                  <ChevronRight className="h-4 w-4" />
                </span>
              </button>
            ))}
          </div>
        )}

        {step === 'select-users' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
            <div className="shrink-0 px-4 pb-3 pt-4 sm:px-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder={t('messages.createChat.searchUsers')}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-12 rounded-2xl border-border bg-muted/55 pl-11 pr-10 text-sm shadow-none focus-visible:bg-background focus-visible:ring-1"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label={t('common.remove')}
                    className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-background text-muted-foreground transition hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div
              className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-2 pb-3 sm:px-3"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {loading ? (
                <div className="flex h-44 items-center justify-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : users.length === 0 ? (
                <div className="flex h-44 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  {t('messages.createChat.noUsers')}
                </div>
              ) : (
                <div className="space-y-1">
                  {users.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => void handleUserSelect(profile.id)}
                      disabled={creating}
                      className="group flex w-full items-center gap-3 rounded-[18px] px-3 py-2.5 text-left transition hover:bg-muted/60 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-11 w-11 ring-1 ring-border">
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

                      {creating ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
