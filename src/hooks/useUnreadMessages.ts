import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Global event emitter for cross-component communication
class UnreadMessagesEventEmitter {
  private static instance: UnreadMessagesEventEmitter;
  private listeners: Set<() => void> = new Set();

  static getInstance() {
    if (!this.instance) {
      this.instance = new UnreadMessagesEventEmitter();
    }
    return this.instance;
  }

  subscribe(callback: () => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit() {
    this.listeners.forEach(cb => cb());
  }
}

export const unreadMessagesEmitter = UnreadMessagesEventEmitter.getInstance();

export function useUnreadMessages(onNewMessage?: () => void) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const isInitialFetch = useRef(true);
  const onNewMessageRef = useRef(onNewMessage);
  const lastCountRef = useRef(0);
  
  // Keep callback ref updated
  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
  }, [onNewMessage]);

  // Define fetchUnreadCount using useCallback at the top level
  const fetchUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    try {
      const { data: participations } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', user.id);

      if (!participations || participations.length === 0) {
        setUnreadCount(0);
        lastCountRef.current = 0;
        return;
      }

      let totalUnread = 0;

      for (const participation of participations) {
        let query = supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', participation.conversation_id)
          .neq('sender_id', user.id)
          .eq('is_deleted', false);

        if (participation.last_read_at) {
          query = query.gt('created_at', participation.last_read_at);
        }

        const { count } = await query;
        totalUnread += count || 0;
      }

      const previousCount = lastCountRef.current;
      lastCountRef.current = totalUnread;
      setUnreadCount(totalUnread);

      // Only trigger sound if count increased and not initial fetch
      if (!isInitialFetch.current && totalUnread > previousCount && onNewMessageRef.current) {
        onNewMessageRef.current();
      }
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  }, [user]);

  // Main effect for fetching and subscribing
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    isInitialFetch.current = true;
    fetchUnreadCount().then(() => {
      isInitialFetch.current = false;
    });

    // Subscribe to global refresh events (when messages are read elsewhere)
    const unsubscribeEmitter = unreadMessagesEmitter.subscribe(() => {
      fetchUnreadCount();
    });

    // Subscribe to new messages - use a unique channel name with user id
    const messagesChannel = supabase
      .channel(`unread-messages-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMessage = payload.new as { sender_id: string; conversation_id: string };
          
          if (newMessage.sender_id === user.id) return;

          const { data: participation } = await supabase
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', newMessage.conversation_id)
            .eq('user_id', user.id)
            .maybeSingle();

          if (participation) {
            // Refetch the actual count to ensure accuracy
            fetchUnreadCount();
          }
        }
      )
      .subscribe();

    // Subscribe to conversation_participants updates (last_read_at changes)
    // This triggers when the user reads messages
    const participantsChannel = supabase
      .channel(`unread-participants-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_participants',
        },
        (payload) => {
          const newData = payload.new as { user_id: string; last_read_at: string | null };
          const oldData = payload.old as { user_id: string; last_read_at: string | null };
          
          // Only refetch if this is our user's participation and last_read_at changed
          if (newData.user_id === user.id && newData.last_read_at !== oldData.last_read_at) {
            fetchUnreadCount();
          }
        }
      )
      .subscribe();

    // Subscribe to message_reads for real-time updates
    const readsChannel = supabase
      .channel(`unread-reads-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reads',
        },
        (payload) => {
          const newRead = payload.new as { user_id: string };
          // Only refetch if this is our user marking messages as read
          if (newRead.user_id === user.id) {
            fetchUnreadCount();
          }
        }
      )
      .subscribe();

    return () => {
      unsubscribeEmitter();
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(participantsChannel);
      supabase.removeChannel(readsChannel);
    };
  }, [user, fetchUnreadCount]);

  return { unreadCount, refetch: fetchUnreadCount };
}
