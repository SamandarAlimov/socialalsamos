import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Conversation } from '@/hooks/useMessages';

export function useSelfChat() {
  const { user } = useAuth();
  const [isCreating, setIsCreating] = useState(false);

  const getSelfConversation = useCallback(async (): Promise<Conversation | null> => {
    if (!user) return null;

    try {
      // Check if user has a conversation with themselves (self-chat)
      // This is identified by a private conversation where the user is both participants
      const { data: participations } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (!participations) return null;

      for (const p of participations) {
        // Get participants count for this conversation
        const { count } = await supabase
          .from('conversation_participants')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', p.conversation_id);

        // Self-chat has only 1 participant (the user themselves)
        if (count === 1) {
          const { data: conv } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', p.conversation_id)
            .eq('type', 'private')
            .single();

          if (conv) {
            // Get user's own profile for display
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url, is_online, last_seen, is_verified')
              .eq('id', user.id)
              .single();

            return {
              ...conv,
              type: conv.type as 'private' | 'group' | 'channel',
              other_participant: profile ? {
                ...profile,
                is_online: profile.is_online ?? false,
              } : undefined,
              last_message: undefined,
              unread_count: 0,
              is_self_chat: true,
            } as Conversation & { is_self_chat?: boolean };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting self conversation:', error);
      return null;
    }
  }, [user]);

  const createSelfConversation = useCallback(async (): Promise<Conversation | null> => {
    if (!user) return null;

    setIsCreating(true);
    try {
      // Check if self-chat already exists
      const existing = await getSelfConversation();
      if (existing) {
        return existing;
      }

      // Get user's profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_online, last_seen, is_verified')
        .eq('id', user.id)
        .single();

      // Create new self conversation
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

      // Add only the user as participant (self-chat indicator)
      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert({
          conversation_id: newConv.id,
          user_id: user.id,
          role: 'owner',
        });

      if (partError) {
        await supabase.from('conversations').delete().eq('id', newConv.id);
        throw partError;
      }

      return {
        id: newConv.id,
        type: 'private',
        name: null,
        avatar_url: null,
        description: null,
        owner_id: newConv.owner_id,
        is_encrypted: newConv.is_encrypted,
        last_message_at: newConv.last_message_at,
        created_at: newConv.created_at,
        other_participant: profile ? {
          ...profile,
          is_online: profile.is_online ?? false,
        } : undefined,
        last_message: undefined,
        unread_count: 0,
        is_self_chat: true,
      } as Conversation & { is_self_chat?: boolean };
    } catch (error) {
      console.error('Error creating self conversation:', error);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [user, getSelfConversation]);

  const getOrCreateSelfChat = useCallback(async (): Promise<Conversation | null> => {
    const existing = await getSelfConversation();
    if (existing) return existing;
    return createSelfConversation();
  }, [getSelfConversation, createSelfConversation]);

  return {
    getSelfConversation,
    createSelfConversation,
    getOrCreateSelfChat,
    isCreating,
  };
}
