import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TelegramEmoji } from '@/components/emoji/TelegramEmoji';

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
  /** Eskirgan: reaksiya qo'shish uchun xabarni bosib turish menyusidan foydalaniladi */
  onAdd?: (emoji: string) => void;
  className?: string;
}

/**
 * Telegram uslubidagi reaksiya chiplari.
 * Reaksiya qo'shish faqat xabarni bosib turish (long-press) menyusi orqali -
 * xabar tagida alohida "+" tugmasi yo'q (Telegramda ham yo'q).
 */
export function TelegramReactions({
  reactions,
  isMine,
  onToggle,
  className,
}: TelegramReactionsProps) {
  if (!reactions.length) return null;

  return (
    <div
      className={cn(
        'mt-1 flex flex-wrap items-center gap-1',
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
            title={reaction.count + ' ta reaksiya'}
            className={cn(
              'inline-flex items-center gap-1 h-[26px] pl-1 pr-2 rounded-full',
              'text-xs font-medium transition-colors active:scale-95',
              reaction.hasReacted
                ? 'bg-foreground text-background'
                : 'bg-muted text-foreground hover:bg-muted/70'
            )}
          >
            <TelegramEmoji emoji={reaction.emoji} size={18} />
            <span className="tabular-nums leading-none">{reaction.count}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
