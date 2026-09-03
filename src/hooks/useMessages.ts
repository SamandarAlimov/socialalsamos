import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { RealtimeChannel } from '@supabase/supabase-js';
import { unreadMessagesEmitter } from './useUnreadMessages';
import { loadMessageDrafts, messageDraftsEmitter } from '@/lib/messageDrafts';
import { resolveChatMessageMediaUrl, resolveChatMessageMediaUrls } from '@/lib/mediaUpload';
import {
  appendRealtimeMessage,
  BASE_MESSAGE_SELECT,
  buildMessageInsertPayload,
  hydrateReplyTargets,
  insertMessageWithReplyFallback,
  replaceOptimisticMessage,
} from '@/lib/messagePipeline';

export interface LastMessageMeta {
  /** Oxirgi xabar id - o'qilganlik holatini aniqlash uchun kerak */
  id: string | null;
  content: string | null;
  media_type: string | null;
  media_url: string | null;
  media_file_name: string | null;
  metadata?: Record<string, unknown> | null;
  sender_id: string | null;
  /**
   * Telegramdek ptichkalar uchun: o'zimiz yuborgan oxirgi xabarni suhbatdagi
   * boshqa a'zo o'qiganmi (ikkita ko'k ptichka) yoki hali yo'qmi (bitta).
   */
  is_read?: boolean;
}

export interface Conversation {
  id: string;
  type: 'private' | 'group' | 'channel';
  name: string | null;
  avatar_url: string | null;
  description: string | null;
  owner_id: string | null;
  is_encrypted: boolean;
  last_message_at: string;
  created_at: string;
  last_message?: string;
  last_message_meta?: LastMessageMeta;
  draft?: string | null;
  draft_updated_at?: string | null;
  unread_count?: number;
  is_pinned?: boolean;
  is_muted?: boolean;
  is_archived?: boolean;
  is_request?: boolean;
  is_self_chat?: boolean;
  my_role?: 'owner' | 'admin' | 'member' | string | null;
  other_participant?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_online: boolean;
    last_seen: string | null;
    is_verified?: boolean;
  };
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  media_file_name?: string | null;
  mime_type?: string | null;
  media_size_bytes?: number | null;
  reply_to_id: string | null;
  story_id: string | null;
  shared_post_id: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  sender?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  reply_to?: {
    id: string;
    content: string | null;
    media_url: string | null;
    media_type: string | null;
    is_deleted: boolean | null;
    sender_id: string | null;
    sender?: {
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    } | null;
  } | null;
  is_read?: boolean;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  tempId?: string;
  client_message_id?: string | null;
  metadata?: Record<string, unknown> | null;
  location_payload?: Record<string, unknown> | null;
  live_location_expires_at?: string | null;
  live_location_stopped_at?: string | null;
}

export interface MessageSendExtras {
  metadata?: Record<string, unknown>;
  mediaFileName?: string;
  mimeType?: string;
  mediaSizeBytes?: number;
  locationPayload?: Record<string, unknown>;
  liveLocationExpiresAt?: string;
}

/** Telegramdek: chat oynasi faqat oxirgi sahifani yuklaydi, qolgani surilganda keladi */
const MESSAGE_PAGE_SIZE = 60;
/** Oxirgi xabarlarni bitta so'rovda olish uchun chegara */
const LAST_MESSAGE_SCAN_LIMIT = 400;
/** O'qilmagan xabarlarni bitta so'rovda hisoblash chegarasi */
const UNREAD_SCAN_LIMIT = 1000;
/** Realtime hodisalar ketma-ket kelganda ro'yxatni bir marta yangilash */
const LIST_REFRESH_DEBOUNCE = 180;

