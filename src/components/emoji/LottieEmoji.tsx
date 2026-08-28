import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { animatedEmojiCandidates, lottieEmojiUrls } from '@/lib/emojiAssets';

interface LottieEmojiProps {
  emoji: string;
  size?: number;
  className?: string;
  inline?: boolean;
  title?: string;
  /** IntersectionObserver'ni o'tkazib yuborish. */
  eager?: boolean;
  loop?: boolean;
}

/**
 * Lottie JSON keshi. Matn sifatida saqlanadi, chunki lottie-web animatsiya
 * ob'ektini O'ZGARTIRADI - har bir nusxa uchun toza JSON kerak.
 */
const jsonCache = new Map<string, string>();
const failedUrl = new Set<string>();
const inflight = new Map<string, Promise<string | null>>();

async function loadJsonText(url: string): Promise<string | null> {
  if (jsonCache.has(url)) return jsonCache.get(url) || null;
  if (failedUrl.has(url)) return null;

  const existing = inflight.get(url);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) {
        failedUrl.add(url);
        return null;
      }
      const text = await res.text();
      // SPA hosting 404 uchun index.html qaytarishi mumkin - tekshiramiz.
      if (!text.trim().startsWith('{')) {
        failedUrl.add(url);
        return null;
      }
      jsonCache.set(url, text);
      return text;
    } catch {
      failedUrl.add(url);
      return null;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, promise);
  return promise;
}

async function loadFirstAvailable(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    const text = await loadJsonText(url);
    if (text) return text;
  }
  return null;
}

/**
 * Haqiqiy Lottie (vektor) animatsion emoji - Telegram xuddi shu formatdan
 * foydalanadi (TGS = siqilgan Lottie). Manba: Google Noto Animated Emoji
 * (Apache 2.0 / OFL - tijoriy loyihalar uchun xavfsiz), kod-nuqta bo'yicha
 * manzillanadi, shuning uchun 600+ nomli xarita kerak emas.
 *
 * Yengil ishlashi uchun:
 *  - faqat ko'rinadigan emoji yuklanadi (IntersectionObserver, 120px zapas);
 *  - lottie-web dinamik `import()` bilan yuklanadi (asosiy bundle o'smaydi);
 *  - JSON global keshda, bir emoji faqat bir marta so'raladi;
 *  - muvaffaqiyatsiz bo'lsa animatsion WebP -> tizim glifiga tushadi.
 */
function LottieEmojiImpl({
  emoji,
  size = 48,
  className,
  inline = false,
  title,
  eager = false,
  loop = true,
}: LottieEmojiProps) {
  const holderRef = useRef<HTMLSpanElement | null>(null);
  const boxRef = useRef<HTMLSpanElement | null>(null);
  const animationRef = useRef<{ destroy: () => void } | null>(null);

  const lottieUrls = useMemo(() => lottieEmojiUrls(emoji), [emoji]);
  const imageUrls = useMemo(() => animatedEmojiCandidates(emoji), [emoji]);

  const [visible, setVisible] = useState(eager);
  const [playing, setPlaying] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [imagesExhausted, setImagesExhausted] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setImageIndex(0);
    setImagesExhausted(false);
  }, [emoji]);

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

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    (async () => {
      const text = await loadFirstAvailable(lottieUrls);
      if (cancelled || !text) return;

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        return;
      }

      let lottieModule: typeof import('lottie-web') | null = null;
      try {
        lottieModule = await import('lottie-web');
      } catch {
        return;
      }
      if (cancelled || !boxRef.current || !lottieModule) return;

      try {
        animationRef.current = lottieModule.default.loadAnimation({
          container: boxRef.current,
          renderer: 'svg',
          loop,
          autoplay: true,
          animationData: data as Record<string, unknown>,
        }) as unknown as { destroy: () => void };
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    })();

    return () => {
      cancelled = true;
      if (animationRef.current) {
        try {
          animationRef.current.destroy();
        } catch {
          // e'tiborsiz
        }
        animationRef.current = null;
      }
    };
  }, [visible, lottieUrls, loop]);

  const fallbackSrc =
    !imagesExhausted && imageIndex < imageUrls.length ? imageUrls[imageIndex] : undefined;

  return (
    <span
      ref={holderRef}
      className={cn(
        'relative inline-flex select-none items-center justify-center leading-none',
        inline && 'align-[-0.15em]',
        className
      )}
      style={{ width: size, height: size }}
      title={title}
    >
      {/* Lottie konteyneri: o'lchamga ega bo'lishi kerak, shuning uchun
          display:none emas, opacity bilan yashiriladi. */}
      <span
        ref={boxRef}
        aria-hidden
        className={cn(
          'absolute inset-0 block transition-opacity duration-150',
          playing ? 'opacity-100' : 'opacity-0'
        )}
      />

      {!playing &&
        (fallbackSrc && visible ? (
          <img
            src={fallbackSrc}
            alt={emoji}
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => {
              setImageIndex((prev) => {
                if (prev + 1 >= imageUrls.length) {
                  setImagesExhausted(true);
                  return prev;
                }
                return prev + 1;
              });
            }}
            className="inline-block select-none object-contain"
            style={{ width: size, height: size }}
          />
        ) : (
          <span className="leading-none" style={{ fontSize: size * 0.92, lineHeight: 1 }}>
            {emoji}
          </span>
        ))}
    </span>
  );
}

export const LottieEmoji = memo(LottieEmojiImpl);
