import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { BarChart3, Users, Clock, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, addHours, addDays, isPast } from 'date-fns';

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

export function PollDisplay({ postId, pollData, onVote }: PollDisplayProps) {
  const { user } = useAuth();
  const [options, setOptions] = useState(pollData.options);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [totalVotes, setTotalVotes] = useState(0);

  // Calculate poll expiry
  const getExpiryDate = useCallback(() => {
    const created = new Date(pollData.createdAt);
    switch (pollData.duration) {
      case '1h': return addHours(created, 1);
      case '6h': return addHours(created, 6);
      case '1d': return addDays(created, 1);
      case '3d': return addDays(created, 3);
      case '7d': return addDays(created, 7);
      default: return addDays(created, 1);
    }
  }, [pollData.createdAt, pollData.duration]);

  const expiryDate = getExpiryDate();
  const isExpired = isPast(expiryDate);

  // Load user's vote from localStorage and calculate totals
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

    // Calculate total votes
    const total = options.reduce((sum, opt) => sum + opt.votes, 0);
    setTotalVotes(total);
  }, [postId, options]);

  // Subscribe to realtime vote updates
  useEffect(() => {
    // We'll use a simple approach - store votes in localStorage
    // In production, you'd want a separate polls table
    const storageKey = `poll_votes_${postId}`;
    const storedVotes = localStorage.getItem(storageKey);
    
    if (storedVotes) {
      try {
        const votes: PollOption[] = JSON.parse(storedVotes);
        setOptions(votes);
      } catch {
        // Use original options
      }
    }
  }, [postId]);

  const handleOptionSelect = (optionId: string) => {
    if (hasVoted || isExpired) return;

    if (pollData.allowMultiple) {
      setSelectedOptions(prev => 
        prev.includes(optionId) 
          ? prev.filter(id => id !== optionId)
          : [...prev, optionId]
      );
    } else {
      setSelectedOptions([optionId]);
    }
  };

  const handleVote = async () => {
    if (selectedOptions.length === 0 || hasVoted || isExpired) return;
    
    setIsVoting(true);

    try {
      // Update vote counts
      const updatedOptions = options.map(opt => ({
        ...opt,
        votes: selectedOptions.includes(opt.id) ? opt.votes + 1 : opt.votes
      }));

      setOptions(updatedOptions);
      setHasVoted(true);

      // Store vote in localStorage
      const storageKey = `poll_vote_${postId}`;
      const vote: StoredVote = {
        optionIds: selectedOptions,
        votedAt: new Date().toISOString()
      };
      localStorage.setItem(storageKey, JSON.stringify(vote));

      // Store updated options for realtime sync
      localStorage.setItem(`poll_votes_${postId}`, JSON.stringify(updatedOptions));

      // Update total
      const newTotal = updatedOptions.reduce((sum, opt) => sum + opt.votes, 0);
      setTotalVotes(newTotal);

      onVote?.();
    } catch (error) {
      console.error('Error voting:', error);
    } finally {
      setIsVoting(false);
    }
  };

  const getPercentage = (votes: number) => {
    if (totalVotes === 0) return 0;
    return Math.round((votes / totalVotes) * 100);
  };

  return (
    <div className="space-y-4 p-4 rounded-xl bg-secondary/30 border border-border">
      {/* Question */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{pollData.question}</h3>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {isExpired 
                ? 'Poll ended' 
                : `Ends ${formatDistanceToNow(expiryDate, { addSuffix: true })}`
              }
            </span>
          </div>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {options.map((option) => {
          const percentage = getPercentage(option.votes);
          const isSelected = selectedOptions.includes(option.id);
          const showResults = hasVoted || isExpired;

          return (
            <button
              key={option.id}
              onClick={() => handleOptionSelect(option.id)}
              disabled={hasVoted || isExpired}
              className={cn(
                "w-full text-left rounded-lg transition-all relative overflow-hidden",
                !showResults && "hover:bg-secondary/50",
                isSelected && !showResults && "ring-2 ring-primary"
              )}
            >
              {/* Background progress bar */}
              {showResults && (
                <div 
                  className={cn(
                    "absolute inset-0 transition-all duration-500",
                    isSelected ? "bg-primary/20" : "bg-muted/50"
                  )}
                  style={{ width: `${percentage}%` }}
                />
              )}

              <div className={cn(
                "relative flex items-center gap-3 p-3",
                !showResults && "border border-border rounded-lg"
              )}>
                {/* Checkbox/Radio indicator */}
                {!showResults && (
                  pollData.allowMultiple ? (
                    <Checkbox 
                      checked={isSelected}
                      className="pointer-events-none"
                    />
                  ) : (
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                      isSelected ? "border-primary" : "border-muted-foreground"
                    )}>
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                  )
                )}

                {/* Option text */}
                <span className={cn(
                  "flex-1 font-medium",
                  showResults && isSelected && "text-primary"
                )}>
                  {option.text}
                </span>

                {/* Vote indicator for your selection */}
                {showResults && isSelected && (
                  <Check className="h-4 w-4 text-primary" />
                )}

                {/* Percentage */}
                {showResults && (
                  <span className={cn(
                    "text-sm font-semibold min-w-[3rem] text-right",
                    isSelected ? "text-primary" : "text-muted-foreground"
                  )}>
                    {percentage}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Vote button */}
      {!hasVoted && !isExpired && (
        <Button
          onClick={handleVote}
          disabled={selectedOptions.length === 0 || isVoting}
          className="w-full"
        >
          {isVoting ? 'Voting...' : 'Vote'}
        </Button>
      )}

      {/* Info */}
      {pollData.isAnonymous && (
        <p className="text-xs text-muted-foreground text-center">
          Voting is anonymous
        </p>
      )}
    </div>
  );
}

// Helper function to parse poll from post content
export function parsePollFromContent(content: string): { pollData: PollData | null; cleanContent: string } {
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