export function useConversations(
  type?: 'private' | 'group' | 'channel',
  showArchived: boolean = false
) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  // Faqat birinchi yuklashda skeleton ko'rsatiladi
  const hasLoadedRef = useRef(false);

  /**
   * Chat ro'yxati bitta necha so'rovda yuklanadi (avvalgi N+1 emas):
   * a'zolar, profillar, oxirgi xabarlar va o'qilmaganlar - har biri bitta so'rov.
   */
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (!hasLoadedRef.current) setIsLoading(true);

    try {
      const { data: participations, error: partError } = await supabase
        .from('conversation_participants')
        .select('conversation_id, is_pinned, is_muted, is_archived, is_request, last_read_at, role')
        .eq('user_id', user.id)
        .eq('is_archived', showArchived);

      if (partError) throw partError;

      if (!participations || participations.length === 0) {
        setConversations([]);
        return;
      }

      const conversationIds = participations.map((p) => p.conversation_id);

      const participationMap = new Map(
        participations.map((p) => [
          p.conversation_id,
          {
            is_pinned: p.is_pinned ?? false,
            is_muted: p.is_muted ?? false,
            is_archived: p.is_archived ?? false,
            is_request: (p as any).is_request ?? false,
            last_read_at: p.last_read_at as string | null,
            role: p.role as string | null,
          },
        ])
      );

      let query = supabase
        .from('conversations')
        .select('*')
        .in('id', conversationIds)
        .order('last_message_at', { ascending: false });

      if (type) query = query.eq('type', type);

      const { data: convos, error } = await query;
      if (error) throw error;

      const list = convos || [];
      if (list.length === 0) {
        setConversations([]);
        return;
      }

      const ids = list.map((c) => c.id);
      const privateIds = list.filter((c) => c.type === 'private').map((c) => c.id);

      // 1) 1:1 chatlarning a'zolari - bitta so'rov
      const membersByConv = new Map<string, string[]>();
      if (privateIds.length > 0) {
        const { data: members } = await supabase
          .from('conversation_participants')
          .select('conversation_id, user_id')
          .in('conversation_id', privateIds);

        for (const m of members || []) {
          const arr = membersByConv.get(m.conversation_id) || [];
          arr.push(m.user_id);
          membersByConv.set(m.conversation_id, arr);
        }
      }

      const otherIdByConv = new Map<string, string>();
      const selfChatIds = new Set<string>();
      const profileIds = new Set<string>();

      for (const cid of privateIds) {
        const members = membersByConv.get(cid) || [];
        const others = members.filter((id) => id !== user.id);
        if (others.length === 0) {
          selfChatIds.add(cid);
          profileIds.add(user.id);
        } else {
          otherIdByConv.set(cid, others[0]);
          profileIds.add(others[0]);
        }
      }

      // 2) Profillar - bitta so'rov
      const profileMap = new Map<string, any>();
      if (profileIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, is_online, last_seen, is_verified')
          .in('id', Array.from(profileIds));

        for (const p of profiles || []) profileMap.set(p.id, p);
      }

      // 3) Oxirgi xabarlar - bitta so'rov
      const lastMessageMap = new Map<string, LastMessageMeta>();
      const { data: recentMessages } = await supabase
        .from('messages')
        .select('id, conversation_id, content, media_type, media_url, media_file_name, metadata, sender_id, created_at')
        .in('conversation_id', ids)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(LAST_MESSAGE_SCAN_LIMIT);

      for (const msg of recentMessages || []) {
        if (lastMessageMap.has(msg.conversation_id)) continue;
        lastMessageMap.set(msg.conversation_id, {
          id: msg.id,
          content: msg.content,
          media_type: msg.media_type,
          media_url: msg.media_url,
          media_file_name:
            (msg as any).media_file_name ??
            ((msg as any).metadata?.file_name as string | undefined) ??
            ((msg as any).metadata?.filename as string | undefined) ??
            null,
          metadata:
            ((msg as any).metadata as Record<string, unknown> | null | undefined) ?? null,
          sender_id: msg.sender_id,
          is_read: false,
        });
      }

      // 3b) O'zimiz yuborgan oxirgi xabarlar o'qilganmi - bitta so'rov.
      // Telegramdek: bitta ptichka = yuborildi, ikkita ko'k = o'qildi.
      const ownLastMessageIds: string[] = [];
      lastMessageMap.forEach((meta) => {
        if (meta.id && meta.sender_id === user.id) ownLastMessageIds.push(meta.id);
      });

      if (ownLastMessageIds.length > 0) {
        const { data: reads } = await supabase
          .from('message_reads')
          .select('message_id, user_id')
          .in('message_id', ownLastMessageIds)
          .neq('user_id', user.id);

        const readIds = new Set((reads || []).map((r) => r.message_id));
        lastMessageMap.forEach((meta) => {
          if (meta.id && readIds.has(meta.id)) meta.is_read = true;
        });
      }

      // 3c) Telegram-style per-chat draftlar: server mavjud bo'lsa sync,
      // migration/connectivity bo'lmasa shu qurilmadagi local fallback ishlaydi.
      const draftMap = await loadMessageDrafts(user.id, ids);

      // 4) O'qilmagan xabarlar - bitta so'rov
      const unreadMap = new Map<string, number>();
      const readTimes = ids
        .map((id) => participationMap.get(id)?.last_read_at)
        .filter((value): value is string => Boolean(value));
      const earliestRead =
        readTimes.length === ids.length && readTimes.length > 0
          ? readTimes.reduce((min, value) => (value < min ? value : min))
          : null;

      let unreadQuery = supabase
        .from('messages')
        .select('conversation_id, created_at')
        .in('conversation_id', ids)
        .neq('sender_id', user.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(UNREAD_SCAN_LIMIT);

      if (earliestRead) unreadQuery = unreadQuery.gt('created_at', earliestRead);

      const { data: unreadRows } = await unreadQuery;
      for (const row of unreadRows || []) {
        const lastRead = participationMap.get(row.conversation_id)?.last_read_at;
        if (lastRead && new Date(row.created_at).getTime() <= new Date(lastRead).getTime()) {
          continue;
        }
        unreadMap.set(row.conversation_id, (unreadMap.get(row.conversation_id) || 0) + 1);
      }

      const conversationsWithDetails = list.map((conv) => {
        const settings = participationMap.get(conv.id);
        const isSelfChat = selfChatIds.has(conv.id);
        const otherId = otherIdByConv.get(conv.id);
        const otherParticipant = isSelfChat
          ? profileMap.get(user.id) || null
          : otherId
            ? profileMap.get(otherId) || null
            : null;
        const meta = lastMessageMap.get(conv.id);
        const draft = draftMap.get(conv.id);

        return {
          ...conv,
          type: conv.type as 'private' | 'group' | 'channel',
          other_participant: otherParticipant,
          last_message: meta?.content ?? null,
          last_message_meta: meta,
          draft: draft?.content ?? null,
          draft_updated_at: draft?.updated_at ?? null,
          unread_count: isSelfChat ? 0 : unreadMap.get(conv.id) || 0,
          is_pinned: settings?.is_pinned ?? false,
          is_muted: settings?.is_muted ?? false,
          is_archived: settings?.is_archived ?? false,
          is_request: settings?.is_request ?? false,
          is_self_chat: isSelfChat,
          my_role: settings?.role ?? null,
        } as Conversation;
      });

      conversationsWithDetails.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;

        const aUnread = (a.unread_count ?? 0) > 0;
        const bUnread = (b.unread_count ?? 0) > 0;
        if (aUnread && !bUnread) return -1;
        if (!aUnread && bUnread) return 1;

        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });

      setConversations(conversationsWithDetails);
    } catch (error: any) {
      console.error('Error fetching conversations:', error);
      toast({
        title: 'Xatolik',
        description: "Suhbatlarni yuklab bo'lmadi",
        variant: 'destructive',
      });
    } finally {
      inFlightRef.current = false;
      hasLoadedRef.current = true;
      setIsLoading(false);
    }
  }, [user, type, showArchived, toast]);

  /** Realtime hodisalar to'planganda ro'yxatni bir marta yangilash.
   * Agar oldingi fetch hali tugamagan bo'lsa hodisani yo'qotmaymiz — navbatga qo'yamiz. */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);

    const runRefresh = () => {
      if (inFlightRef.current) {
        refreshTimerRef.current = window.setTimeout(runRefresh, LIST_REFRESH_DEBOUNCE);
        return;
      }
      refreshTimerRef.current = null;
      void fetchConversations();
    };

    refreshTimerRef.current = window.setTimeout(runRefresh, LIST_REFRESH_DEBOUNCE);
  }, [fetchConversations]);

  const createPrivateConversation = useCallback(
    async (otherUserId: string): Promise<Conversation | null> => {
      if (!user) return null;

      try {
        const { data: otherUserProfile, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, is_online, last_seen, is_verified')
          .eq('id', otherUserId)
          .single();

        if (profileError || !otherUserProfile) {
          throw new Error('Foydalanuvchi topilmadi');
        }

        const { data: myParticipations } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', user.id);

        const myIds = (myParticipations || []).map((p) => p.conversation_id);

        if (myIds.length > 0) {
          // Bitta so'rov: umumiy chatni topamiz
          const { data: shared } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', otherUserId)
            .in('conversation_id', myIds);

          const sharedIds = (shared || []).map((p) => p.conversation_id);
          if (sharedIds.length > 0) {
            const { data: existingConv } = await supabase
              .from('conversations')
              .select('*')
              .in('id', sharedIds)
              .eq('type', 'private')
              .limit(1)
              .maybeSingle();

            if (existingConv) {
              return {
                ...existingConv,
                type: existingConv.type as 'private' | 'group' | 'channel',
                other_participant: otherUserProfile,
                last_message: undefined,
                unread_count: 0,
              } as Conversation;
            }
          }
        }

        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            type: 'private',
            owner_id: user.id,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (convError) throw convError;

        const { error: partError } = await supabase.from('conversation_participants').insert([
          { conversation_id: newConv.id, user_id: user.id, role: 'owner' },
          { conversation_id: newConv.id, user_id: otherUserId, role: 'member' },
        ]);

        if (partError) {
          await supabase.from('conversations').delete().eq('id', newConv.id);
          throw partError;
        }

        const fullConversation: Conversation = {
          id: newConv.id,
          type: 'private',
          name: null,
          avatar_url: null,
          description: null,
          owner_id: newConv.owner_id,
          is_encrypted: newConv.is_encrypted,
          last_message_at: newConv.last_message_at,
          created_at: newConv.created_at,
          other_participant: otherUserProfile,
          last_message: undefined,
          unread_count: 0,
        };

        scheduleRefresh();
        return fullConversation;
      } catch (error: any) {
        console.error('Error creating conversation:', error);
        toast({
          title: 'Xatolik',
          description: error.message || "Suhbat yaratib bo'lmadi",
          variant: 'destructive',
        });
        return null;
      }
    },
    [user, toast, scheduleRefresh]
  );

  /** Guruh yoki kanal yaratish uchun umumiy funksiya */
  const createConversation = useCallback(
    async (
      convType: 'group' | 'channel',
      name: string,
      memberIds: string[],
      options: { description?: string; avatarUrl?: string } = {}
    ) => {
      if (!user) return null;

      const label = convType === 'group' ? 'Guruh' : 'Kanal';

      if (!name.trim()) {
        toast({
          title: 'Xatolik',
          description: `${label} nomini kiriting`,
          variant: 'destructive',
        });
        return null;
      }

      try {
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            type: convType,
            name: name.trim(),
            description: options.description?.trim() || null,
            avatar_url: options.avatarUrl || null,
            owner_id: user.id,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (convError) throw convError;

        const uniqueMembers = Array.from(new Set(memberIds.filter((id) => id && id !== user.id)));

        const participants = [
          { conversation_id: newConv.id, user_id: user.id, role: 'owner' as const },
          ...uniqueMembers.map((id) => ({
            conversation_id: newConv.id,
            user_id: id,
            role: 'member' as const,
          })),
        ];

        const { error: partError } = await supabase
          .from('conversation_participants')
          .insert(participants);

        if (partError) {
          await supabase.from('conversations').delete().eq('id', newConv.id);
          throw partError;
        }

        await fetchConversations();
        return newConv;
      } catch (error: any) {
        console.error(`Error creating ${convType}:`, error);
        toast({
          title: 'Xatolik',
          description: error.message || `${label} yaratib bo'lmadi`,
          variant: 'destructive',
        });
        return null;
      }
    },
    [user, toast, fetchConversations]
  );

  const createGroup = useCallback(
    (
      name: string,
      memberIds: string[],
      options: { description?: string; avatarUrl?: string } = {}
    ) => createConversation('group', name, memberIds, options),
    [createConversation]
  );

  const createChannel = useCallback(
    (
      name: string,
      memberIds: string[] = [],
      options: { description?: string; avatarUrl?: string } = {}
    ) => createConversation('channel', name, memberIds, options),
    [createConversation]
  );

  useEffect(() => {
    if (!user) return;

    const unsubscribeEmitter = unreadMessagesEmitter.subscribe(() => {
      scheduleRefresh();
    });
    const unsubscribeDrafts = messageDraftsEmitter.subscribe(() => {
      scheduleRefresh();
    });

    channelRef.current = supabase
      .channel(`conversations-list-${user.id}-${showArchived ? 'arch' : 'live'}-${type || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        scheduleRefresh();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new as {
          id?: string;
          conversation_id?: string;
          content?: string | null;
          media_type?: string | null;
          media_url?: string | null;
          media_file_name?: string | null;
          metadata?: Record<string, unknown> | null;
          sender_id?: string | null;
          created_at?: string;
        };

        // Chat-list preview server round-tripini kutmaydi: yangi xabar kelishi bilan
        // shu conversation darhol yangilanadi, keyin background refresh ma'lumotni
        // authoritative holat bilan tekislaydi.
        if (row.conversation_id) {
          const createdAt = row.created_at || new Date().toISOString();
          setConversations((previous) => {
            let changed = false;
            const next = previous.map((conversation) => {
              if (conversation.id !== row.conversation_id) return conversation;
              changed = true;
              return {
                ...conversation,
                last_message: row.content ?? null,
                last_message_at: createdAt,
                last_message_meta: {
                  id: row.id ?? null,
                  content: row.content ?? null,
                  media_type: row.media_type ?? null,
                  media_url: row.media_url ?? null,
                  media_file_name: row.media_file_name ?? null,
                  metadata: row.metadata ?? null,
                  sender_id: row.sender_id ?? null,
                  is_read: false,
                },
                unread_count:
                  row.sender_id && row.sender_id !== user.id
                    ? (conversation.unread_count ?? 0) + 1
                    : conversation.unread_count,
              };
            });

            if (!changed) return previous;

            return next.sort((a, b) => {
              if (a.is_pinned && !b.is_pinned) return -1;
              if (!a.is_pinned && b.is_pinned) return 1;

              const aUnread = (a.unread_count ?? 0) > 0;
              const bUnread = (b.unread_count ?? 0) > 0;
              if (aUnread && !bUnread) return -1;
              if (!aUnread && bUnread) return 1;

              return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
            });
          });
        }

        scheduleRefresh();
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_participants' },
        (payload) => {
          const updated = payload.new as { user_id: string };
          if (updated.user_id === user.id) scheduleRefresh();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reads' },
        () => {
          // Har qanday o'qish hodisasi ptichkalarni yangilashi kerak:
          // o'zimizning xabarimizni suhbatdosh o'qiganda ham ro'yxat yangilanadi.
          scheduleRefresh();
        }
      )
      .subscribe();

    return () => {
      unsubscribeEmitter();
      unsubscribeDrafts();
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [user, scheduleRefresh, showArchived, type]);

  useEffect(() => {
    if (user) void fetchConversations();
  }, [user, fetchConversations]);

  return {
    conversations,
    isLoading,
    refresh: fetchConversations,
    createPrivateConversation,
    createGroup,
    createChannel,
  };
}

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();
  const messageChannelRef = useRef<RealtimeChannel | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedMessageIds = useRef<Set<string>>(new Set());
  const markedReadRef = useRef<Set<string>>(new Set());
  const loadedConversationRef = useRef<string | null>(null);
  const oldestLoadedRef = useRef<string | null>(null);

  /** O'qilgan deb belgilash - faqat hali belgilanmagan xabarlar uchun */
  const markRead = useCallback(
    (ids: string[]) => {
      if (!user || ids.length === 0) return;
      const fresh = ids.filter((id) => !markedReadRef.current.has(id) && !id.startsWith('temp-'));
      if (fresh.length === 0) return;
      for (const id of fresh) markedReadRef.current.add(id);
      void supabase
        .from('message_reads')
        .upsert(
          fresh.map((messageId) => ({ message_id: messageId, user_id: user.id })),
          { onConflict: 'message_id,user_id' }
        )
        .then(() => {});
    },
    [user]
  );

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setIsLoading(false);
      setHasMore(false);
      return;
    }

    const isFirstLoad = loadedConversationRef.current !== conversationId;
    if (isFirstLoad) setIsLoading(true);

    try {
      // Telegramdek: butun tarix emas, oxirgi sahifa yuklanadi
      const { data, error } = await supabase
        .from('messages')
        .select(BASE_MESSAGE_SELECT)
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);

      if (error) throw error;

      const page = (data || []) as any[];
      setHasMore(page.length === MESSAGE_PAGE_SIZE);
      const rows = await hydrateReplyTargets(page.slice().reverse(), async (replyIds) => {
        const { data: replies, error: replyError } = await supabase
          .from('messages')
          .select(BASE_MESSAGE_SELECT)
          .in('id', replyIds);

        if (replyError) {
          console.warn('Reply preview hydration failed; core messages remain available:', replyError);
        }

        return { data: (replies || []) as any[], error: replyError };
      });

      let deletedForMeIds: Set<string> = new Set();
      if (user && rows.length > 0) {
        const { data: deletions } = await supabase
          .from('message_deletions')
          .select('message_id')
          .eq('user_id', user.id)
          .in(
            'message_id',
            rows.map((m) => m.id)
          );

        deletedForMeIds = new Set((deletions || []).map((d) => d.message_id));
      }

      const filteredMessages = await resolveChatMessageMediaUrls(
        rows.filter((m) => !deletedForMeIds.has(m.id))
      );

      const messagesWithStatus = filteredMessages.map((m) => ({
        ...m,
        status: 'sent' as const,
      }));

      setMessages(messagesWithStatus as Message[]);
      processedMessageIds.current = new Set(filteredMessages.map((m) => m.id));
      oldestLoadedRef.current = filteredMessages[0]?.created_at ?? null;

      if (user) {
        markRead(
          filteredMessages.filter((m) => m.sender_id !== user.id).map((m) => m.id)
        );
      }
    } catch (error: any) {
      console.error('Error fetching messages:', error);
    } finally {
      loadedConversationRef.current = conversationId;
      setIsLoading(false);
    }
  }, [conversationId, user, markRead]);

  /** Yuqoriga surilganda eski xabarlarni yuklash */
  const loadOlder = useCallback(async () => {
    if (!conversationId || isLoadingMore || !hasMore) return;
    const before = oldestLoadedRef.current;
    if (!before) return;

    setIsLoadingMore(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(BASE_MESSAGE_SELECT)
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .lt('created_at', before)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);

      if (error) throw error;

      const page = (data || []) as any[];
      setHasMore(page.length === MESSAGE_PAGE_SIZE);
      if (page.length === 0) return;

      const rows = await hydrateReplyTargets(page.slice().reverse(), async (replyIds) => {
        const { data: replies, error: replyError } = await supabase
          .from('messages')
          .select(BASE_MESSAGE_SELECT)
          .in('id', replyIds);

        if (replyError) {
          console.warn('Reply preview hydration failed; core messages remain available:', replyError);
        }

        return { data: (replies || []) as any[], error: replyError };
      });

      let deletedForMeIds: Set<string> = new Set();
      if (user) {
        const { data: deletions } = await supabase
          .from('message_deletions')
          .select('message_id')
          .eq('user_id', user.id)
          .in(
            'message_id',
            rows.map((m) => m.id)
          );
        deletedForMeIds = new Set((deletions || []).map((d) => d.message_id));
      }

      const visibleRows = await resolveChatMessageMediaUrls(
        rows.filter((m) => !deletedForMeIds.has(m.id))
      );

      const older = visibleRows.map((m) => ({ ...m, status: 'sent' as const })) as Message[];

      for (const m of older) processedMessageIds.current.add(m.id);
      oldestLoadedRef.current = older[0]?.created_at ?? before;

      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !known.has(m.id)), ...prev];
      });
    } catch (error: any) {
      console.error('Error loading older messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [conversationId, hasMore, isLoadingMore, user]);

  const sendMessage = useCallback(
    async (
      content: string,
      mediaUrl?: string,
      mediaType?: string,
      replyToId?: string | null,
      extras?: MessageSendExtras
    ) => {
      if (!conversationId || !user) return null;

      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

      const optimisticMessage: Message = {
        id: tempId,
        tempId,
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        media_url: mediaUrl || null,
        media_type: mediaType || null,
        media_file_name: extras?.mediaFileName || null,
        mime_type: extras?.mimeType || null,
        media_size_bytes: extras?.mediaSizeBytes ?? null,
        reply_to_id: replyToId || null,
        metadata: extras?.metadata || null,
        location_payload: extras?.locationPayload || null,
        live_location_expires_at: extras?.liveLocationExpiresAt || null,
        story_id: null,
        shared_post_id: null,
        is_edited: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'sending',
        sender: {
          id: user.id,
          username: null,
          display_name: user.email?.split('@')[0] || 'Siz',
          avatar_url: null,
        },
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        const insertPayload = buildMessageInsertPayload({
          conversationId,
          senderId: user.id,
          content,
          mediaUrl,
          mediaType,
          mediaFileName: extras?.mediaFileName,
          mimeType: extras?.mimeType,
          mediaSizeBytes: extras?.mediaSizeBytes,
          replyToId,
          clientMessageId: tempId,
          metadata: extras?.metadata,
          locationPayload: extras?.locationPayload,
          liveLocationExpiresAt: extras?.liveLocationExpiresAt,
        });

        const insertResult = await insertMessageWithReplyFallback(
          insertPayload,
          async (payload) => {
            const { data, error } = await supabase
              .from('messages')
              .insert(payload as any)
              .select(BASE_MESSAGE_SELECT)
              .single();
            return { data, error };
          }
        );

        if (insertResult.usedFallback) {
          console.warn('Reply schema/cache incompatible; core message sent without reply metadata.');
        }

        const { data, error } = insertResult;
        if (error || !data) throw error ?? new Error('Xabar serverdan qaytmadi');

        const [hydratedData] = await hydrateReplyTargets([data as any], async (replyIds) => {
          const { data: replies, error: replyError } = await supabase
            .from('messages')
            .select(BASE_MESSAGE_SELECT)
            .in('id', replyIds);
          return { data: (replies || []) as any[], error: replyError };
        });
        const persisted = await resolveChatMessageMediaUrl(hydratedData ?? data);

        processedMessageIds.current.add(persisted.id);

        setMessages((prev) =>
          replaceOptimisticMessage(prev, tempId, {
            ...persisted,
            status: 'sent' as const,
          } as Message)
        );

        void supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId)
          .then(() => {});

        return persisted;
      } catch (error: any) {
        console.error('Error sending message:', error);

        setMessages((prev) =>
          prev.map((m) => (m.tempId === tempId ? { ...m, status: 'failed' as const } : m))
        );

        toast({
          title: 'Xatolik',
          description: "Xabar yuborilmadi - qayta urinib ko'ring",
          variant: 'destructive',
        });
        return null;
      }
    },
    [conversationId, user, toast]
  );

  const retryMessage = useCallback(
    async (messageId: string) => {
      if (!conversationId || !user) return null;

      const failedMessage = messages.find(
        (message) =>
          (message.tempId === messageId || message.id === messageId) &&
          message.status === 'failed'
      );
      if (!failedMessage) return null;

      const optimisticId = failedMessage.tempId || failedMessage.id;

      setMessages((prev) =>
        prev.map((message) =>
          (message.tempId || message.id) === optimisticId
            ? { ...message, status: 'sending' as const }
            : message
        )
      );

      try {
        // Agar oldingi urinish DBga yozilib, faqat javob tarmoqda yo'qolgan bo'lsa,
        // Telegramdek qayta insert qilmaymiz - client_message_id orqali server yozuvini tiklaymiz.
        const { data: alreadyPersisted, error: recoveryError } = await supabase
          .from('messages')
          .select(BASE_MESSAGE_SELECT)
          .eq('sender_id', user.id)
          .eq('client_message_id', optimisticId)
          .maybeSingle();

        if (!recoveryError && alreadyPersisted) {
          const [hydratedExisting] = await hydrateReplyTargets(
            [alreadyPersisted as any],
            async (replyIds) => {
              const { data: replies, error: replyError } = await supabase
                .from('messages')
                .select(BASE_MESSAGE_SELECT)
                .in('id', replyIds);
              return { data: (replies || []) as any[], error: replyError };
            }
          );
          const recovered = hydratedExisting ?? alreadyPersisted;
          processedMessageIds.current.add(recovered.id);
          setMessages((prev) =>
            replaceOptimisticMessage(prev, optimisticId, {
              ...recovered,
              status: 'sent' as const,
            } as Message)
          );
          return recovered;
        }

        const insertPayload = buildMessageInsertPayload({
          conversationId,
          senderId: user.id,
          content: failedMessage.content || '',
          mediaUrl: failedMessage.media_url || undefined,
          mediaType: failedMessage.media_type || undefined,
          replyToId: failedMessage.reply_to_id || null,
          clientMessageId: optimisticId,
          metadata: failedMessage.metadata || undefined,
          locationPayload: failedMessage.location_payload || undefined,
          liveLocationExpiresAt: failedMessage.live_location_expires_at || undefined,
        });

        const insertResult = await insertMessageWithReplyFallback(
          insertPayload,
          async (payload) => {
            const { data, error } = await supabase
              .from('messages')
              .insert(payload as any)
              .select(BASE_MESSAGE_SELECT)
              .single();
            return { data, error };
          }
        );

        const { data, error } = insertResult;
        if (error || !data) throw error ?? new Error('Xabar serverdan qaytmadi');

        const [hydratedData] = await hydrateReplyTargets([data as any], async (replyIds) => {
          const { data: replies, error: replyError } = await supabase
            .from('messages')
            .select(BASE_MESSAGE_SELECT)
            .in('id', replyIds);
          return { data: (replies || []) as any[], error: replyError };
        });
        const persisted = await resolveChatMessageMediaUrl(hydratedData ?? data);

        processedMessageIds.current.add(persisted.id);
        setMessages((prev) =>
          replaceOptimisticMessage(prev, optimisticId, {
            ...persisted,
            status: 'sent' as const,
          } as Message)
        );

        void supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId)
          .then(() => {});

        return persisted;
      } catch (error) {
        console.error('Error retrying message:', error);
        setMessages((prev) =>
          prev.map((message) =>
            (message.tempId || message.id) === optimisticId
              ? { ...message, status: 'failed' as const }
              : message
          )
        );
        toast({
          title: 'Xatolik',
          description: "Xabar qayta yuborilmadi - yana urinib ko'ring",
          variant: 'destructive',
        });
        return null;
      }
    },
    [conversationId, messages, toast, user]
  );

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      try {
        const { error } = await supabase
          .from('messages')
          .update({ content, is_edited: true, updated_at: new Date().toISOString() })
          .eq('id', messageId);

        if (error) throw error;

        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, content, is_edited: true } : m))
        );
      } catch (error: any) {
        console.error('Error editing message:', error);
        toast({
          title: 'Xatolik',
          description: "Xabarni tahrirlab bo'lmadi",
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  /** Xabarni faqat o'zimda o'chirish */
  const deleteMessageForMe = useCallback(
    async (messageId: string) => {
      if (!user) return false;

      try {
        const { error } = await supabase.from('message_deletions').insert({
          message_id: messageId,
          user_id: user.id,
        });

        if (error) throw error;

        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        return true;
      } catch (error: any) {
        console.error('Error deleting message for me:', error);
        toast({
          title: 'Xatolik',
          description: "Xabarni o'chirib bo'lmadi",
          variant: 'destructive',
        });
        return false;
      }
    },
    [user, toast]
  );

  /** Xabarni hamma uchun o'chirish (1:1 chatda ikki tomon ham o'chira oladi) */
  const deleteMessage = useCallback(
    async (messageId: string) => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .update({ is_deleted: true, content: null, media_url: null })
          .eq('id', messageId)
          .select('id');

        if (error) throw error;

        if (!data || data.length === 0) {
          const ok = await deleteMessageForMe(messageId);
          if (ok) {
            toast({
              title: "Faqat sizda o'chirildi",
              description:
                "Bu xabarni hamma uchun o'chirishga ruxsat berilmagan, shuning uchun u faqat sizning chatingizdan olib tashlandi.",
            });
          }
          return;
        }

        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } catch (error: any) {
        console.error('Error deleting message:', error);

        const ok = await deleteMessageForMe(messageId);
        if (ok) {
          toast({
            title: "Faqat sizda o'chirildi",
            description:
              "Xabarni hamma uchun o'chirib bo'lmadi, u faqat sizning chatingizdan olib tashlandi.",
          });
        }
      }
    },
    [deleteMessageForMe, toast]
  );

  const setTyping = useCallback(
    async (isTyping: boolean) => {
      if (!conversationId || !user) return;

      try {
        if (isTyping) {
          await supabase
            .from('typing_indicators')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('user_id', user.id);

          await supabase.from('typing_indicators').insert({
            conversation_id: conversationId,
            user_id: user.id,
            started_at: new Date().toISOString(),
          });

          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
            setTyping(false);
          }, 3000);
        } else {
          await supabase
            .from('typing_indicators')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('user_id', user.id);
        }
      } catch (error) {
        console.error('Error setting typing:', error);
      }
    },
    [conversationId, user]
  );

  useEffect(() => {
    processedMessageIds.current.clear();
    markedReadRef.current.clear();
    oldestLoadedRef.current = null;
    if (conversationId) {
      void fetchMessages();
    } else {
      setMessages([]);
      setIsLoading(false);
      setHasMore(false);
    }
  }, [conversationId, fetchMessages]);

  useEffect(() => {
    if (!conversationId) return;

    messageChannelRef.current = supabase
      .channel(`messages-realtime-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          if (processedMessageIds.current.has(payload.new.id)) return;
          processedMessageIds.current.add(payload.new.id);

          const { data } = await supabase
            .from('messages')
            .select(BASE_MESSAGE_SELECT)
            .eq('id', payload.new.id)
            .single();

          if (data) {
            const [hydratedData] = await hydrateReplyTargets([data as any], async (replyIds) => {
              const { data: replies, error: replyError } = await supabase
                .from('messages')
                .select(BASE_MESSAGE_SELECT)
                .in('id', replyIds);
              return { data: (replies || []) as any[], error: replyError };
            });
            const incoming = await resolveChatMessageMediaUrl(hydratedData ?? data);

            setMessages((prev) =>
              appendRealtimeMessage(prev, {
                ...incoming,
                status: 'sent' as const,
              } as Message)
            );

            if (user && incoming.sender_id !== user.id) markRead([incoming.id]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedMessage = payload.new as any;

          if (updatedMessage.is_deleted) {
            setMessages((prev) => prev.filter((m) => m.id !== updatedMessage.id));
          } else {
            setMessages((prev) =>
              prev.map((m) => (m.id === updatedMessage.id ? { ...m, ...updatedMessage } : m))
            );
          }
        }
      )
      .subscribe();

    return () => {
      if (messageChannelRef.current) supabase.removeChannel(messageChannelRef.current);
    };
  }, [conversationId, user, markRead]);

  useEffect(() => {
    if (!conversationId || !user) return;

    const fetchTyping = async () => {
      const thresholdAgo = new Date(Date.now() - 3500).toISOString();

      const { data } = await supabase
        .from('typing_indicators')
        .select(
          `user_id, started_at, profile:profiles!typing_indicators_user_id_fkey(display_name, username)`
        )
        .eq('conversation_id', conversationId)
        .neq('user_id', user.id)
        .gt('started_at', thresholdAgo);

      const names = (data || []).map(
        (t: any) => t.profile?.display_name || t.profile?.username || 'Kimdir'
      );
      setTypingUsers(names);
    };

    void fetchTyping();

    typingChannelRef.current = supabase
      .channel(`typing-realtime-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => fetchTyping()
      )
      .subscribe();

    // Realtime ishlaganda tez-tez so'rov yubormaslik uchun poll oralig'i kattaroq
    const poll = setInterval(fetchTyping, 6000);

    return () => {
      clearInterval(poll);
      if (typingChannelRef.current) supabase.removeChannel(typingChannelRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      supabase
        .from('typing_indicators')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .then(() => {});
    };
  }, [conversationId, user]);

  return {
    messages,
    isLoading,
    isLoadingMore,
    hasMore,
    loadOlder,
    typingUsers,
    sendMessage,
    retryMessage,
    editMessage,
    deleteMessage,
    deleteMessageForMe,
    setTyping,
    refresh: fetchMessages,
  };
}
