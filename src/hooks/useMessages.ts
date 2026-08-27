import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { RealtimeChannel } from '@supabase/supabase-js';
import { unreadMessagesEmitter } from './useUnreadMessages';

export interface LastMessageMeta {
  content: string | null;
  media_type: string | null;
  media_url: string | null;
  media_file_name: string | null;
  sender_id: string | null;
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
  unread_count?: number;
  is_pinned?: boolean;
  is_muted?: boolean;
  is_archived?: boolean;
  is_request?: boolean;
  is_self_chat?: boolean;
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
  is_read?: boolean;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  tempId?: string;
}

export function useConversations(
  type?: 'private' | 'group' | 'channel',
  showArchived: boolean = false
) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Faqat birinchi yuklashda skeleton ko'rsatiladi - keyingi yangilanishlarda
  // ro'yxat "loading" holatiga tushib ko'z oldida o'chib-yonmaydi.
  const hasLoadedRef = useRef(false);

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    if (!hasLoadedRef.current) setIsLoading(true);

    try {
      const { data: participations, error: partError } = await supabase
        .from('conversation_participants')
        .select(
          'conversation_id, is_pinned, is_muted, is_archived, is_request, last_read_at'
        )
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
            last_read_at: p.last_read_at,
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

      const conversationsWithDetails = await Promise.all(
        (convos || []).map(async (conv) => {
          let otherParticipant = null;
          let lastMessage: string | null = null;
          let lastMessageMeta: LastMessageMeta | undefined = undefined;
          let unreadCount = 0;
          let isSelfChat = false;

          const participantSettings = participationMap.get(conv.id);

          if (conv.type === 'private') {
            const { count: participantCount } = await supabase
              .from('conversation_participants')
              .select('*', { count: 'exact', head: true })
              .eq('conversation_id', conv.id);

            if (participantCount === 1) {
              isSelfChat = true;
              const { data: profile } = await supabase
                .from('profiles')
                .select(
                  'id, username, display_name, avatar_url, is_online, last_seen, is_verified'
                )
                .eq('id', user.id)
                .single();
              otherParticipant = profile;
            } else {
              const { data: participants } = await supabase
                .from('conversation_participants')
                .select('user_id')
                .eq('conversation_id', conv.id)
                .neq('user_id', user.id)
                .limit(1);

              if (participants && participants.length > 0) {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select(
                    'id, username, display_name, avatar_url, is_online, last_seen, is_verified'
                  )
                  .eq('id', participants[0].user_id)
                  .single();

                otherParticipant = profile;
              }
            }
          }

          const { data: messages } = await supabase
            .from('messages')
            .select('content, media_type, media_url, media_file_name, sender_id')
            .eq('conversation_id', conv.id)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(1);

          if (messages && messages.length > 0) {
            const msg = messages[0];
            lastMessage = msg.content;
            lastMessageMeta = {
              content: msg.content,
              media_type: msg.media_type,
              media_url: msg.media_url,
              media_file_name: msg.media_file_name,
              sender_id: msg.sender_id,
            };
          }

          if (!isSelfChat) {
            let unreadQuery = supabase
              .from('messages')
              .select('id', { count: 'exact', head: true })
              .eq('conversation_id', conv.id)
              .neq('sender_id', user.id)
              .eq('is_deleted', false);

            if (participantSettings?.last_read_at) {
              unreadQuery = unreadQuery.gt('created_at', participantSettings.last_read_at);
            }

            const { count } = await unreadQuery;
            unreadCount = count || 0;
          }

          return {
            ...conv,
            other_participant: otherParticipant,
            last_message: lastMessage,
            last_message_meta: lastMessageMeta,
            unread_count: unreadCount,
            is_pinned: participantSettings?.is_pinned ?? false,
            is_muted: participantSettings?.is_muted ?? false,
            is_archived: participantSettings?.is_archived ?? false,
            is_request: participantSettings?.is_request ?? false,
            is_self_chat: isSelfChat,
          } as Conversation;
        })
      );

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
      hasLoadedRef.current = true;
      setIsLoading(false);
    }
  }, [user, type, showArchived, toast]);

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

        if (myParticipations && myParticipations.length > 0) {
          for (const p of myParticipations) {
            const { data: otherParticipant } = await supabase
              .from('conversation_participants')
              .select('conversation_id')
              .eq('conversation_id', p.conversation_id)
              .eq('user_id', otherUserId)
              .maybeSingle();

            if (otherParticipant) {
              const { data: existingConv } = await supabase
                .from('conversations')
                .select('*')
                .eq('id', p.conversation_id)
                .eq('type', 'private')
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

        fetchConversations();
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
    [user, toast, fetchConversations]
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

        // Takrorlanmas a'zolar ro'yxati (o'zini ikki marta qo'shib yubormaslik uchun)
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
          // A'zolarni qo'shib bo'lmasa, yarim yaratilgan suhbat qolmasligi kerak
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
      fetchConversations();
    });

    channelRef.current = supabase
      .channel(`conversations-list-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        fetchConversations();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchConversations();
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_participants' },
        (payload) => {
          const updated = payload.new as { user_id: string };
          if (updated.user_id === user.id) fetchConversations();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reads' },
        (payload) => {
          const newRead = payload.new as { user_id: string };
          if (newRead.user_id === user.id) fetchConversations();
        }
      )
      .subscribe();

    return () => {
      unsubscribeEmitter();
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [user, fetchConversations]);

  useEffect(() => {
    if (user) fetchConversations();
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
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();
  const messageChannelRef = useRef<RealtimeChannel | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedMessageIds = useRef<Set<string>>(new Set());
  // Qaysi suhbat allaqachon yuklanганini eslab qolamiz: har bir refresh'da
  // butun oyna "loading" holatiga tushmasligi uchun.
  const loadedConversationRef = useRef<string | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    const isFirstLoad = loadedConversationRef.current !== conversationId;
    if (isFirstLoad) setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles!messages_sender_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });

      if (error) throw error;

      let deletedForMeIds: Set<string> = new Set();
      if (user) {
        const { data: deletions } = await supabase
          .from('message_deletions')
          .select('message_id')
          .eq('user_id', user.id);

        deletedForMeIds = new Set((deletions || []).map((d) => d.message_id));
      }

      const filteredMessages = (data || []).filter((m) => !deletedForMeIds.has(m.id));

      const messagesWithStatus = filteredMessages.map((m) => ({
        ...m,
        status: 'delivered' as const,
      }));

      setMessages(messagesWithStatus as Message[]);
      processedMessageIds.current = new Set(filteredMessages.map((m) => m.id));

      if (user && filteredMessages.length > 0) {
        const unreadMessageIds = filteredMessages
          .filter((m) => m.sender_id !== user.id)
          .map((m) => m.id);

        if (unreadMessageIds.length > 0) {
          await supabase.from('message_reads').upsert(
            unreadMessageIds.map((messageId) => ({
              message_id: messageId,
              user_id: user.id,
            })),
            { onConflict: 'message_id,user_id' }
          );
        }
      }
    } catch (error: any) {
      console.error('Error fetching messages:', error);
    } finally {
      loadedConversationRef.current = conversationId;
      setIsLoading(false);
    }
  }, [conversationId, user]);

  const sendMessage = useCallback(
    async (content: string, mediaUrl?: string, mediaType?: string) => {
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
        reply_to_id: null,
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
        const { data, error } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content,
            media_url: mediaUrl,
            media_type: mediaType,
          })
          .select(`
            *,
            sender:profiles!messages_sender_id_fkey (
              id,
              username,
              display_name,
              avatar_url
            )
          `)
          .single();

        if (error) throw error;

        processedMessageIds.current.add(data.id);

        setMessages((prev) =>
          prev.map((m) =>
            m.tempId === tempId ? ({ ...data, status: 'sent' as const } as Message) : m
          )
        );

        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId);

        return data;
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

  /**
   * Xabarni hamma uchun o'chirish.
   * Telegramda 1:1 chatda ikki tomon ham bir-birining xabarini o'chira oladi,
   * shuning uchun bu funksiya o'z xabari bilan cheklanmaydi. Agar server
   * ruxsat bermasa (RLS), xabar hech bo'lmaganda joriy foydalanuvchida
   * o'chiriladi va sabab tushunarli qilib aytiladi.
   */
  const deleteMessage = useCallback(
    async (messageId: string) => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .update({ is_deleted: true, content: null, media_url: null })
          .eq('id', messageId)
          .select('id');

        if (error) throw error;

        // RLS tufayli hech bir qator yangilanmagan bo'lsa, kamida o'zimizda o'chiramiz
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
    if (conversationId) {
      fetchMessages();
    } else {
      setMessages([]);
      setIsLoading(false);
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
            .select(`
              *,
              sender:profiles!messages_sender_id_fkey (
                id,
                username,
                display_name,
                avatar_url
              )
            `)
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === data.id)) return prev;
              return [...prev, { ...data, status: 'delivered' as const } as Message];
            });

            if (user && data.sender_id !== user.id) {
              await supabase.from('message_reads').upsert(
                { message_id: data.id, user_id: user.id },
                { onConflict: 'message_id,user_id' }
              );
            }
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
  }, [conversationId, user]);

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

    fetchTyping();

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

    const poll = setInterval(fetchTyping, 2500);

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
    typingUsers,
    sendMessage,
    editMessage,
    deleteMessage,
    deleteMessageForMe,
    setTyping,
    refresh: fetchMessages,
  };
}
