import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserName } from '@/components/UserName';
import { Conversation } from '@/hooks/useMessages';
import { cn } from '@/lib/utils';
import {
  MessageSquareText,
  Users,
  UserRound,
  Megaphone,
  SearchX,
  Loader2,
} from 'lucide-react';

interface FoundProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
}

interface FoundMessage {
  id: string;
  conversation_id: string;
  content: string | null;
  created_at: string;
  sender_id: string | null;
}

interface GlobalSearchResultsProps {
  /** Qidiruv so'zi (input qiymati). */
  query: string;
  /** Foydalanuvchining barcha suhbatlari (nom bo'yicha moslash uchun). */
  conversations: Conversation[];
  /** Chat tanlanganda; messageId berilsa o'sha xabarga o'tiladi. */
  onSelectConversation: (conversationId: string, messageId?: string) => void;
  /** Foydalanuvchi tanlanganda yangi/mavjud shaxsiy chat ochiladi. */
  onSelectUser: (userId: string) => void;
}

const MESSAGE_LIMIT = 30;
const USER_LIMIT = 8;
const DEBOUNCE_MS = 280;

function conversationTitle(conv: Conversation, selfId?: string): string {
  if (conv.type === 'private') {
    if (conv.other_participant?.id && conv.other_participant.id === selfId) {
      return 'Saqlangan xabarlar';
    }
    return (
      conv.other_participant?.display_name ||
      conv.other_participant?.username ||
      'Foydalanuvchi'
    );
  }
  return conv.name || (conv.type === 'channel' ? 'Kanal' : 'Guruh');
}

function conversationAvatar(conv: Conversation): string | undefined {
  if (conv.type === 'private') return conv.other_participant?.avatar_url || undefined;
  return (conv as any).avatar_url || undefined;
}

/** Topilgan so'zni qalin qilib ko'rsatish */
function Highlighted({ text, term }: { text: string; term: string }) {
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index === -1 || !term) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-muted px-0.5 text-foreground">
        {text.slice(index, index + term.length)}
      </mark>
      {text.slice(index + term.length)}
    </>
  );
}

