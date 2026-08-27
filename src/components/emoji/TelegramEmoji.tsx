import { useEffect, useRef, useState } from 'react';
import { AnimatedEmoji } from '@/components/emoji/AnimatedEmoji';
import { loadTgsAnimation, telegramEmojiCandidates } from '@/lib/tgs';
import { resolveTelegramEmojiUrl } from '@/lib/telegramEmojiResolve';
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

type EmojiMode = 'pending' | 'webp' | 'tgs' | 'fallback';

/**
 * Telegramning HAQIQIY animatsion emojisi.
 *
 * Tartib:
 *  1. `public/emoji/tgs/<codepoint>.tgs` (Lottie vektor) — mavjud bo'lsa eng sifatlisi
 *  2. Telegram animatsion `.webp` to'plami (jsDelivr CDN) — hech narsa yuklamasdan ishlaydi
 *  3. `AnimatedEmoji` (Noto animated / statik / tizim emojisi) — hech qachon buzilmaydi
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
  const webpUrl = resolveTelegramEmojiUrl(emoji);
  const [mode, setMode] = useState<EmojiMode>(() =>
    animated && webpUrl ? 'webp' : 'pending'
  );

  // Emoji o'zgarsa boshlang'ich holatga qaytamiz
  useEffect(() => {
    setMode(animated && webpUrl ? 'webp' : 'pending');
  }, [emoji, animated, webpUrl]);

  // Lokal .tgs fayl bo'lsa — unga "yuksaltiramiz"
  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      if (!animated) {
        setMode('fallback');
        return;
      }

      let animationData: unknown | null = null;
      for (const url of telegramEmojiCandidates(emoji)) {
        animationData = await loadTgsAnimation(url);
        if (animationData) break;
      }

      if (cancelled) return;

      if (!animationData) {
        // .tgs yo'q — webp bo'lsa shuni qoldiramiz, aks holda fallback
        setMode(webpUrl ? 'webp' : 'fallback');
        return;
      }

      try {
        const lottie: any = await import(/* @vite-ignore */ 'lottie-web');
        if (cancelled) return;
        setMode('tgs');
        // konteyner keyingi renderdan so'ng paydo bo'ladi
        requestAnimationFrame(() => {
          if (cancelled || !containerRef.current) return;
          animationRef.current = (lottie.default || lottie).loadAnimation({
            container: containerRef.current,
            renderer: 'svg',
            loop: !playOnHover,
            autoplay: !playOnHover,
            animationData,
          });
        });
      } catch {
        if (!cancelled) setMode(webpUrl ? 'webp' : 'fallback');
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
  }, [emoji, animated, playOnHover, webpUrl]);

  const handleEnter = () => {
    if (playOnHover && animationRef.current) {
      animationRef.current.goToAndPlay(0, true);
    }
  };

  if (mode === 'fallback' || mode === 'pending') {
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

  const wrapperClass = cn(
    inline
      ? 'inline-block align-[-0.15em]'
      : 'inline-flex items-center justify-center',
    className
  );

  if (mode === 'webp' && webpUrl) {
    return (
      <img
        src={webpUrl}
        alt={emoji}
        title={title || emoji}
        width={size}
        height={size}
        loading="lazy"
        draggable={false}
        className={cn(wrapperClass, 'no-drag select-none object-contain')}
        style={{ width: size, height: size }}
        onError={() => setMode('fallback')}
      />
    );
  }

  return (
    <span
      className={wrapperClass}
      style={{ width: size, height: size }}
      title={title || emoji}
      onMouseEnter={handleEnter}
    >
      <span ref={containerRef} style={{ width: size, height: size }} />
    </span>
  );
}

export default TelegramEmoji;
