import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface PinnedMessage {
  id: string;
  message_id: string;
  conversation_id: string;
  pinned_by: string;
  pinned_at: string;
  message?: {
    id: string;
    content: string | null;
    sender_id: string | null;
    created_at: string | null;
    media_url: string | null;
    media_type: string | null;
    sender?: {
      id: string;
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
    };
  };
}

export function usePinnedMessages(conversationId: string | null) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPinnedMessages = useCallback(async () => {
    if (!conversationId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('pinned_messages')
        .select(`
          *,
          message:messages(
            id,
            content,
            sender_id,
            created_at,
            media_url,
            media_type,
            sender:profiles!messages_sender_id_fkey(
              id,
              display_name,
              username,
              avatar_url
            )
          )
        `)
        .eq('conversation_id', conversationId)
        .order('pinned_at', { ascending: false });

      if (error) throw error;
      setPinnedMessages((data || []) as PinnedMessage[]);
    } catch (error) {
      console.error('Error fetching pinned messages:', error);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  const pinMessage = useCallback(async (messageId: string) => {
    if (!conversationId || !user?.id) return false;

    try {
      const { error } = await supabase
        .from('pinned_messages')
        .insert({
          conversation_id: conversationId,
          message_id: messageId,
          pinned_by: user.id,
        });

      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Already pinned', description: 'This message is already pinned' });
          return false;
        }
        throw error;
      }

      toast({ title: 'Message pinned' });
      fetchPinnedMessages();
      return true;
    } catch (error) {
      console.error('Error pinning message:', error);
      toast({ title: 'Error', description: 'Failed to pin message', variant: 'destructive' });
      return false;
    }
  }, [conversationId, user?.id, toast, fetchPinnedMessages]);

  const unpinMessage = useCallback(async (messageId: string) => {
    if (!conversationId) return false;

    try {
      const { error } = await supabase
        .from('pinned_messages')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('message_id', messageId);

      if (error) throw error;

      toast({ title: 'Message unpinned' });
      setPinnedMessages(prev => prev.filter(p => p.message_id !== messageId));
      return true;
    } catch (error) {
      console.error('Error unpinning message:', error);
      toast({ title: 'Error', description: 'Failed to unpin message', variant: 'destructive' });
      return false;
    }
  }, [conversationId, toast]);

  const isMessagePinned = useCallback((messageId: string) => {
    return pinnedMessages.some(p => p.message_id === messageId);
  }, [pinnedMessages]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!conversationId) return;

    fetchPinnedMessages();

    const channel = supabase
      .channel(`pinned-messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pinned_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          fetchPinnedMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchPinnedMessages]);

  return {
    pinnedMessages,
    isLoading,
    pinMessage,
    unpinMessage,
    isMessagePinned,
    refetch: fetchPinnedMessages,
  };
}
