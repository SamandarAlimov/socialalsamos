import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  Check,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { OnlineIndicator } from '@/components/OnlineIndicator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { uploadMedia } from '@/lib/mediaUpload';
import { cn } from '@/lib/utils';

type ChatType = 'group' | 'channel';
type Step = 'members' | 'details';

interface Person {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean | null;
}

const MAX_NAME = 128;
const MAX_DESCRIPTION = 255;

export default function MessageConversationCreatePage() {
  const { type } = useParams<{ type: string }>();
  const chatType: ChatType | null = type === 'group' || type === 'channel' ? type : null;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const initialStep: Step = chatType === 'channel' ? 'details' : 'members';
  const [step, setStep] = useState<Step>(initialStep);
  const [users, setUsers] = useState<Person[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!chatType) return;
    setStep(chatType === 'channel' ? 'details' : 'members');
    setSearchQuery('');
    setSelectedUsers([]);
    setName('');
    setDescription('');
    setAvatarUrl(null);
  }, [chatType]);

  useEffect(() => {
    if (!user || step !== 'members') return;
    let cancelled = false;

    const fetchUsers = async () => {
      setLoadingUsers(true);
      let query = supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_online')
        .neq('id', user.id)
        .limit(80);

      if (searchQuery.trim()) {
        const q = searchQuery.trim();
        query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
      }

      const { data, error } = await query;
      if (cancelled) return;
      if (!error && data) setUsers(data);
      setLoadingUsers(false);
    };

    const timer = window.setTimeout(() => void fetchUsers(), searchQuery ? 180 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user, step, searchQuery]);

  const title =
    chatType === 'group'
      ? t('messages.createFlow.groupTitle')
      : t('messages.createFlow.channelTitle');

  const isFinalStep =
    (chatType === 'group' && step === 'details') ||
    (chatType === 'channel' && step === 'members');

  const canContinue = useMemo(() => {
    if (step === 'details') return Boolean(name.trim()) && !avatarUploading;
    if (chatType === 'group') return selectedUsers.length > 0;
    return true;
  }, [step, chatType, name, selectedUsers.length, avatarUploading]);

  if (!chatType) return <Navigate to="/messages" replace />;

  const handleBack = () => {
    if (chatType === 'group' && step === 'details') {
      setStep('members');
      return;
    }
    if (chatType === 'channel' && step === 'members') {
      setStep('details');
      return;
    }
    navigate('/messages');
  };

  const toggleUser = (userId: string) => {
    setSelectedUsers((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user) return;

    setAvatarUploading(true);
    try {
      const uploaded = await uploadMedia(file, { type: 'chat', visibility: 'public' });
      setAvatarUrl(uploaded.url);
    } catch (error) {
      toast({
        title: t('common.error'),
        description:
          error instanceof Error ? error.message : t('messages.createFlow.uploadFailed'),
        variant: 'destructive',
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  const createConversation = async () => {
    if (!user || !name.trim()) return;
    setCreating(true);

    try {
      const { data: conversation, error } = await supabase
        .from('conversations')
        .insert({
          type: chatType,
          name: name.trim(),
          description: description.trim() || null,
          avatar_url: avatarUrl,
          owner_id: user.id,
          last_message_at: new Date().toISOString(),
        } as any)
        .select('id')
        .single();

      if (error || !conversation?.id) throw error || new Error('conversation_create_failed');

      const memberIds = Array.from(
        new Set(selectedUsers.filter((id) => id && id !== user.id)),
      );
      const participants = [
        { conversation_id: conversation.id, user_id: user.id, role: 'owner' },
        ...memberIds.map((id) => ({
          conversation_id: conversation.id,
          user_id: id,
          role: 'member',
        })),
      ];

      const { error: participantError } = await supabase
        .from('conversation_participants')
        .insert(participants as any);

      if (participantError) {
        await supabase.from('conversations').delete().eq('id', conversation.id);
        throw participantError;
      }

      toast({
        title:
          chatType === 'group'
            ? t('messages.createFlow.groupCreated')
            : t('messages.createFlow.channelCreated'),
      });
      navigate(`/messages?conversation=${encodeURIComponent(conversation.id)}`, { replace: true });
    } catch (error) {
      toast({
        title: t('messages.createFlow.failed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (!canContinue || creating) return;

    if (chatType === 'group' && step === 'members') {
      setStep('details');
      return;
    }
    if (chatType === 'channel' && step === 'details') {
      setStep('members');
      return;
    }

    await createConversation();
  };

  return (
    <div className="fixed inset-0 z-[1600] flex min-h-0 flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border bg-background px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-6">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-[48px_1fr_auto] items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            aria-label={t('common.back')}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground transition hover:bg-muted/80 active:scale-95"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>

          <h1 className="truncate text-center text-[20px] font-bold tracking-[-0.02em] sm:text-2xl">
            {title}
          </h1>

          <button
            type="button"
            onClick={() => void handlePrimaryAction()}
            disabled={!canContinue || creating}
            className="min-w-[92px] rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition active:scale-95 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
          >
            {creating
              ? t('messages.createFlow.creating')
              : isFinalStep
                ? chatType === 'group'
                  ? t('messages.createFlow.createGroup')
                  : t('messages.createFlow.createChannel')
                : t('messages.createFlow.next')}
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/35 px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-5 touch-pan-y sm:px-6 sm:pt-8">
        <div className="mx-auto w-full max-w-3xl">
          {step === 'details' ? (
            <div className="space-y-5">
              <div className="rounded-[28px] bg-card p-4 shadow-sm ring-1 ring-border sm:p-5">
                <div className="flex items-center gap-4">
                  <label className="relative shrink-0 cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary sm:h-24 sm:w-24">
                      {avatarUploading ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : avatarUrl ? (
                        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Camera className="h-7 w-7" />
                      )}
                    </div>
                  </label>

                  <Input
                    autoFocus
                    value={name}
                    maxLength={MAX_NAME}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={
                      chatType === 'group'
                        ? t('messages.createFlow.groupName')
                        : t('messages.createFlow.channelName')
                    }
                    className="h-14 flex-1 border-0 bg-transparent px-2 text-lg shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>

              <div className="rounded-[28px] bg-card p-4 shadow-sm ring-1 ring-border sm:p-5">
                <Textarea
                  value={description}
                  maxLength={MAX_DESCRIPTION}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t('messages.createFlow.description')}
                  rows={4}
                  className="min-h-[112px] resize-none border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="sticky top-0 z-10 -mx-1 bg-muted/35 px-1 pb-2 backdrop-blur-sm">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t('messages.createFlow.searchUsers')}
                    className="h-13 rounded-2xl border-border bg-card pl-12 pr-11 shadow-sm"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label={t('common.remove')}
                      className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {selectedUsers.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hidden">
                  {selectedUsers.map((userId) => {
                    const selected = users.find((person) => person.id === userId);
                    return (
                      <button
                        key={userId}
                        type="button"
                        onClick={() => toggleUser(userId)}
                        className="flex shrink-0 items-center gap-2 rounded-full bg-card py-1 pl-1 pr-3 text-sm shadow-sm ring-1 ring-border"
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={selected?.avatar_url || ''} />
                          <AvatarFallback className="text-xs">
                            {(selected?.display_name || selected?.username || 'U')[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="max-w-[120px] truncate font-medium">
                          {selected?.display_name || selected?.username || t('profile.user')}
                        </span>
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="overflow-hidden rounded-[28px] bg-card shadow-sm ring-1 ring-border">
                {loadingUsers ? (
                  <div className="flex h-48 items-center justify-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : users.length === 0 ? (
                  <div className="flex h-48 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                    {t('messages.createFlow.noUsers')}
                  </div>
                ) : (
                  users.map((person, index) => {
                    const selected = selectedUsers.includes(person.id);
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => toggleUser(person.id)}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/60 active:bg-muted',
                          index > 0 && 'border-t border-border',
                        )}
                      >
                        <div className="relative shrink-0">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={person.avatar_url || ''} />
                            <AvatarFallback className="font-semibold">
                              {(person.display_name || person.username || 'U')[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <OnlineIndicator userId={person.id} size="sm" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {person.display_name || person.username || t('profile.user')}
                          </p>
                          {person.username && person.display_name && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              @{person.username}
                            </p>
                          )}
                        </div>

                        <span
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition',
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background text-transparent',
                          )}
                        >
                          <Check className="h-4 w-4" strokeWidth={2.7} />
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