/** Uzun xabardan topilgan joy atrofidagi qismni kesib olish */
function snippet(content: string, term: string): string {
  const clean = content.replace(/\s+/g, ' ').trim();
  const index = clean.toLowerCase().indexOf(term.toLowerCase());
  if (index <= 40) return clean.slice(0, 120);
  return '...' + clean.slice(index - 30, index + 90);
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' });
  }
  return date.toLocaleDateString('uz-UZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Messages sahifasidagi umumiy qidiruv natijalari.
 *
 * Telegramdek uch bo'lim: Chatlar, Foydalanuvchilar va barcha suhbatlardagi
 * Xabarlar. Xabar tanlansa shu suhbat ochilib, o'sha xabarga o'tiladi.
 *
 * Tasdiq nishoni: har doim markazlashtirilgan `UserName` komponenti orqali.
 */
export function GlobalSearchResults({
  query,
  conversations,
  onSelectConversation,
  onSelectUser,
}: GlobalSearchResultsProps) {
  const { user } = useAuth();
  const [debounced, setDebounced] = useState(query.trim());
  const [isLoading, setIsLoading] = useState(false);
  const [profiles, setProfiles] = useState<FoundProfile[]>([]);
  const [messages, setMessages] = useState<FoundMessage[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Nomi mos keladigan suhbatlar (mahalliy, tez)
  const matchedConversations = useMemo(() => {
    const term = debounced.toLowerCase();
    if (!term) return [];
    return conversations
      .filter((conv) => {
        const title = conversationTitle(conv, user?.id).toLowerCase();
        const username = conv.other_participant?.username?.toLowerCase() || '';
        return title.includes(term) || username.includes(term);
      })
      .slice(0, 12);
  }, [conversations, debounced, user?.id]);

  const conversationById = useMemo(() => {
    const map = new Map<string, Conversation>();
    for (const conv of conversations) map.set(conv.id, conv);
    return map;
  }, [conversations]);

  useEffect(() => {
    let cancelled = false;

    if (!debounced || debounced.length < 2 || !user) {
      setProfiles([]);
      setMessages([]);
      setIsLoading(false);
      return;
    }

    const run = async () => {
      setIsLoading(true);
      try {
        const pattern = `%${debounced}%`;

        // 1) Foydalanuvchilar (is_verified nishon uchun kerak)
        const profilesPromise = supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, is_verified')
          .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
          .neq('id', user.id)
          .limit(USER_LIMIT);

        // 2) Foydalanuvchi qatnashgan suhbatlar ro'yxati
        const participantPromise = supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', user.id);

        const [profilesRes, participantRes] = await Promise.all([
          profilesPromise,
          participantPromise,
        ]);

        if (cancelled) return;
        setProfiles((profilesRes.data as FoundProfile[]) || []);

        const conversationIds = (participantRes.data || [])
          .map((row: { conversation_id: string }) => row.conversation_id)
          .filter(Boolean);

        if (conversationIds.length === 0) {
          setMessages([]);
          return;
        }

        // 3) Barcha suhbatlardagi xabarlar
        const { data: messageRows } = await supabase
          .from('messages')
          .select('id, conversation_id, content, created_at, sender_id')
          .in('conversation_id', conversationIds)
          .ilike('content', pattern)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(MESSAGE_LIMIT);

        if (cancelled) return;
        setMessages((messageRows as FoundMessage[]) || []);
      } catch (error) {
        console.error('Umumiy qidiruvda xatolik:', error);
        if (!cancelled) {
          setProfiles([]);
          setMessages([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [debounced, user]);

  const isEmpty =
    !isLoading &&
    matchedConversations.length === 0 &&
    profiles.length === 0 &&
    messages.length === 0;

  if (!debounced) return null;

  return (
    <div className="pb-4">
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Qidirilmoqda...
        </div>
      )}

      {/* Chatlar */}
      {matchedConversations.length > 0 && (
        <section>
          <h4 className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Chatlar
          </h4>
          {matchedConversations.map((conv) => {
            const title = conversationTitle(conv, user?.id);
            const showBadge =
              conv.type === 'private' && Boolean(conv.other_participant?.is_verified);
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelectConversation(conv.id)}
                className="tg-transition flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/60 active:bg-accent"
              >
                <Avatar className="h-11 w-11 shrink-0">
                  <AvatarImage src={conversationAvatar(conv)} />
                  <AvatarFallback className="bg-muted text-sm">
                    {title[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <UserName
                    isVerified={showBadge}
                    badgeSize="xs"
                    className="text-sm font-medium"
                  >
                    <Highlighted text={title} term={debounced} />
                  </UserName>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    {conv.type === 'group' ? (
                      <>
                        <Users className="h-3 w-3" /> Guruh
                      </>
                    ) : conv.type === 'channel' ? (
                      <>
                        <Megaphone className="h-3 w-3" /> Kanal
                      </>
                    ) : (
                      <>
                        <UserRound className="h-3 w-3" />
                        {conv.other_participant?.username
                          ? `@${conv.other_participant.username}`
                          : 'Shaxsiy chat'}
                      </>
                    )}
                  </p>
                </div>
              </button>
            );
          })}
        </section>
      )}

      {/* Foydalanuvchilar */}
      {profiles.length > 0 && (
        <section>
          <h4 className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Foydalanuvchilar
          </h4>
          {profiles.map((profile) => {
            const name = profile.display_name || profile.username || 'Foydalanuvchi';
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => onSelectUser(profile.id)}
                className="tg-transition flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/60 active:bg-accent"
              >
                <Avatar className="h-11 w-11 shrink-0">
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback className="bg-muted text-sm">
                    {name[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <UserName
                    isVerified={profile.is_verified}
                    badgeSize="xs"
                    className="text-sm font-medium"
                  >
                    <Highlighted text={name} term={debounced} />
                  </UserName>
                  {profile.username && (
                    <p className="truncate text-xs text-muted-foreground">
                      @{profile.username}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </section>
      )}

      {/* Xabarlar */}
      {messages.length > 0 && (
        <section>
          <h4 className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Xabarlar
          </h4>
          {messages.map((message) => {
            const conv = conversationById.get(message.conversation_id);
            const title = conv ? conversationTitle(conv, user?.id) : 'Suhbat';
            const text = snippet(message.content || '', debounced);
            return (
              <button
                key={message.id}
                type="button"
                onClick={() => onSelectConversation(message.conversation_id, message.id)}
                className="tg-transition flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent/60 active:bg-accent"
              >
                <Avatar className="mt-0.5 h-10 w-10 shrink-0">
                  <AvatarImage src={conv ? conversationAvatar(conv) : undefined} />
                  <AvatarFallback className="bg-muted text-xs">
                    <MessageSquareText className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{title}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatWhen(message.created_at)}
                    </span>
                  </div>
                  <p
                    className={cn('line-clamp-2 text-xs text-muted-foreground')}
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    <Highlighted text={text} term={debounced} />
                  </p>
                </div>
              </button>
            );
          })}
        </section>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center text-muted-foreground">
          <SearchX className="mb-3 h-10 w-10 opacity-50" />
          <p className="text-sm">Hech narsa topilmadi</p>
          <p className="mt-1 text-xs">Boshqa so'z bilan qidirib ko'ring</p>
        </div>
      )}
    </div>
  );
}
