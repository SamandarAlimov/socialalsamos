import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Check,
  Copy,
  Facebook,
  Link2,
  Loader2,
  Mail,
  MessageCircle as WhatsApp,
  Search,
  Send,
  Twitter,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  type: string;
  name: string | null;
  avatar_url: string | null;
  participant?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface SharePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  postContent?: string;
}

interface ShareShortcutProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  active?: boolean;
  iconClassName?: string;
}

function createShareEventId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function ShareShortcut({ icon: Icon, label, onClick, active = false, iconClassName }: ShareShortcutProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-[76px] shrink-0 flex-col items-center gap-2 rounded-2xl py-1 text-center active:scale-[0.97]"
    >
      <span
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full bg-muted/65 text-foreground ring-1 ring-border/45 transition-colors group-hover:bg-muted',
          active && 'bg-foreground text-background ring-foreground',
        )}
      >
        <Icon className={cn('h-[22px] w-[22px]', iconClassName)} />
      </span>
      <span className="line-clamp-2 text-[11px] font-medium leading-4 text-foreground">{label}</span>
    </button>
  );
}

export function SharePostDialog({
  open,
  onOpenChange,
  postId,
  postContent,
}: SharePostDialogProps) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const shareUrl = `${window.location.origin}/post/${postId}`;
  const shareText = postContent ? postContent.substring(0, 100) : 'Check out this post!';

  const trackShare = async (
    channel: 'internal_chat' | 'copy_link' | 'external' | 'native_share',
    destination?: string | null,
  ) => {
    if (!user?.id || !postId) return;
    try {
      await (supabase as any).rpc('track_post_share', {
        p_post_id: postId,
        p_channel: channel,
        p_destination: destination || null,
        p_client_event_id: createShareEventId(),
      });
    } catch {
      // Sharing is the primary action. Analytics must never block it.
    }
  };

  useEffect(() => {
    if (open && user) void fetchConversations();
    if (!open) {
      setSearch('');
      setSelectedIds([]);
      setCopied(false);
    }
  }, [open, user]);

  const fetchConversations = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const { data: participations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (!participations?.length) {
        setConversations([]);
        return;
      }

      const conversationIds = participations.map((p) => p.conversation_id);
      const { data: convos } = await supabase
        .from('conversations')
        .select('id, type, name, avatar_url')
        .in('id', conversationIds)
        .order('last_message_at', { ascending: false });

      if (!convos) {
        setConversations([]);
        return;
      }

      const processedConvos: Conversation[] = [];
      for (const convo of convos) {
        if (convo.type === 'private') {
          const { data: participants } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', convo.id)
            .neq('user_id', user.id)
            .limit(1);

          if (participants?.length) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url')
              .eq('id', participants[0].user_id)
              .single();

            if (profile) processedConvos.push({ ...convo, participant: profile });
          }
        } else {
          processedConvos.push(convo);
        }
      }

      setConversations(processedConvos);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      setConversations([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      await trackShare('copy_link', 'clipboard');
      setCopied(true);
      toast.success('Havola nusxalandi');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Havolani nusxalab bo‘lmadi');
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    );
  };

  const handleSend = async () => {
    if (selectedIds.length === 0 || !user) return;
    setIsSending(true);

    try {
      let sentCount = 0;
      for (const conversationId of selectedIds) {
        const { error: messageError } = await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: postContent
            ? `Shared a post: "${postContent.substring(0, 50)}..."`
            : 'Shared a post',
          shared_post_id: postId,
        });

        if (messageError) throw messageError;

        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId);

        sentCount += 1;
        await trackShare('internal_chat', 'chat');
      }

      toast.success(`${sentCount} ta chatga yuborildi`);
      setSelectedIds([]);
      onOpenChange(false);
    } catch (error) {
      console.error('Error sharing post:', error);
      toast.error('Postni yuborib bo‘lmadi');
    } finally {
      setIsSending(false);
    }
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: 'Alsamos post',
        text: shareText,
        url: shareUrl,
      });
      await trackShare('native_share');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast.error('Ulashib bo‘lmadi');
    }
  };

  const filteredConversations = conversations.filter((conversation) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    if (conversation.type === 'private' && conversation.participant) {
      return Boolean(
        conversation.participant.username?.toLowerCase().includes(query) ||
          conversation.participant.display_name?.toLowerCase().includes(query),
      );
    }
    return Boolean(conversation.name?.toLowerCase().includes(query));
  });

  const externalShareOptions = [
    {
      name: 'Twitter',
      icon: Twitter,
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
    },
    {
      name: 'Facebook',
      icon: Facebook,
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    },
    {
      name: 'WhatsApp',
      icon: WhatsApp,
      url: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
    },
    {
      name: 'Email',
      icon: Mail,
      url: `mailto:?subject=${encodeURIComponent('Alsamos post')}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`,
    },
  ];

  const openExternalShare = (name: string, url: string) => {
    const popup = window.open(url, '_blank', 'noopener,noreferrer,width=640,height=540');
    if (popup) void trackShare('external', name.toLowerCase());
  };

  const content = (
    <div className="min-h-0">
      <div className="relative px-4 pb-3">
        <Search className="pointer-events-none absolute left-8 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Chatlarni qidirish"
          className="h-11 rounded-2xl border-0 bg-muted/65 pl-11 pr-4 text-sm shadow-none ring-0 focus-visible:ring-1 focus-visible:ring-ring/40"
        />
      </div>

      <ScrollArea className="h-[min(36dvh,310px)] px-3">
        {isLoading ? (
          <div className="flex h-44 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center px-8 text-center text-sm text-muted-foreground">
            <Users className="mb-2 h-7 w-7 opacity-45" />
            <span>{search ? 'Mos chat topilmadi' : 'Hozircha ulashish uchun chat yo‘q'}</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-x-2 gap-y-4 pb-3 sm:grid-cols-4">
            {filteredConversations.map((conversation) => {
              const isSelected = selectedIds.includes(conversation.id);
              const displayName =
                conversation.type === 'private' && conversation.participant
                  ? conversation.participant.display_name || conversation.participant.username
                  : conversation.name;
              const avatarUrl =
                conversation.type === 'private' && conversation.participant
                  ? conversation.participant.avatar_url
                  : conversation.avatar_url;
              const isGroup = conversation.type === 'group' || conversation.type === 'channel';

              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => toggleSelection(conversation.id)}
                  className="group flex min-w-0 flex-col items-center rounded-2xl px-1 py-1.5 text-center active:scale-[0.98]"
                >
                  <span className="relative">
                    <Avatar
                      className={cn(
                        'h-16 w-16 ring-2 ring-transparent ring-offset-2 ring-offset-background transition-all',
                        isSelected && 'ring-foreground',
                      )}
                    >
                      <AvatarImage src={avatarUrl || ''} />
                      <AvatarFallback className="bg-muted text-base">
                        {isGroup ? <Users className="h-5 w-5" /> : displayName?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      className={cn(
                        'absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-background ring-1 ring-border/70 transition-colors',
                        isSelected && 'bg-foreground text-background ring-foreground',
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                    </span>
                  </span>
                  <span className="mt-2 line-clamp-2 max-w-[92px] text-[12px] font-medium leading-4 text-foreground">
                    {displayName || 'Unknown'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {selectedIds.length > 0 && (
        <div className="px-4 pb-3 pt-1">
          <Button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            className="h-11 w-full rounded-2xl bg-foreground text-background shadow-sm hover:bg-foreground/90"
          >
            {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {selectedIds.length} ta chatga yuborish
          </Button>
        </div>
      )}

      <div className="mx-4 border-t border-border/60" />

      <div className="overflow-x-auto px-3 pb-[calc(14px+env(safe-area-inset-bottom,0px))] pt-4 scrollbar-hide">
        <div className="flex min-w-max gap-1">
          <ShareShortcut
            icon={copied ? Check : Link2}
            label={copied ? 'Nusxalandi' : 'Havolani nusxalash'}
            active={copied}
            onClick={() => void handleCopy()}
          />
          {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
            <ShareShortcut icon={Send} label="Boshqa ilovalar" onClick={() => void handleNativeShare()} />
          )}
          {externalShareOptions.map((option) => (
            <ShareShortcut
              key={option.name}
              icon={option.icon}
              label={option.name}
              onClick={() => openExternalShare(option.name, option.url)}
            />
          ))}
          <ShareShortcut
            icon={Copy}
            label="Havolani ko‘rish"
            onClick={() => {
              void navigator.clipboard.writeText(shareUrl);
              toast.success('Post havolasi tayyor');
            }}
          />
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
        <DrawerContent
          overlayClassName="bg-black/55 backdrop-blur-[1px]"
          handleClassName="mt-3 h-1 w-10 bg-muted-foreground/25"
          className="max-h-[88dvh] overflow-hidden rounded-t-[28px] border-x border-t border-border/65 bg-background shadow-2xl"
        >
          <DrawerHeader className="px-5 pb-3 pt-3 text-left">
            <DrawerTitle className="text-xl font-semibold tracking-tight">Ulashish</DrawerTitle>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[560px] sm:rounded-[28px]">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="text-xl font-semibold tracking-tight">Ulashish</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
