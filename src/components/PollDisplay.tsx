import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Users, Clock, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { addHours, addDays, isPast } from 'date-fns';

interface PollOption {
  id: string;
  text: string;
  votes: number;
}

interface PollData {
  type: 'poll';
  question: string;
  options: PollOption[];
  duration: string;
  allowMultiple: boolean;
  isAnonymous: boolean;
  createdAt: string;
}

interface PollDisplayProps {
  postId: string;
  pollData: PollData;
  onVote?: () => void;
}

interface StoredVote {
  optionIds: string[];
  votedAt: string;
}

/** Telegram uslubida qolgan vaqtni qisqa formatda ko'rsatish */
function formatRemaining(expiry: Date): string {
  const ms = expiry.getTime() - Date.now();
  if (ms <= 0) return "So'rov tugadi";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} daqiqa qoldi`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} soat qoldi`;
  const days = Math.floor(hours / 24);
  return `${days} kun qoldi`;
}

export function PollDisplay({ postId, pollData, onVote }: PollDisplayProps) {
  const [options, setOptions] = useState(pollData.options);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [totalVotes, setTotalVotes] = useState(0);

  const getExpiryDate = useCallback(() => {
    const created = new Date(pollData.createdAt);
    switch (pollData.duration) {
      case '1h':
        return addHours(created, 1);
      case '6h':
        return addHours(created, 6);
      case '1d':
        return addDays(created, 1);
      case '3d':
        return addDays(created, 3);
      case '7d':
        return addDays(created, 7);
      default:
        return addDays(created, 1);
    }
  }, [pollData.createdAt, pollData.duration]);

  const expiryDate = getExpiryDate();
  const isExpired = isPast(expiryDate);

  useEffect(() => {
    const storageKey = `poll_vote_${postId}`;
    const storedVote = localStorage.getItem(storageKey);

    if (storedVote) {
      try {
        const vote: StoredVote = JSON.parse(storedVote);
        setHasVoted(true);
        setSelectedOptions(vote.optionIds);
      } catch {
        localStorage.removeItem(storageKey);
      }
    }

    const total = options.reduce((sum, opt) => sum + opt.votes, 0);
    setTotalVotes(total);
  }, [postId, options]);

  useEffect(() => {
    const storageKey = `poll_votes_${postId}`;
    const storedVotes = localStorage.getItem(storageKey);

    if (storedVotes) {
      try {
        const votes: PollOption[] = JSON.parse(storedVotes);
        setOptions(votes);
      } catch {
        // asl variantlar ishlatiladi
      }
    }
  }, [postId]);

  const submitVote = async (ids: string[]) => {
    if (ids.length === 0 || hasVoted || isExpired) return;

    setIsVoting(true);
    try {
      const updatedOptions = options.map((opt) => ({
        ...opt,
        votes: ids.includes(opt.id) ? opt.votes + 1 : opt.votes,
      }));

      setOptions(updatedOptions);
      setHasVoted(true);

      const vote: StoredVote = { optionIds: ids, votedAt: new Date().toISOString() };
      localStorage.setItem(`poll_vote_${postId}`, JSON.stringify(vote));
      localStorage.setItem(`poll_votes_${postId}`, JSON.stringify(updatedOptions));

      setTotalVotes(updatedOptions.reduce((sum, opt) => sum + opt.votes, 0));
      onVote?.();
    } catch (error) {
      console.error('Ovoz berishda xatolik:', error);
    } finally {
      setIsVoting(false);
    }
  };

  const handleOptionSelect = (optionId: string) => {
    if (hasVoted || isExpired) return;

    if (pollData.allowMultiple) {
      setSelectedOptions((prev) =>
        prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
      );
    } else {
      // Telegramda bitta javobli so'rovda tanlash bilan darhol ovoz beriladi
      setSelectedOptions([optionId]);
      void submitVote([optionId]);
    }
  };

  const getPercentage = (votes: number) => {
    if (totalVotes === 0) return 0;
    return Math.round((votes / totalVotes) * 100);
  };

  const showResults = hasVoted || isExpired;
  const subtitle = pollData.isAnonymous
    ? pollData.allowMultiple
      ? "Anonim so'rov · bir nechta javob"
      : "Anonim so'rov"
    : pollData.allowMultiple
      ? "Ochiq so'rov · bir nechta javob"
      : "Ochiq so'rov";

  return (
    <div className="w-full max-w-full space-y-3 overflow-hidden rounded-2xl border border-border/60 bg-card p-3">
      {/* Savol */}
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <BarChart3 className="h-4 w-4 text-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="text-[15px] font-semibold leading-snug text-foreground"
            style={{ overflowWrap: 'anywhere' }}
          >
            {pollData.question}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {/* Variantlar */}
      <div className="space-y-1.5">
        {options.map((option) => {
          const percentage = getPercentage(option.votes);
          const isSelected = selectedOptions.includes(option.id);

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleOptionSelect(option.id)}
              disabled={showResults || isVoting}
              className={cn(
                'relative block w-full overflow-hidden rounded-xl px-3 py-2.5 text-left transition-colors',
                !showResults && 'bg-muted/40 hover:bg-muted/70 active:bg-muted',
                !showResults && isSelected && 'bg-muted',
                showResults && 'bg-transparent px-0 py-1.5'
              )}
            >
              {showResults ? (
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'w-9 shrink-0 text-right text-[13px] font-semibold tabular-nums',
                      isSelected ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {percentage}%
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="min-w-0 flex-1 truncate text-[14px] text-foreground"
                        style={{ overflowWrap: 'anywhere' }}
                      >
                        {option.text}
                      </span>
                      {isSelected && (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-foreground/90">
                          <Check className="h-2.5 w-2.5 text-background" />
                        </span>
                      )}
                    </div>
                    {/* Telegramdek ingichka progress chizig'i */}
                    <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-muted">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                        className={cn(
                          'h-full rounded-full',
                          isSelected ? 'bg-foreground/80' : 'bg-muted-foreground/40'
                        )}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'flex h-[18px] w-[18px] shrink-0 items-center justify-center border-2 transition-colors',
                      pollData.allowMultiple ? 'rounded-[5px]' : 'rounded-full',
                      isSelected ? 'border-foreground bg-foreground' : 'border-muted-foreground/50'
                    )}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5 text-background" />}
                  </span>
                  <span
                    className="min-w-0 flex-1 text-[14px] text-foreground"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {option.text}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Bir nechta javobli so'rovda tasdiqlash tugmasi */}
      {pollData.allowMultiple && !showResults && (
        <button
          type="button"
          onClick={() => submitVote(selectedOptions)}
          disabled={selectedOptions.length === 0 || isVoting}
          className={cn(
            'h-9 w-full rounded-xl text-[13px] font-medium transition-colors',
            selectedOptions.length === 0 || isVoting
              ? 'cursor-not-allowed bg-muted/50 text-muted-foreground'
              : 'bg-muted text-foreground hover:bg-muted/70'
          )}
        >
          {isVoting ? 'Yuborilmoqda...' : 'Ovoz berish'}
        </button>
      )}

      {/* Pastki qism */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {totalVotes === 0 ? 'Hali ovoz berilmagan' : `${totalVotes} ovoz`}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatRemaining(expiryDate)}
        </span>
      </div>
    </div>
  );
}

// Post kontentidan so'rovni ajratish
export function parsePollFromContent(content: string): {
  pollData: PollData | null;
  cleanContent: string;
} {
  const pollMatch = content.match(/\[POLL\](.*?)\[\/POLL\]/s);

  if (!pollMatch) {
    return { pollData: null, cleanContent: content };
  }

  try {
    const pollData = JSON.parse(pollMatch[1]) as PollData;
    const cleanContent = content.replace(/\[POLL\].*?\[\/POLL\]\n?/s, '').trim();
    return { pollData, cleanContent };
  } catch {
    return { pollData: null, cleanContent: content };
  }
}
