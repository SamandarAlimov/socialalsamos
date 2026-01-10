import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useUnreadMessages() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    const fetchUnreadCount = async () => {
      try {
        // Get all conversation IDs user is part of
        const { data: participations } = await supabase
          .from('conversation_participants')
          .select('conversation_id, last_read_at')
          .eq('user_id', user.id);

        if (!participations || participations.length === 0) {
          setUnreadCount(0);
          return;
        }

        let totalUnread = 0;

        // For each conversation, count messages after last_read_at that aren't from user
        for (const participation of participations) {
          const { count } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', participation.conversation_id)
            .neq('sender_id', user.id)
            .gt('created_at', participation.last_read_at || '1970-01-01');

          totalUnread += count || 0;
        }

        setUnreadCount(totalUnread);
      } catch (error) {
        console.error('Error fetching unread count:', error);
      }
    };

    fetchUnreadCount();

    // Subscribe to new messages
    const channel = supabase
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
          
          // Skip if it's our own message
          if (newMessage.sender_id === user.id) return;

          // Check if we're in this conversation
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
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reads',
        },
        (payload) => {
          const read = payload.new as { user_id: string };
          if (read.user_id === user.id) {
            // Refresh count when we read messages
            fetchUnreadCount();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { unreadCount };
}
