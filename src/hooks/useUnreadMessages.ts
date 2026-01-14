import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useUnreadMessages() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

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

      setUnreadCount(totalUnread);
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

    fetchUnreadCount();

    // Subscribe to new messages
    const messagesChannel = supabase
      .channel('unread-messages-count')
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
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .subscribe();

    // Subscribe to conversation_participants updates (last_read_at changes)
    const participantsChannel = supabase
      .channel('unread-participants-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newData = payload.new as { last_read_at: string | null };
          const oldData = payload.old as { last_read_at: string | null };
          
          if (newData.last_read_at !== oldData.last_read_at) {
            fetchUnreadCount();
          }
        }
      )
      .subscribe();

    // Subscribe to message_reads for real-time updates
    const readsChannel = supabase
      .channel('unread-message-reads')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reads',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(participantsChannel);
      supabase.removeChannel(readsChannel);
    };
  }, [user, fetchUnreadCount]);

  return { unreadCount, refetch: fetchUnreadCount };
}
