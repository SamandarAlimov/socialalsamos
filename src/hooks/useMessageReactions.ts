import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

interface ReactionGroup {
  emoji: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

export function useMessageReactions(messageId: string | null) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReactions = useCallback(async () => {
    if (!messageId) return;
    
    setIsLoading(true);
    const { data, error } = await supabase
      .from('message_reactions')
      .select('*')
      .eq('message_id', messageId);

    if (!error && data) {
      setReactions(data);
    }
    setIsLoading(false);
  }, [messageId]);

  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  // Subscribe to real-time changes
  useEffect(() => {
    if (!messageId) return;

    const channel = supabase
      .channel(`reactions-${messageId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
          filter: `message_id=eq.${messageId}`,
        },
        () => {
          fetchReactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId, fetchReactions]);

  const addReaction = useCallback(async (emoji: string) => {
    if (!messageId || !user) return;

    const { error } = await supabase
      .from('message_reactions')
      .insert({
        message_id: messageId,
        user_id: user.id,
        emoji,
      });

    if (error && error.code !== '23505') { // Ignore unique constraint violation
      console.error('Error adding reaction:', error);
    }
  }, [messageId, user]);

  const removeReaction = useCallback(async (emoji: string) => {
    if (!messageId || !user) return;

    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji);

    if (error) {
      console.error('Error removing reaction:', error);
    }
  }, [messageId, user]);

  const toggleReaction = useCallback(async (emoji: string) => {
    const hasReacted = reactions.some(r => r.user_id === user?.id && r.emoji === emoji);
    if (hasReacted) {
      await removeReaction(emoji);
    } else {
      await addReaction(emoji);
    }
  }, [reactions, user?.id, addReaction, removeReaction]);

  // Group reactions by emoji
  const groupedReactions: ReactionGroup[] = reactions.reduce((groups, reaction) => {
    const existing = groups.find(g => g.emoji === reaction.emoji);
    if (existing) {
      existing.count++;
      existing.users.push(reaction.user_id);
      if (reaction.user_id === user?.id) {
        existing.hasReacted = true;
      }
    } else {
      groups.push({
        emoji: reaction.emoji,
        count: 1,
        users: [reaction.user_id],
        hasReacted: reaction.user_id === user?.id,
      });
    }
    return groups;
  }, [] as ReactionGroup[]);

  return {
    reactions: groupedReactions,
    isLoading,
    addReaction,
    removeReaction,
    toggleReaction,
  };
}
