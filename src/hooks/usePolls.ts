import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  castVote,
  fetchPollByPostId,
  type Poll,
} from '@/lib/polls';

/**
 * Post so'rovnomasi: real ovozlar, realtime yangilanish, viktorina rejimi.
 * Ilgari ovozlar hech qayerga yozilmasdi (har doim 0 edi).
 */
export function usePoll(postId: string | null, enabled = true) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(postId && enabled));
  const [isVoting, setIsVoting] = useState(false);

  const load = useCallback(async () => {
    if (!postId || !enabled) {
      setPoll(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const result = await fetchPollByPostId(postId, user?.id ?? null);
      setPoll(result);
    } catch (error) {
      console.error('So\u2018rovnomani yuklashda xatolik:', error);
      setPoll(null);
    } finally {
      setIsLoading(false);
    }
  }, [postId, enabled, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: boshqalar ovoz berganda natija darhol yangilanadi
  useEffect(() => {
    if (!poll?.id) return;

    const channel = supabase
      .channel(`poll-votes-${poll.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'poll_votes', filter: `poll_id=eq.${poll.id}` },
        () => {
          load();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [poll?.id, load]);

  const vote = useCallback(
    async (optionId: string) => {
      if (!user) {
        toast({
          title: 'Kirish kerak',
          description: 'Ovoz berish uchun tizimga kiring',
          variant: 'destructive',
        });
        return;
      }
      if (!poll) return;

      setIsVoting(true);

      // Optimistik yangilanish
      const previous = poll;
      const wasSelected = poll.myVotes.includes(optionId);
      setPoll((current) => {
        if (!current) return current;
        const myVotes = wasSelected
          ? current.myVotes.filter((id) => id !== optionId)
          : current.allow_multiple
            ? [...current.myVotes, optionId]
            : [optionId];

        return {
          ...current,
          myVotes,
          options: current.options.map((option) => {
            const selectedNow = myVotes.includes(option.id);
            const selectedBefore = current.myVotes.includes(option.id);
            if (selectedNow === selectedBefore) return option;
            return {
              ...option,
              votes_count: Math.max(0, option.votes_count + (selectedNow ? 1 : -1)),
            };
          }),
        };
      });

      try {
        await castVote(previous, optionId, user.id);
        await load();
      } catch (error: any) {
        setPoll(previous);
        toast({
          title: 'Ovoz berilmadi',
          description: error?.message ?? 'Qayta urinib ko\u2018ring',
          variant: 'destructive',
        });
      } finally {
        setIsVoting(false);
      }
    },
    [poll, user, toast, load],
  );

  return { poll, isLoading, isVoting, vote, refresh: load };
}
