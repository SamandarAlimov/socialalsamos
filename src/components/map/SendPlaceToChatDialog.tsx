import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, Send, Users } from 'lucide-react';
import { db } from '@/lib/supabaseAny';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';

interface ChatOption {
  id: string;
  title: string;
  avatar: string | null;
  isGroup: boolean;
}

interface SendPlaceToChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  place: { name: string; address?: string | null; latitude: number; longitude: number } | null;
}

/**
 * Lokatsiya xabari Telegramdagi formatda saqlanadi:
 * "<pin> LOCATION:lat,lng|manzil" - chat kartasi uni xarita sifatida ko'rsatadi.
 */
function locationPayload(place: {
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
}): string {
  const label = place.address ? place.name + ', ' + place.address : place.name;
  return (
    '\ud83d\udccd LOCATION:' +
    place.latitude.toFixed(6) +
    ',' +
    place.longitude.toFixed(6) +
    '|' +
    label
  );
}

export function SendPlaceToChatDialog({
  open,
  onOpenChange,
  place,
}: SendPlaceToChatDialogProps) {
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: parts } = await db
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id);

      const ids: string[] = (parts ?? []).map(
        (row: { conversation_id: string }) => row.conversation_id,
      );
      if (!ids.length) {
        setChats([]);
        return;
      }

      const { data: convs } = await db
        .from('conversations')
        .select('id, type, name, avatar_url, last_message_at')
        .in('id', ids)
        .order('last_message_at', { ascending: false })
        .limit(60);

      const { data: others } = await db
        .from('conversation_participants')
        .select('conversation_id, user_id')
        .in('conversation_id', ids)
        .neq('user_id', user.id);

      const otherIds = Array.from(
        new Set((others ?? []).map((row: { user_id: string }) => row.user_id)),
      );

      const profileById = new Map<
        string,
        { display_name: string | null; username: string | null; avatar_url: string | null }
      >();
      if (otherIds.length) {
        const { data: profiles } = await db
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', otherIds);
        (profiles ?? []).forEach(
          (profile: {
            id: string;
            username: string | null;
            display_name: string | null;
            avatar_url: string | null;
          }) => profileById.set(profile.id, profile),
        );
      }

      const otherByConversation = new Map<string, string>();
      (others ?? []).forEach((row: { conversation_id: string; user_id: string }) => {
        if (!otherByConversation.has(row.conversation_id)) {
          otherByConversation.set(row.conversation_id, row.user_id);
        }
      });

      const options: ChatOption[] = (convs ?? []).map(
        (conv: { id: string; type: string; name: string | null; avatar_url: string | null }) => {
          if (conv.type === 'private') {
            const otherId = otherByConversation.get(conv.id);
            const profile = otherId ? profileById.get(otherId) : undefined;
            return {
              id: conv.id,
              title:
                profile?.display_name ??
                profile?.username ??
                (otherId ? 'Foydalanuvchi' : 'Saqlangan xabarlar'),
              avatar: profile?.avatar_url ?? null,
              isGroup: false,
            };
          }
          return {
            id: conv.id,
            title: conv.name ?? 'Guruh',
            avatar: conv.avatar_url,
            isGroup: true,
          };
        },
      );

      setChats(options);
    } catch {
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const send = async (chat: ChatOption) => {
    if (!user || !place) return;
    setSendingId(chat.id);
    try {
      const { error } = await db.from('messages').insert({
        conversation_id: chat.id,
        sender_id: user.id,
        content: locationPayload(place),
      });
      if (error) throw error;
      await db
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', chat.id);
      toast.success('Lokatsiya yuborildi: ' + chat.title);
      onOpenChange(false);
    } catch {
      toast.error('Yuborilmadi. Keyinroq urinib ko\u2019ring.');
    } finally {
      setSendingId(null);
    }
  };

  const filtered = query.trim()
    ? chats.filter((chat) => chat.title.toLowerCase().includes(query.trim().toLowerCase()))
    : chats;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="text-base">Lokatsiyani yuborish</DialogTitle>
        </DialogHeader>

        {place && (
          <p className="px-4 text-xs text-muted-foreground">
            {place.name}
            {place.address ? ' \u00b7 ' + place.address : ''}
          </p>
        )}

        <div className="px-4 pt-3">
          <div className="flex h-9 items-center gap-2 rounded-lg border border-border/70 px-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Chat qidirish"
              className="h-full flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto px-2 py-2">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chatlar yuklanmoqda...
            </div>
          )}

          {!loading && !filtered.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">Chat topilmadi.</p>
          )}

          {filtered.map((chat) => (
            <button
              key={chat.id}
              type="button"
              disabled={sendingId === chat.id}
              onClick={() => void send(chat)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted disabled:opacity-60"
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={chat.avatar ?? undefined} />
                <AvatarFallback>
                  {chat.isGroup ? <Users className="h-4 w-4" /> : chat.title.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{chat.title}</span>
              {sendingId === chat.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Send className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SendPlaceToChatDialog;
