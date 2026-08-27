import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { AnimatedEmoji } from '@/components/emoji/AnimatedEmoji';
import { splitInlineEmoji, getEmojiOnlyInfo } from '@/lib/emojiOnly';

interface EmojiTextProps {
  /** Ko'rsatiladigan oddiy matn (emojilar rasmga aylantiriladi). */
  text: string | null | undefined;
  className?: string;
  /** Matn ichidagi emoji o'lchami (px). */
  size?: number;
  /** Animatsiyali (Telegram/Noto) emojilar. */
  animated?: boolean;
  /**
   * Matn faqat emojidan iborat bo'lsa, Telegramdek kattalashtirish
   * (1 ta -> 64, 2 ta -> 48, 3 ta -> 40).
   */
  enlargeEmojiOnly?: boolean;
}

/**
 * Platformadagi barcha matnlar uchun umumiy emoji renderi.
 *
 * Postlar, izohlar, bio, kanal/guruh nomlari va boshqa joylarda ishlatiladi.
 * Aktivlar `src/lib/emojiAssets.ts` orqali: lokal Telegram to'plami ->
 * Noto animated -> Apple static -> tizim emojisi.
 */
export function EmojiText({
  text,
  className,
  size = 19,
  animated = true,
  enlargeEmojiOnly = false,
}: EmojiTextProps) {
  const value = text ?? '';

  const emojiOnly = useMemo(
    () => (enlargeEmojiOnly ? getEmojiOnlyInfo(value) : null),
    [value, enlargeEmojiOnly]
  );

  const parts = useMemo(() => splitInlineEmoji(value), [value]);

  if (!value) return null;

  // Faqat emoji: kattalashtirilgan ko'rinish
  if (emojiOnly) {
    const big =
      emojiOnly.emojis.length === 1 ? 64 : emojiOnly.emojis.length === 2 ? 48 : 40;
    return (
      <span className={cn('inline-flex items-end gap-0.5', className)}>
        {emojiOnly.emojis.map((emoji, index) => (
          <AnimatedEmoji
            key={`${emoji}-${index}`}
            emoji={emoji}
            size={big}
            animated={animated}
            title={emoji}
          />
        ))}
      </span>
    );
  }

  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.type === 'emoji' ? (
          <AnimatedEmoji
            key={`e-${index}`}
            emoji={part.value}
            size={size}
            animated={animated}
            inline
            title={part.value}
          />
        ) : (
          <span key={`t-${index}`}>{part.value}</span>
        )
      )}
    </span>
  );
}
