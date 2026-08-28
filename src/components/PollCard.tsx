import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Check, CircleSlash, Loader2, Lock, Trophy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePoll } from '@/hooks/usePolls';
import { canSeeResults, isPollClosed, optionPercent } from '@/lib/polls';

interface PollCardProps {
  postId: string;
  className?: string;
}

function remainingLabel(closesAt: string): string {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return 'Yakunlandi';

  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} daqiqa qoldi`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} soat qoldi`;

  const days = Math.floor(hours / 24);
  return `${days} kun qoldi`;
}

/**
 * So'rovnoma kartochkasi — real ovozlar bilan.
 *
 * Ilgari so'rovnoma post matnida [POLL]{json}[/POLL] ko'rinishida saqlanardi
 * va ovozlar hech qayerga yozilmasdi (har doim 0% edi). Endi `polls`,
 * `poll_options`, `poll_votes` jadvallari ishlatiladi.
 */
export function PollCard({ postId, className }: PollCardProps) {
  const { poll, isLoading, isVoting, vote } = usePoll(postId);
  const [tick, setTick] = useState(0);

  // Qolgan vaqtni yangilash
  useEffect(() => {
    if (!poll?.closes_at) return;
    const timer = setInterval(() => setTick((value) => value + 1), 30000);
    return () => clearInterval(timer);
  }, [poll?.closes_at]);

  const closed = useMemo(() => (poll ? isPollClosed(poll) : false), [poll, tick]);
  const showResults = useMemo(() => (poll ? canSeeResults(poll) : false), [poll, tick]);

  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-2xl border border-border/60 py-8',
          className,
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!poll) return null;

  const leaderVotes = Math.max(...poll.options.map((option) => option.votes_count), 0);

  return (
    <div
      className={cn('rounded-2xl border border-border/60 bg-muted/20 p-3.5', className)}
      onClick={(event) => event.stopPropagation()}
    >
      {/* Savol */}
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {poll.quiz_mode ? <Trophy className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-snug">{poll.question}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>
              {poll.quiz_mode
                ? 'Viktorina'
                : poll.allow_multiple
                  ? "Ko'p tanlovli"
                  : 'Bitta javob'}
            </span>
            {poll.is_anonymous && (
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3 w-3" /> Anonim
              </span>
            )}
            <span>
              {poll.allow_multiple
                ? `${poll.total_voters} ishtirokchi`
                : `${poll.total_votes} ovoz`}
            </span>
            {poll.closes_at && <span>{remainingLabel(poll.closes_at)}</span>}
          </p>
        </div>
      </div>

      {/* Variantlar */}
      <div className="mt-3 space-y-2">
        {poll.options.map((option) => {
          const percent = optionPercent(poll, option);
          const selected = poll.myVotes.includes(option.id);
          const isCorrect = poll.quiz_mode && poll.correct_option_id === option.id;
          const isWrongPick = poll.quiz_mode && selected && !isCorrect;
          const revealQuiz = poll.quiz_mode && (poll.myVotes.length > 0 || closed);

          return (
            <button
              key={option.id}
              type="button"
              disabled={isVoting || closed}
              onClick={() => vote(option.id)}
              className={cn(
                'relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left transition',
                'disabled:cursor-not-allowed',
                selected ? 'border-primary' : 'border-border/60',
                !closed && !isVoting && 'hover:border-primary/60',
                revealQuiz && isCorrect && 'border-green-500',
                revealQuiz && isWrongPick && 'border-destructive',
              )}
            >
              {/* Natija to'ldirmasi */}
              {showResults && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-y-0 left-0 transition-all duration-500',
                    revealQuiz && isCorrect
                      ? 'bg-green-500/15'
                      : revealQuiz && isWrongPick
                        ? 'bg-destructive/15'
                        : option.votes_count === leaderVotes && leaderVotes > 0
                          ? 'bg-primary/15'
                          : 'bg-muted/70',
                  )}
                  style={{ width: `${percent}%` }}
                />
              )}

              <span className="relative flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/40',
                  )}
                >
                  {selected &&
                    (revealQuiz && isWrongPick ? (
                      <X className="h-3 w-3" />
                    ) : (
                      <Check className="h-3 w-3" />
                    ))}
                </span>

                {option.emoji && <span className="shrink-0 text-base">{option.emoji}</span>}

                <span className="min-w-0 flex-1 break-words text-sm">{option.label}</span>

                {showResults && (
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                    {percent}%
                  </span>
                )}
              </span>

              {option.image_url && (
                <img
                  src={option.image_url}
                  alt={option.label}
                  loading="lazy"
                  className="relative mt-2 h-24 w-full rounded-lg object-cover"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Izoh / holat */}
      {poll.quiz_mode && poll.explanation && poll.myVotes.length > 0 && (
        <p className="mt-2.5 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
          {poll.explanation}
        </p>
      )}

      {closed && (
        <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CircleSlash className="h-3.5 w-3.5" /> So\u2018rovnoma yakunlangan
        </p>
      )}

      {!closed && !showResults && (
        <p className="mt-2.5 text-xs text-muted-foreground">
          Natijalarni ko\u2018rish uchun ovoz bering
        </p>
      )}
    </div>
  );
}
