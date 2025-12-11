import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

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
  unread_count?: number;
  other_participant?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_online: boolean;
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
}

export function useConversations(type?: 'private' | 'group' | 'channel') {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Get user's conversations
      const { data: participations, error: partError } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (partError) throw partError;

      if (!participations || participations.length === 0) {
        setConversations([]);
        setIsLoading(false);
        return;
      }

      const conversationIds = participations.map(p => p.conversation_id);

      let query = supabase
        .from('conversations')
        .select('*')
        .in('id', conversationIds)
        .order('last_message_at', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      const { data: convos, error } = await query;

      if (error) throw error;

      // For private conversations, get the other participant
      const conversationsWithDetails = await Promise.all(
        (convos || []).map(async (conv) => {
          let otherParticipant = null;
          let lastMessage = null;

          if (conv.type === 'private') {
            const { data: participants } = await supabase
              .from('conversation_participants')
              .select('user_id')
              .eq('conversation_id', conv.id)
              .neq('user_id', user.id)
              .limit(1);

            if (participants && participants.length > 0) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('id, username, display_name, avatar_url, is_online')
                .eq('id', participants[0].user_id)
                .single();

              otherParticipant = profile;
            }
          }

          // Get last message
          const { data: messages } = await supabase
            .from('messages')
            .select('content')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1);

          if (messages && messages.length > 0) {
            lastMessage = messages[0].content;
          }

          return {
            ...conv,
            other_participant: otherParticipant,
            last_message: lastMessage,
            unread_count: 0, // TODO: Calculate unread count
          } as Conversation;
        })
      );

      setConversations(conversationsWithDetails);
    } catch (error: any) {
      console.error('Error fetching conversations:', error);
      toast({
        title: 'Error',
        description: 'Failed to load conversations',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, type, toast]);

  const createPrivateConversation = useCallback(async (otherUserId: string) => {
    if (!user) return null;

    try {
      // Check if conversation already exists
      const { data: existingParticipations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (existingParticipations) {
        for (const p of existingParticipations) {
          const { data: otherParticipant } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('conversation_id', p.conversation_id)
            .eq('user_id', otherUserId)
            .single();

          if (otherParticipant) {
            const { data: conv } = await supabase
              .from('conversations')
              .select('*')
              .eq('id', p.conversation_id)
              .eq('type', 'private')
              .single();

            if (conv) return conv;
          }
        }
      }

      // Create new conversation
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          type: 'private',
          owner_id: user.id,
        })
        .select()
        .single();

      if (convError) throw convError;

      // Add participants
      await supabase.from('conversation_participants').insert([
        { conversation_id: newConv.id, user_id: user.id, role: 'owner' },
        { conversation_id: newConv.id, user_id: otherUserId, role: 'member' },
      ]);

      fetchConversations();
      return newConv;
    } catch (error: any) {
      console.error('Error creating conversation:', error);
      toast({
        title: 'Error',
        description: 'Failed to create conversation',
        variant: 'destructive',
      });
      return null;
    }
  }, [user, toast, fetchConversations]);

  const createGroup = useCallback(async (name: string, memberIds: string[]) => {
    if (!user) return null;

    try {
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          type: 'group',
          name,
          owner_id: user.id,
        })
        .select()
        .single();

      if (convError) throw convError;

      // Add participants
      const participants = [
        { conversation_id: newConv.id, user_id: user.id, role: 'owner' as const },
        ...memberIds.map(id => ({
          conversation_id: newConv.id,
          user_id: id,
          role: 'member' as const,
        })),
      ];

      await supabase.from('conversation_participants').insert(participants);

      fetchConversations();
      return newConv;
    } catch (error: any) {
      console.error('Error creating group:', error);
      toast({
        title: 'Error',
        description: 'Failed to create group',
        variant: 'destructive',
      });
      return null;
    }
  }, [user, toast, fetchConversations]);

  useEffect(() => {
    if (user) {
      fetchConversations();
    }
  }, [user, fetchConversations]);

  return {
    conversations,
    isLoading,
    refresh: fetchConversations,
    createPrivateConversation,
    createGroup,
  };
}

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    setIsLoading(true);

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
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data as Message[]);

      // Mark messages as read
      if (user) {
        const unreadMessageIds = data
          ?.filter(m => m.sender_id !== user.id)
          .map(m => m.id) || [];

        if (unreadMessageIds.length > 0) {
          await supabase.from('message_reads').upsert(
            unreadMessageIds.map(messageId => ({
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
      setIsLoading(false);
    }
  }, [conversationId, user]);

  const sendMessage = useCallback(async (content: string, mediaUrl?: string, mediaType?: string) => {
    if (!conversationId || !user) return null;

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

      // Update conversation's last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      return data;
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive',
      });
      return null;
    }
  }, [conversationId, user, toast]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ content, is_edited: true, updated_at: new Date().toISOString() })
        .eq('id', messageId);

      if (error) throw error;

      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, content, is_edited: true } : m
      ));
    } catch (error: any) {
      console.error('Error editing message:', error);
      toast({
        title: 'Error',
        description: 'Failed to edit message',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_deleted: true, content: null })
        .eq('id', messageId);

      if (error) throw error;

      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, is_deleted: true, content: null } : m
      ));
    } catch (error: any) {
      console.error('Error deleting message:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete message',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Set typing indicator
  const setTyping = useCallback(async (isTyping: boolean) => {
    if (!conversationId || !user) return;

    try {
      if (isTyping) {
        await supabase.from('typing_indicators').upsert({
          conversation_id: conversationId,
          user_id: user.id,
          started_at: new Date().toISOString(),
        }, { onConflict: 'conversation_id,user_id' });
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
  }, [conversationId, user]);

  useEffect(() => {
    if (conversationId) {
      fetchMessages();
    }
  }, [conversationId, fetchMessages]);

  // Real-time subscription for new messages
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          // Fetch full message with sender
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
            setMessages(prev => [...prev, data as Message]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Real-time subscription for typing indicators
  useEffect(() => {
    if (!conversationId || !user) return;

    const channel = supabase
      .channel(`typing:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async () => {
          const { data } = await supabase
            .from('typing_indicators')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .neq('user_id', user.id);

          setTypingUsers(data?.map(t => t.user_id) || []);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  return {
    messages,
    isLoading,
    typingUsers,
    sendMessage,
    editMessage,
    deleteMessage,
    setTyping,
    refresh: fetchMessages,
  };
}
