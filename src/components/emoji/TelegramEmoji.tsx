import { useEffect, useMemo, useState } from 'react';
import { AnimatedEmoji } from '@/components/emoji/AnimatedEmoji';
import { telegramEmojiUrlCandidates } from '@/lib/telegramEmojiResolve';
import { cn } from '@/lib/utils';

interface TelegramEmojiProps {
  emoji: string;
  size?: number;
  className?: string;
  /** Animatsiyani o'chirib, statik ko'rinish */
  animated?: boolean;
  /** Faqat sichqoncha ustiga kelganda kattalashtirish */
  playOnHover?: boolean;
  /** Matn ichida (inline) ishlatilishi */
  inline?: boolean;
  title?: string;
}

/**
 * Telegram uslubidagi ANIMATSION emoji.
 *
 * Tartib (`telegramEmojiUrlCandidates`):
 *  1. Telegramning o'z animatsion `.webp` to'plami (jsDelivr)
 *  2. Noto Animated Emoji `512.webp` - kod-nuqta bo'yicha, deyarli barcha emoji
 *  3. Noto Animated Emoji `512.gif`
 *  4. `AnimatedEmoji` (Apple statik / tizim glifi) - hech qachon buzilmaydi
 *
 * Lokal fayl yoki `lottie-web` talab qilinmaydi: shuning uchun
 * hech qanday qo'shimcha asset yuklamasdan darhol ishlaydi.
 */
export function TelegramEmoji({
  emoji,
  size = 24,
  className,
  animated = true,
  playOnHover = false,
  inline = false,
  title,
}: TelegramEmojiProps) {
  const candidates = useMemo(
    () => (animated ? telegramEmojiUrlCandidates(emoji) : []),
    [emoji, animated]
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [emoji, animated]);

  // Animatsiya o'chirilgan yoki barcha manbalar ishlamadi -> statik ko'rinish
  if (!animated || index >= candidates.length) {
    return (
      <AnimatedEmoji
        emoji={emoji}
        size={size}
        className={className}
        animated={false}
        playOnHover={playOnHover}
        inline={inline}
        title={title}
      />
    );
  }

  return (
    <img
      src={candidates[index]}
      alt={emoji}
      title={title || emoji}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setIndex((current) => current + 1)}
      className={cn(
        'inline-block object-contain select-none no-drag',
        inline ? 'align-[-0.15em]' : 'align-middle',
        playOnHover && 'transition-transform duration-150 hover:scale-110',
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}

export default TelegramEmoji;
