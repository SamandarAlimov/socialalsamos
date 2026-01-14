import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ScheduledMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  scheduled_for: string;
  status: 'pending' | 'sent' | 'cancelled' | 'failed';
  created_at: string;
  sent_at: string | null;
  error_message: string | null;
}

export function useScheduledMessages(conversationId?: string) {
  const { user } = useAuth();
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchScheduledMessages = useCallback(async () => {
    if (!user) return;

    try {
      let query = supabase
        .from('scheduled_messages')
        .select('*')
        .eq('sender_id', user.id)
        .eq('status', 'pending')
        .order('scheduled_for', { ascending: true });

      if (conversationId) {
        query = query.eq('conversation_id', conversationId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setScheduledMessages((data || []) as ScheduledMessage[]);
    } catch (error) {
      console.error('Error fetching scheduled messages:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, conversationId]);

  useEffect(() => {
    fetchScheduledMessages();
  }, [fetchScheduledMessages]);

  const scheduleMessage = useCallback(async (
    targetConversationId: string,
    scheduledFor: Date,
    content?: string,
    mediaUrl?: string,
    mediaType?: string
  ) => {
    if (!user) {
      toast.error('You must be logged in to schedule messages');
      return null;
    }

    if (scheduledFor <= new Date()) {
      toast.error('Scheduled time must be in the future');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('scheduled_messages')
        .insert({
          conversation_id: targetConversationId,
          sender_id: user.id,
          content,
          media_url: mediaUrl,
          media_type: mediaType,
          scheduled_for: scheduledFor.toISOString(),
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      setScheduledMessages(prev => [...prev, data as ScheduledMessage].sort(
        (a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
      ));

      toast.success(`Message scheduled for ${scheduledFor.toLocaleString()}`);
      return data;
    } catch (error) {
      console.error('Error scheduling message:', error);
      toast.error('Failed to schedule message');
      return null;
    }
  }, [user]);

  const cancelScheduledMessage = useCallback(async (messageId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('scheduled_messages')
        .update({ status: 'cancelled' })
        .eq('id', messageId)
        .eq('sender_id', user.id);

      if (error) throw error;

      setScheduledMessages(prev => prev.filter(m => m.id !== messageId));
      toast.success('Scheduled message cancelled');
      return true;
    } catch (error) {
      console.error('Error cancelling scheduled message:', error);
      toast.error('Failed to cancel scheduled message');
      return false;
    }
  }, [user]);

  const updateScheduledMessage = useCallback(async (
    messageId: string,
    updates: {
      content?: string;
      scheduled_for?: Date;
      media_url?: string;
      media_type?: string;
    }
  ) => {
    if (!user) return false;

    try {
      const updateData: Record<string, unknown> = {};
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.scheduled_for) updateData.scheduled_for = updates.scheduled_for.toISOString();
      if (updates.media_url !== undefined) updateData.media_url = updates.media_url;
      if (updates.media_type !== undefined) updateData.media_type = updates.media_type;

      const { error } = await supabase
        .from('scheduled_messages')
        .update(updateData)
        .eq('id', messageId)
        .eq('sender_id', user.id);

      if (error) throw error;

      await fetchScheduledMessages();
      toast.success('Scheduled message updated');
      return true;
    } catch (error) {
      console.error('Error updating scheduled message:', error);
      toast.error('Failed to update scheduled message');
      return false;
    }
  }, [user, fetchScheduledMessages]);

  return {
    scheduledMessages,
    isLoading,
    scheduleMessage,
    cancelScheduledMessage,
    updateScheduledMessage,
    refetch: fetchScheduledMessages
  };
}
