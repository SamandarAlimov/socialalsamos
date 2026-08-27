import { Fragment, useMemo } from 'react';
import { splitInlineEmoji, getEmojiOnlyInfo } from '@/lib/emojiOnly';
import { TelegramEmoji } from '@/components/emoji/TelegramEmoji';
import { cn } from '@/lib/utils';

interface EmojiTextProps {
  /** Ko'rsatiladigan matn */
  text: string;
  /** Oddiy matn ichidagi emoji o'lchami */
  size?: number;
  /** Animatsiyani yoqish/o'chirish */
  animated?: boolean;
  className?: string;
}

/**
 * Platforma bo'ylab ishlatiladigan emoji renderer.
 *
 * Matn ichidagi barcha emojilar Telegramdek animatsion ko'rinishda
 * chiziladi (`.tgs` bo'lsa haqiqiy Telegram animatsiyasi). Faqat emojidan
 * iborat qisqa matnlar Telegramdagidek kattalashadi: 1 ta → eng katta,
 * 3 tagacha → kichrayib boradi.
 */
export function EmojiText({ text, size = 18, animated = true, className }: EmojiTextProps) {
  const emojiOnly = useMemo(() => getEmojiOnlyInfo(text), [text]);
  const parts = useMemo(() => splitInlineEmoji(text), [text]);

  // Faqat emojidan iborat xabar — katta ko'rinish
  if (emojiOnly) {
    return (
      <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
        {emojiOnly.emojis.map((emoji, index) => (
          <TelegramEmoji
            key={`${emoji}-${index}`}
            emoji={emoji}
            size={emojiOnly.size}
            animated={animated}
          />
        ))}
      </span>
    );
  }

  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.type === 'emoji' ? (
          <TelegramEmoji
            key={`e-${index}`}
            emoji={part.value}
            size={size}
            animated={animated}
            inline
          />
        ) : (
          <Fragment key={`t-${index}`}>{part.value}</Fragment>
        )
      )}
    </span>
  );
}

export default EmojiText;
