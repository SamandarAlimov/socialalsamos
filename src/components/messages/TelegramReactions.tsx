import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatedEmoji } from '@/components/emoji/AnimatedEmoji';
import { EmojiPicker } from '@/components/EmojiPicker';

export interface ReactionGroup {
  emoji: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

interface TelegramReactionsProps {
  reactions: ReactionGroup[];
  isMine: boolean;
  onToggle: (emoji: string) => void;
  onAdd: (emoji: string) => void;
  className?: string;
}

/**
 * Telegram-style reaction chips: compact pills, animated emoji, tabular count,
 * highlighted (filled) state when the current user reacted.
 */
export function TelegramReactions({
  reactions,
  isMine,
  onToggle,
  onAdd,
  className,
}: TelegramReactionsProps) {
  const total = reactions.reduce((sum, r) => sum + r.count, 0);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1',
        total > 0 && 'mt-1',
        isMine ? 'justify-end' : 'justify-start',
        className
      )}
    >
      <AnimatePresence initial={false}>
        {reactions.map((reaction) => (
          <motion.button
            key={reaction.emoji}
            layout
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 26 }}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(reaction.emoji);
            }}
            title={`${reaction.count} ta reaksiya`}
            className={cn(
              'inline-flex items-center gap-1 h-[26px] pl-1 pr-2 rounded-full',
              'text-xs font-medium transition-colors active:scale-95',
              reaction.hasReacted
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground hover:bg-muted/70'
            )}
          >
            <AnimatedEmoji emoji={reaction.emoji} size={18} />
            <span className="tabular-nums leading-none">{reaction.count}</span>
          </motion.button>
        ))}
      </AnimatePresence>

      <EmojiPicker
        onSelect={onAdd}
        trigger={
          <button
            onClick={(e) => e.stopPropagation()}
            title="Reaksiya qo'shish"
            className={cn(
              'inline-flex items-center justify-center h-[26px] w-[26px] rounded-full',
              'bg-muted/60 text-muted-foreground transition-opacity active:scale-95',
              'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              total > 0 && 'md:opacity-0'
            )}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        }
      />
    </div>
  );
}
