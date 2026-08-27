import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  userNames: string[];
  className?: string;
}

export function TypingIndicator({ userNames, className }: TypingIndicatorProps) {
  if (userNames.length === 0) return null;

  // Telegramdek qisqa va tabiiy o'zbekcha matn
  const displayText =
    userNames.length === 1
      ? `${userNames[0]} yozmoqda`
      : userNames.length === 2
        ? `${userNames[0]} va ${userNames[1]} yozmoqda`
        : `${userNames[0]} va yana ${userNames.length - 1} kishi yozmoqda`;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        className="flex items-center gap-2.5 rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2.5"
      >
        {/* Telegramdek uchta silliq nuqta */}
        <span className="flex items-end gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70"
              animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }}
              transition={{
                duration: 0.9,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.15,
              }}
            />
          ))}
        </span>

        <span className="truncate text-xs text-muted-foreground">{displayText}</span>
      </motion.div>
    </div>
  );
}
