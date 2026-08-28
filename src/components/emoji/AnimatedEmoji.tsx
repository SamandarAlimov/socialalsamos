import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { animatedEmojiCandidates, staticEmojiCandidates } from '@/lib/emojiAssets';
import { LottieEmoji } from './LottieEmoji';

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
  /** Skip the lazy IntersectionObserver (for a handful of always-visible emojis). */
  eager?: boolean;
  /**
   * Vektor (Lottie) sifatida o'ynatish. Katta o'lchamlarda avtomatik yoqiladi:
   * emoji-only xabarlar va reaksiya animatsiyalari Telegramdek silliq bo'ladi.
   */
  hq?: boolean;
}

/** Bu o'lchamdan boshlab WebP piksellari ko'rinadi -> Lottie ishlatiladi. */
const LOTTIE_MIN_SIZE = 40;

/**
 * Global caches so the whole app never re-requests an asset that already
 * failed, and never waits again for one that is already in the browser cache.
 * This is the main reason emoji grids used to feel heavy: every mount fired
 * a fresh waterfall of CDN requests.
 */
const failedSrc = new Set<string>();
const loadedSrc = new Set<string>();

function firstUsable(candidates: string[]): number {
  for (let i = 0; i < candidates.length; i++) {
    if (!failedSrc.has(candidates[i])) return i;
  }
  return -1;
}

function AnimatedEmojiImpl({
  emoji,
  size = 24,
  className,
  playOnHover = false,
  animated = true,
  inline = false,
  title,
  eager = false,
  hq,
}: AnimatedEmojiProps) {
  const candidates = useMemo(
    () => (animated ? animatedEmojiCandidates(emoji) : staticEmojiCandidates(emoji)),
    [emoji, animated]
  );

  const [index, setIndex] = useState(() => firstUsable(candidates));
  const [visible, setVisible] = useState(eager);
  const holderRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setIndex(firstUsable(candidates));
  }, [candidates]);

  // Ko'rinmagan emojilar hech qanday so'rov yubormaydi (scroll-performance)
  useEffect(() => {
    if (eager || visible) return;
    const node = holderRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [eager, visible]);

  // Katta emojilar - haqiqiy vektor animatsiya (Telegram TGS = Lottie)
  const useLottie = animated && !playOnHover && (hq === true || size >= LOTTIE_MIN_SIZE);
  if (useLottie) {
    return (
      <LottieEmoji
        emoji={emoji}
        size={size}
        className={className}
        inline={inline}
        title={title}
        eager={eager}
      />
    );
  }

  const nativeGlyph = (
    <span
      className="leading-none"
      style={{ fontSize: size * 0.92, lineHeight: 1 }}
      aria-hidden={false}
    >
      {emoji}
    </span>
  );

  const src = index >= 0 ? candidates[index] : undefined;
  const showImage = Boolean(src) && visible;

  return (
    <span
      ref={holderRef}
      className={cn(
        'inline-flex select-none items-center justify-center leading-none',
        inline && 'align-[-0.15em]',
        playOnHover && 'transition-transform duration-150 hover:scale-110',
        className
      )}
      style={{ width: size, height: size }}
      title={title}
    >
      {showImage ? (
        <img
          src={src}
          alt={emoji}
          loading="lazy"
          decoding="async"
          draggable={false}
          width={size}
          height={size}
          onLoad={() => {
            if (src) loadedSrc.add(src);
          }}
          onError={() => {
            if (src) failedSrc.add(src);
            setIndex((prev) => {
              for (let i = prev + 1; i < candidates.length; i++) {
                if (!failedSrc.has(candidates[i])) return i;
              }
              return -1;
            });
          }}
          className="inline-block select-none object-contain"
          style={{ width: size, height: size }}
        />
      ) : (
        nativeGlyph
      )}
    </span>
  );
}

export const AnimatedEmoji = memo(AnimatedEmojiImpl);
