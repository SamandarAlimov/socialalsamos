import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ReadReceipt {
  message_id: string;
  user_id: string;
  read_at: string;
}

export function useReadReceipts(conversationId: string | null) {
  const { user } = useAuth();
  const [readReceipts, setReadReceipts] = useState<Map<string, ReadReceipt[]>>(new Map());

  // Fetch read receipts for all messages in conversation
  const fetchReadReceipts = useCallback(async () => {
    if (!conversationId || !user) return;

    const { data: messages } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId);

    if (!messages?.length) return;

    const messageIds = messages.map(m => m.id);

    const { data, error } = await supabase
      .from('message_reads')
      .select('*')
      .in('message_id', messageIds);

    if (!error && data) {
      const receiptsMap = new Map<string, ReadReceipt[]>();
      data.forEach(receipt => {
        const existing = receiptsMap.get(receipt.message_id) || [];
        existing.push(receipt);
        receiptsMap.set(receipt.message_id, existing);
      });
      setReadReceipts(receiptsMap);
    }
  }, [conversationId, user]);

  // Mark messages as read
  const markAsRead = useCallback(async (messageIds: string[]) => {
    if (!user || !messageIds.length) return;

    // Filter out messages already read by this user
    const unreadIds = messageIds.filter(id => {
      const receipts = readReceipts.get(id) || [];
      return !receipts.some(r => r.user_id === user.id);
    });

    if (!unreadIds.length) return;

    const inserts = unreadIds.map(messageId => ({
      message_id: messageId,
      user_id: user.id,
      read_at: new Date().toISOString(),
    }));

    await supabase
      .from('message_reads')
      .upsert(inserts, { onConflict: 'message_id,user_id' });
  }, [user, readReceipts]);

  // Check if message is read by recipient(s)
  const isMessageRead = useCallback((messageId: string, senderId: string) => {
    const receipts = readReceipts.get(messageId) || [];
    // Message is read if any user other than the sender has read it
    return receipts.some(r => r.user_id !== senderId);
  }, [readReceipts]);

  // Subscribe to real-time read receipt updates
  useEffect(() => {
    if (!conversationId) return;

    fetchReadReceipts();

    const channel = supabase
      .channel(`read-receipts-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reads',
        },
        (payload) => {
          const newReceipt = payload.new as ReadReceipt;
          setReadReceipts(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(newReceipt.message_id) || [];
            if (!existing.some(r => r.user_id === newReceipt.user_id)) {
              existing.push(newReceipt);
              newMap.set(newReceipt.message_id, existing);
            }
            return newMap;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchReadReceipts]);

  return {
    readReceipts,
    markAsRead,
    isMessageRead,
    fetchReadReceipts,
  };
}
