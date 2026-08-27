import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { EmojiPicker } from './EmojiPicker';
import { TelegramEmoji } from '@/components/emoji/TelegramEmoji';
import { SmilePlus } from 'lucide-react';

interface ReactionGroup {
  emoji: string;
  count: number;
  hasReacted: boolean;
}

interface MessageReactionsProps {
  reactions: ReactionGroup[];
  onToggle: (emoji: string) => void;
  onAdd: (emoji: string) => void;
  isMine?: boolean;
}

/**
 * Telegram uslubidagi reaksiya chiplari.
 * Yangi xabar bubble'lari `messages/TelegramReactions` dan foydalanadi;
 * bu komponent qolgan eski joylar uchun bir xil ko'rinishni ta'minlaydi.
 */
export function MessageReactions({ reactions, onToggle, onAdd, isMine }: MessageReactionsProps) {
  const addButton = (
    <EmojiPicker
      onSelect={onAdd}
      trigger={
        <button
          type="button"
          aria-label="Reaksiya qo'shish"
          title="Reaksiya qo'shish"
          className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-muted/70 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
      }
    />
  );

  if (reactions.length === 0) {
    return (
      <div className={cn('mt-1 flex', isMine ? 'justify-end' : 'justify-start')}>{addButton}</div>
    );
  }

  return (
    <div
      className={cn(
        'mt-1 flex flex-wrap items-center gap-1',
        isMine ? 'justify-end' : 'justify-start'
      )}
    >
      {reactions.map((reaction) => (
        <motion.button
          key={reaction.emoji}
          type="button"
          onClick={() => onToggle(reaction.emoji)}
          whileTap={{ scale: 0.92 }}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          aria-pressed={reaction.hasReacted}
          className={cn(
            'inline-flex h-[26px] items-center gap-1 rounded-full px-2 text-xs transition-colors',
            reaction.hasReacted
              ? 'bg-primary/15 text-primary ring-1 ring-inset ring-primary/30'
              : 'bg-muted text-foreground/80 hover:bg-muted/70'
          )}
        >
          <TelegramEmoji emoji={reaction.emoji} size={16} />
          <span className="font-medium tabular-nums">{reaction.count}</span>
        </motion.button>
      ))}
      {addButton}
    </div>
  );
}
