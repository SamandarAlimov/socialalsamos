import { useEffect, useRef, useState } from 'react';
import { AnimatedEmoji } from '@/components/emoji/AnimatedEmoji';
import { loadTgsAnimation, telegramEmojiCandidates } from '@/lib/tgs';
import { cn } from '@/lib/utils';

interface TelegramEmojiProps {
  emoji: string;
  size?: number;
  className?: string;
  /** Animatsiyani o'chirib, statik ko'rinish */
  animated?: boolean;
  /** Faqat sichqoncha ustiga kelganda o'ynatish */
  playOnHover?: boolean;
  /** Matn ichida (inline) ishlatilishi */
  inline?: boolean;
  title?: string;
}

/**
 * Telegramning haqiqiy animatsion emojisi (`.tgs` = gzip Lottie).
 *
 * `public/emoji/tgs/<codepoint>.tgs` faylini topsa, Lottie orqali o'ynatadi.
 * Topilmasa yoki lottie-web mavjud bo'lmasa — avvalgi `AnimatedEmoji`
 * (Noto animated / Apple static / tizim emojisi) ga qaytadi.
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
  const containerRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<any>(null);
  const [hasTgs, setHasTgs] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      if (!animated) {
        setHasTgs(false);
        return;
      }

      // 1) Telegram to'plamidan animatsiyani izlaymiz
      let animationData: unknown | null = null;
      for (const url of telegramEmojiCandidates(emoji)) {
        animationData = await loadTgsAnimation(url);
        if (animationData) break;
      }
      if (cancelled) return;
      if (!animationData) {
        setHasTgs(false);
        return;
      }

      // 2) lottie-web ni dinamik yuklaymiz (o'rnatilmagan bo'lsa fallback)
      try {
        const lottie: any = await import(/* @vite-ignore */ 'lottie-web');
        if (cancelled || !containerRef.current) return;

        animationRef.current = (lottie.default || lottie).loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop: !playOnHover,
          autoplay: !playOnHover,
          animationData,
        });
        setHasTgs(true);
      } catch {
        if (!cancelled) setHasTgs(false);
      }
    };

    void setup();

    return () => {
      cancelled = true;
      try {
        animationRef.current?.destroy();
      } catch {
        // e'tiborsiz
      }
      animationRef.current = null;
    };
  }, [emoji, animated, playOnHover]);

  const handleEnter = () => {
    if (playOnHover && animationRef.current) {
      animationRef.current.goToAndPlay(0, true);
    }
  };

  // TGS topilmadi yoki hali tekshirilmoqda — eski usulga qaytamiz
  if (hasTgs === false) {
    return (
      <AnimatedEmoji
        emoji={emoji}
        size={size}
        className={className}
        animated={animated}
        playOnHover={playOnHover}
        inline={inline}
        title={title}
      />
    );
  }

  return (
    <span
      className={cn(
        inline ? 'inline-block align-[-0.15em]' : 'inline-flex items-center justify-center',
        className
      )}
      style={{ width: size, height: size }}
      title={title || emoji}
      onMouseEnter={handleEnter}
    >
      <span ref={containerRef} style={{ width: size, height: size }} />
      {hasTgs === null && (
        <span className="sr-only" aria-hidden={false}>
          {emoji}
        </span>
      )}
    </span>
  );
}

export default TelegramEmoji;
