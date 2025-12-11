import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

export function useRealtimeMessages(
  conversationId: string | null,
  onNewMessage: (message: any) => void
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!conversationId) return;

    channelRef.current = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          onNewMessage(payload.new);
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [conversationId, onNewMessage]);
}

export function useTypingIndicator(conversationId: string | null, userId: string | null) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setTyping = useCallback(async (isTyping: boolean) => {
    if (!conversationId || !userId) return;

    if (isTyping) {
      await supabase.from('typing_indicators').upsert({
        conversation_id: conversationId,
        user_id: userId,
        started_at: new Date().toISOString(),
      });

      // Auto-clear after 3 seconds
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
        .eq('user_id', userId);
    }
  }, [conversationId, userId]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  return { setTyping };
}

export function useRealtimeTyping(
  conversationId: string | null,
  currentUserId: string | null,
  onTypingChange: (typingUsers: string[]) => void
) {
  useEffect(() => {
    if (!conversationId) return;

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
          // Fetch current typing users
          const { data } = await supabase
            .from('typing_indicators')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .neq('user_id', currentUserId || '');

          onTypingChange(data?.map(t => t.user_id) || []);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, onTypingChange]);
}

export function useRealtimePosts(onNewPost: (post: any) => void) {
  useEffect(() => {
    const channel = supabase
      .channel('posts-feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
        },
        (payload) => {
          onNewPost(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onNewPost]);
}

export function usePresence(userId: string | null, channelName: string) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId) return;

    channelRef.current = supabase.channel(channelName);

    channelRef.current
      .on('presence', { event: 'sync' }, () => {
        const state = channelRef.current?.presenceState();
        console.log('Presence sync:', state);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left:', key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        await channelRef.current?.track({
          user_id: userId,
          online_at: new Date().toISOString(),
        });
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [userId, channelName]);
}
