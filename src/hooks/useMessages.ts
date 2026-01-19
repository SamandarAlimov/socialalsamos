import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { RealtimeChannel } from '@supabase/supabase-js';
import { unreadMessagesEmitter } from './useUnreadMessages';

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
  is_pinned?: boolean;
  is_muted?: boolean;
  is_archived?: boolean;
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

// Global connection manager for persistent realtime
class RealtimeConnectionManager {
  private static instance: RealtimeConnectionManager;
  private channels: Map<string, RealtimeChannel> = new Map();
  private listeners: Map<string, Set<(payload: any) => void>> = new Map();

  static getInstance() {
    if (!this.instance) {
      this.instance = new RealtimeConnectionManager();
    }
    return this.instance;
  }

  subscribe(channelName: string, callback: (payload: any) => void) {
    if (!this.listeners.has(channelName)) {
      this.listeners.set(channelName, new Set());
    }
    this.listeners.get(channelName)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(channelName)?.delete(callback);
    };
  }

  notifyListeners(channelName: string, payload: any) {
    this.listeners.get(channelName)?.forEach(cb => cb(payload));
  }
}

const connectionManager = RealtimeConnectionManager.getInstance();

export function useConversations(type?: 'private' | 'group' | 'channel', showArchived: boolean = false) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Get user's conversations with participation info (pinned, muted, archived, last_read_at)
      const { data: participations, error: partError } = await supabase
        .from('conversation_participants')
        .select('conversation_id, is_pinned, is_muted, is_archived, last_read_at')
        .eq('user_id', user.id)
        .eq('is_archived', showArchived);

      if (partError) throw partError;

      if (!participations || participations.length === 0) {
        setConversations([]);
        setIsLoading(false);
        return;
      }

      const conversationIds = participations.map(p => p.conversation_id);
      
      // Create a map for quick lookup of participation settings
      const participationMap = new Map(
        participations.map(p => [p.conversation_id, { 
          is_pinned: p.is_pinned ?? false, 
          is_muted: p.is_muted ?? false,
          is_archived: p.is_archived ?? false,
          last_read_at: p.last_read_at,
        }])
      );

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
          let unreadCount = 0;
          let isSelfChat = false;

          const participantSettings = participationMap.get(conv.id);

          if (conv.type === 'private') {
            // Check total participants to detect self-chat
            const { count: participantCount } = await supabase
              .from('conversation_participants')
              .select('*', { count: 'exact', head: true })
              .eq('conversation_id', conv.id);

            // Self-chat has only 1 participant (the user themselves)
            if (participantCount === 1) {
              isSelfChat = true;
              // For self-chat, use user's own profile
              const { data: profile } = await supabase
                .from('profiles')
                .select('id, username, display_name, avatar_url, is_online, last_seen, is_verified')
                .eq('id', user.id)
                .single();
              otherParticipant = profile;
            } else {
              // Regular private chat - get the other participant
              const { data: participants } = await supabase
                .from('conversation_participants')
                .select('user_id')
                .eq('conversation_id', conv.id)
                .neq('user_id', user.id)
                .limit(1);

              if (participants && participants.length > 0) {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('id, username, display_name, avatar_url, is_online, last_seen, is_verified')
                  .eq('id', participants[0].user_id)
                  .single();

                otherParticipant = profile;
              }
            }
          }

          // Get last message
          const { data: messages } = await supabase
            .from('messages')
            .select('content')
            .eq('conversation_id', conv.id)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(1);

          if (messages && messages.length > 0) {
            lastMessage = messages[0].content;
          }

          // Calculate unread count using last_read_at for efficiency
          // For self-chat, don't count unread (all messages are from self)
          if (!isSelfChat) {
            let unreadQuery = supabase
              .from('messages')
              .select('id', { count: 'exact', head: true })
              .eq('conversation_id', conv.id)
              .neq('sender_id', user.id)
              .eq('is_deleted', false);

            // Only count messages after last_read_at if it exists
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
            unread_count: unreadCount,
            is_pinned: participantSettings?.is_pinned ?? false,
            is_muted: participantSettings?.is_muted ?? false,
            is_archived: participantSettings?.is_archived ?? false,
            is_self_chat: isSelfChat,
          } as Conversation;
        })
      );

      // Sort: pinned first, then unread first, then by last_message_at
      conversationsWithDetails.sort((a, b) => {
        // Pinned conversations always first
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        
        // Within pinned/unpinned groups, unread conversations first
        const aUnread = (a.unread_count ?? 0) > 0;
        const bUnread = (b.unread_count ?? 0) > 0;
        if (aUnread && !bUnread) return -1;
        if (!aUnread && bUnread) return 1;
        
        // Finally sort by last message time
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });

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
  }, [user, type, showArchived, toast]);

  const createPrivateConversation = useCallback(async (otherUserId: string): Promise<Conversation | null> => {
    if (!user) return null;

    try {
      console.log('Creating private conversation with:', otherUserId);
      
      // First, fetch the other user's profile (we'll need this regardless)
      const { data: otherUserProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_online, last_seen, is_verified')
        .eq('id', otherUserId)
        .single();

      if (profileError || !otherUserProfile) {
        console.error('Error fetching other user profile:', profileError);
        throw new Error('User not found');
      }

      // Check if conversation already exists between these two users
      const { data: myParticipations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (myParticipations && myParticipations.length > 0) {
        for (const p of myParticipations) {
          // Check if other user is in this conversation
          const { data: otherParticipant } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('conversation_id', p.conversation_id)
            .eq('user_id', otherUserId)
            .single();

          if (otherParticipant) {
            // Check if it's a private conversation
            const { data: existingConv } = await supabase
              .from('conversations')
              .select('*')
              .eq('id', p.conversation_id)
              .eq('type', 'private')
              .single();

            if (existingConv) {
              console.log('Found existing conversation:', existingConv.id);
              // Return with other_participant populated
              const fullConversation: Conversation = {
                ...existingConv,
                type: existingConv.type as 'private' | 'group' | 'channel',
                other_participant: otherUserProfile,
                last_message: undefined,
                unread_count: 0,
              };
              return fullConversation;
            }
          }
        }
      }

      // Create new conversation
      console.log('Creating new conversation...');
      
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          type: 'private',
          owner_id: user.id,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (convError) {
        console.error('Error creating conversation:', convError);
        throw convError;
      }

      console.log('Created conversation:', newConv.id);

      // Add both participants atomically
      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert([
          { conversation_id: newConv.id, user_id: user.id, role: 'owner' },
          { conversation_id: newConv.id, user_id: otherUserId, role: 'member' },
        ]);

      if (partError) {
        console.error('Error adding participants:', partError);
        // Clean up on failure
        await supabase.from('conversations').delete().eq('id', newConv.id);
        throw partError;
      }

      console.log('Added participants successfully');
      
      // Return COMPLETE conversation with other_participant populated
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

      // Refresh conversations list in background
      fetchConversations();
      
      return fullConversation;
    } catch (error: any) {
      console.error('Error creating conversation:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create conversation',
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

  // Subscribe to conversation updates
  useEffect(() => {
    if (!user) return;

    // Subscribe to global unread messages events
    const unsubscribeEmitter = unreadMessagesEmitter.subscribe(() => {
      fetchConversations();
    });

    channelRef.current = supabase
      .channel(`conversations-list-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        () => {
          fetchConversations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        () => {
          fetchConversations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_participants',
        },
        (payload) => {
          const updated = payload.new as { user_id: string };
          // Refresh when any participant's last_read_at, is_pinned, is_muted changes
          if (updated.user_id === user.id) {
            fetchConversations();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reads',
        },
        (payload) => {
          const newRead = payload.new as { user_id: string };
          // Refresh when we read messages to update unread counts
          if (newRead.user_id === user.id) {
            fetchConversations();
          }
        }
      )
      .subscribe((status) => {
        console.log('Conversations channel status:', status);
      });

    return () => {
      unsubscribeEmitter();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [user, fetchConversations]);

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
  const messageChannelRef = useRef<RealtimeChannel | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const processedMessageIds = useRef<Set<string>>(new Set());

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    try {
      // First fetch all messages
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

      // Fetch messages deleted for this user only
      let deletedForMeIds: Set<string> = new Set();
      if (user) {
        const { data: deletions } = await supabase
          .from('message_deletions')
          .select('message_id')
          .eq('user_id', user.id);
        
        deletedForMeIds = new Set((deletions || []).map(d => d.message_id));
      }
      
      // Filter out messages deleted for this user
      const filteredMessages = (data || []).filter(m => !deletedForMeIds.has(m.id));
      
      const messagesWithStatus = filteredMessages.map(m => ({
        ...m,
        status: 'delivered' as const,
      }));
      
      setMessages(messagesWithStatus as Message[]);
      
      // Track all fetched message IDs
      processedMessageIds.current = new Set(filteredMessages.map(m => m.id));

      // Mark messages as read
      if (user && filteredMessages.length > 0) {
        const unreadMessageIds = filteredMessages
          .filter(m => m.sender_id !== user.id)
          .map(m => m.id);

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

  // OPTIMISTIC message sending - show immediately, then confirm
  const sendMessage = useCallback(async (content: string, mediaUrl?: string, mediaType?: string) => {
    if (!conversationId || !user) return null;

    // Generate temp ID for optimistic update
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create optimistic message
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
        display_name: user.email?.split('@')[0] || 'You',
        avatar_url: null,
      },
    };

    // Add optimistic message immediately
    setMessages(prev => [...prev, optimisticMessage]);

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

      // Track this message ID to prevent duplicate from realtime
      processedMessageIds.current.add(data.id);

      // Replace optimistic message with real one
      setMessages(prev => prev.map(m => 
        m.tempId === tempId 
          ? { ...data, status: 'sent' as const } as Message
          : m
      ));

      // Update conversation's last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      return data;
    } catch (error: any) {
      console.error('Error sending message:', error);
      
      // Mark message as failed
      setMessages(prev => prev.map(m => 
        m.tempId === tempId 
          ? { ...m, status: 'failed' as const }
          : m
      ));
      
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

  // Delete message for everyone (marks as deleted in messages table)
  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_deleted: true, content: null })
        .eq('id', messageId);

      if (error) throw error;

      // Remove the message completely from state (not just mark as deleted)
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (error: any) {
      console.error('Error deleting message:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete message',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Delete message for current user only (adds to message_deletions table)
  const deleteMessageForMe = useCallback(async (messageId: string) => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('message_deletions')
        .insert({
          message_id: messageId,
          user_id: user.id,
        });

      if (error) throw error;

      // Remove the message from local state for this user only
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (error: any) {
      console.error('Error deleting message for me:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete message',
        variant: 'destructive',
      });
    }
  }, [user, toast]);

  // Set typing indicator (reliable without requiring unique constraints)
  const setTyping = useCallback(async (isTyping: boolean) => {
    if (!conversationId || !user) return;

    try {
      if (isTyping) {
        // Ensure we have at most one row per user/conversation even if DB lacks a unique constraint
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

        // Auto-clear typing after 3 seconds of no updates
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
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
  }, [conversationId, user]);

  // Fetch messages when conversation changes
  useEffect(() => {
    processedMessageIds.current.clear();
    if (conversationId) {
      fetchMessages();
    } else {
      setMessages([]);
      setIsLoading(false);
    }
  }, [conversationId, fetchMessages]);

  // Real-time subscription for NEW messages
  useEffect(() => {
    if (!conversationId) return;

    console.log('Setting up realtime for conversation:', conversationId);

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
          console.log('Realtime INSERT received:', payload.new.id);
          
          // Skip if we already have this message (from optimistic update)
          if (processedMessageIds.current.has(payload.new.id)) {
            console.log('Skipping duplicate message:', payload.new.id);
            return;
          }
          
          processedMessageIds.current.add(payload.new.id);

          // Fetch full message with sender info
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
            console.log('Adding new message to state:', data.id);
            setMessages(prev => {
              // Double-check no duplicate
              if (prev.some(m => m.id === data.id)) {
                return prev;
              }
              return [...prev, { ...data, status: 'delivered' as const } as Message];
            });

            // Auto-mark as read if not from current user
            if (user && data.sender_id !== user.id) {
              await supabase.from('message_reads').upsert({
                message_id: data.id,
                user_id: user.id,
              }, { onConflict: 'message_id,user_id' });
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
          console.log('Realtime UPDATE received:', payload.new.id);
          const updatedMessage = payload.new as any;
          
          // If message was deleted, remove it from state completely
          if (updatedMessage.is_deleted) {
            setMessages(prev => prev.filter(m => m.id !== updatedMessage.id));
          } else {
            setMessages(prev => prev.map(m =>
              m.id === updatedMessage.id
                ? { ...m, ...updatedMessage }
                : m
            ));
          }
        }
      )
      .subscribe((status) => {
        console.log('Messages channel status:', status);
      });

    return () => {
      if (messageChannelRef.current) {
        console.log('Cleaning up messages channel');
        supabase.removeChannel(messageChannelRef.current);
      }
    };
  }, [conversationId, user]);

  // Real-time subscription for typing indicators
  useEffect(() => {
    if (!conversationId || !user) return;

    const fetchTyping = async () => {
      // Treat typing as "active" only if updated very recently
      const thresholdAgo = new Date(Date.now() - 3500).toISOString();

      const { data } = await supabase
        .from('typing_indicators')
        .select(
          `user_id, started_at, profile:profiles!typing_indicators_user_id_fkey(display_name, username)`
        )
        .eq('conversation_id', conversationId)
        .neq('user_id', user.id)
        .gt('started_at', thresholdAgo);

      const names = (data || []).map((t: any) => t.profile?.display_name || t.profile?.username || 'Someone');
      setTypingUsers(names);
    };

    // Initial fetch
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
      .subscribe((status) => {
        console.log('Typing channel status:', status);
      });

    // Safety poll (covers missed realtime events)
    const poll = setInterval(fetchTyping, 1500);

    return () => {
      clearInterval(poll);
      if (typingChannelRef.current) {
        supabase.removeChannel(typingChannelRef.current);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      // Clear my typing indicator when leaving the conversation
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
