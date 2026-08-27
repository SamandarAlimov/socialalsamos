import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { animatedEmojiCandidates, staticEmojiCandidates } from '@/lib/emojiAssets';

interface AnimatedEmojiProps {
  emoji: string;
  /** Rendered pixel size. */
  size?: number;
  className?: string;
  /** Only animate on hover (grid performance). */
  playOnHover?: boolean;
  /**
   * When false, a static Telegram-style (Apple set) glyph is used.
   * Defaults to true.
   */
  animated?: boolean;
  /** Align with surrounding text (used inside message bubbles). */
  inline?: boolean;
  title?: string;
}

/**
 * Renders a Telegram-style emoji.
 *
 * Assets are resolved through `src/lib/emojiAssets.ts`:
 * local Telegram pack -> Noto animated -> Apple static -> native glyph.
 */
export function AnimatedEmoji({
  emoji,
  size = 24,
  className,
  playOnHover = false,
  animated = true,
  inline = false,
  title,
}: AnimatedEmojiProps) {
  const candidates = useMemo(
    () => (animated ? animatedEmojiCandidates(emoji) : staticEmojiCandidates(emoji)),
    [emoji, animated]
  );
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [emoji, animated]);

  if (failed) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center leading-none select-none',
          inline && 'align-[-0.15em]',
          className
        )}
        style={{ fontSize: size * 0.92, width: size, height: size }}
        title={title}
      >
        {emoji}
      </span>
    );
  }

  return (
    <img
      src={candidates[index]}
      alt={emoji}
      title={title}
      loading="lazy"
      draggable={false}
      width={size}
      height={size}
      onError={() => {
        if (index < candidates.length - 1) setIndex(index + 1);
        else setFailed(true);
      }}
      className={cn(
        'inline-block object-contain select-none',
        inline && 'align-[-0.15em]',
        playOnHover && 'transition-transform duration-150 hover:scale-110',
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}
