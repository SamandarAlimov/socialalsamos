import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { CanonicalPollPayload } from '@/lib/messageStructuredPayload';

interface MessagePollProps {
  messageId: string;
  poll: CanonicalPollPayload;
  isMine: boolean;
}

interface VoteRow {
  option_id: string;
  user_id: string;
}

export function MessagePoll({ messageId, poll, isMine }: MessagePollProps) {
  const { user } = useAuth();
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [busyOption, setBusyOption] = useState<string | null>(null);

  const loadVotes = useCallback(async () => {
    const { data, error } = await supabase
      .from('message_poll_votes')
      .select('option_id,user_id')
      .eq('message_id', messageId);

    if (!error) setVotes((data || []) as VoteRow[]);
  }, [messageId]);

  useEffect(() => {
    void loadVotes();
    const channel = supabase
      .channel(`message-poll:${messageId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_poll_votes',
          filter: `message_id=eq.${messageId}`,
        },
        () => void loadVotes()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadVotes, messageId]);

  const mySelections = useMemo(
    () => new Set(votes.filter((vote) => vote.user_id === user?.id).map((vote) => vote.option_id)),
    [user?.id, votes]
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const vote of votes) map.set(vote.option_id, (map.get(vote.option_id) || 0) + 1);
    return map;
  }, [votes]);

  const totalVotes = votes.length;
  const hasVoted = mySelections.size > 0;

  const vote = async (optionId: string) => {
    if (!user || busyOption) return;
    setBusyOption(optionId);
    try {
      if (poll.multiple && mySelections.has(optionId)) {
        await supabase
          .from('message_poll_votes')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', user.id)
          .eq('option_id', optionId);
      } else {
        if (!poll.multiple) {
          await supabase
            .from('message_poll_votes')
            .delete()
            .eq('message_id', messageId)
            .eq('user_id', user.id);
        }
        await supabase.from('message_poll_votes').upsert(
          {
            message_id: messageId,
            user_id: user.id,
            option_id: optionId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'message_id,user_id,option_id' }
        );
      }
      await loadVotes();
    } finally {
      setBusyOption(null);
    }
  };

  return (
    <div className="w-[min(320px,72vw)] min-w-[220px] space-y-2 py-0.5">
      <div className="flex items-start gap-2">
        <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold leading-snug">{poll.question}</p>
          <p className={cn('text-[10px]', isMine ? 'text-primary-foreground/65' : 'text-muted-foreground')}>
            {poll.multiple ? 'Bir nechta javob tanlash mumkin' : "Bitta javobni tanlang"}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {poll.options.map((option) => {
          const selected = mySelections.has(option.id);
          const count = counts.get(option.id) || 0;
          const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const showResult = hasVoted || totalVotes > 0;

          return (
            <button
              key={option.id}
              type="button"
              disabled={!user || busyOption !== null}
              onClick={() => void vote(option.id)}
              className={cn(
                'relative block w-full overflow-hidden rounded-xl border px-3 py-2 text-left tg-transition',
                isMine
                  ? 'border-primary-foreground/25 hover:bg-primary-foreground/10'
                  : 'border-border hover:bg-muted/60',
                selected && (isMine ? 'border-primary-foreground/70' : 'border-primary')
              )}
            >
              {showResult && (
                <span
                  className={cn(
                    'pointer-events-none absolute inset-y-0 left-0 opacity-15 transition-[width] duration-300',
                    isMine ? 'bg-primary-foreground' : 'bg-primary'
                  )}
                  style={{ width: `${percentage}%` }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                    selected
                      ? isMine
                        ? 'border-primary-foreground bg-primary-foreground text-primary'
                        : 'border-primary bg-primary text-primary-foreground'
                      : isMine
                        ? 'border-primary-foreground/50'
                        : 'border-muted-foreground/50'
                  )}
                >
                  {selected && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1 text-[13px] font-medium">{option.text}</span>
                {showResult && (
                  <span className="text-[11px] tabular-nums opacity-70">{percentage}%</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className={cn('text-[10px]', isMine ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
        {totalVotes} ovoz
        {poll.anonymous ? ' · anonim' : ''}
      </div>
    </div>
  );
}
