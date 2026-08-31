import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

/** Bitta foydalanuvchi bitta xabarga qo'yishi mumkin bo'lgan maksimal reaksiya soni */
export const MAX_USER_REACTIONS = 3;

export function useMessageReactions(messageId: string | null) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReactions = useCallback(async () => {
    if (!messageId || messageId.startsWith('temp-')) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .eq('message_id', messageId);

      if (error) {
        console.warn('Message reactions failed to load:', error);
        return;
      }

      setReactions(data ?? []);
    } catch (error) {
      console.error('Message reactions loading crashed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [messageId]);

  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  // Realtime o'zgarishlar
  useEffect(() => {
    if (!messageId || messageId.startsWith('temp-')) return;

    const channel = supabase
      .channel('reactions-' + messageId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
          filter: 'message_id=eq.' + messageId,
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

  /** Foydalanuvchining ushbu xabardagi reaksiyalari */
  const myReactions = useMemo(
    () => (user ? reactions.filter((r) => r.user_id === user.id).map((r) => r.emoji) : []),
    [reactions, user]
  );

  const canAddMore = myReactions.length < MAX_USER_REACTIONS;

  const removeReaction = useCallback(
    async (emoji: string) => {
      if (!messageId || !user) return;

      // Optimistik: darhol UI'dan olib tashlaymiz
      setReactions((prev) => prev.filter((r) => !(r.user_id === user.id && r.emoji === emoji)));

      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', emoji);

      if (error) {
        fetchReactions();
      }
    },
    [messageId, user, fetchReactions]
  );

  const addReaction = useCallback(
    async (emoji: string) => {
      if (!messageId || !user) return;
      if (messageId.startsWith('temp-')) return;

      const mine = reactions.filter((r) => r.user_id === user.id);

      // Allaqachon qo'yilgan bo'lsa - hech narsa qilmaymiz
      if (mine.some((r) => r.emoji === emoji)) return;

      // Chegara: maksimal 3 ta. Telegramdek jimgina eng eskisini almashtiramiz.
      if (mine.length >= MAX_USER_REACTIONS) {
        const oldest = mine
          .slice()
          .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
        if (oldest) await removeReaction(oldest.emoji);
      }

      // Optimistik qo'shish
      const optimistic: Reaction = {
        id: 'temp-' + emoji + '-' + user.id,
        message_id: messageId,
        user_id: user.id,
        emoji,
        created_at: new Date().toISOString(),
      };
      setReactions((prev) => [...prev, optimistic]);

      const { error } = await supabase.from('message_reactions').insert({
        message_id: messageId,
        user_id: user.id,
        emoji,
      });

      if (error && error.code !== '23505') {
        fetchReactions();
      }
    },
    [messageId, user, reactions, fetchReactions, removeReaction]
  );

  const toggleReaction = useCallback(
    async (emoji: string) => {
      if (!user) return;
      const hasReacted = reactions.some((r) => r.user_id === user.id && r.emoji === emoji);
      if (hasReacted) {
        await removeReaction(emoji);
      } else {
        await addReaction(emoji);
      }
    },
    [reactions, user, addReaction, removeReaction]
  );

  // Emoji bo'yicha guruhlash
  const groupedReactions: ReactionGroup[] = useMemo(() => {
    return reactions.reduce((groups, reaction) => {
      const existing = groups.find((g) => g.emoji === reaction.emoji);
      if (existing) {
        existing.count++;
        existing.users.push(reaction.user_id);
        if (reaction.user_id === user?.id) existing.hasReacted = true;
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
  }, [reactions, user?.id]);

  return {
    reactions: groupedReactions,
    isLoading,
    myReactions,
    canAddMore,
    maxReactions: MAX_USER_REACTIONS,
    addReaction,
    removeReaction,
    toggleReaction,
  };
}
