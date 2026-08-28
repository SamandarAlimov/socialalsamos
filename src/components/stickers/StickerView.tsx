import { memo, useState } from 'react';
import { cn } from '@/lib/utils';
import { AnimatedEmoji } from '@/components/emoji/AnimatedEmoji';
import { LottieEmoji } from '@/components/emoji/LottieEmoji';
import type { StickerItem } from '@/lib/stickers';

interface StickerViewProps {
  sticker: StickerItem;
  size?: number;
  className?: string;
  /** Katta ko'rinishda haqiqiy vektor (Lottie) o'ynatiladi. */
  highFidelity?: boolean;
  /** Ro'yxatdan tashqarida (masalan media ustida) darhol yuklanadi. */
  eager?: boolean;
}

/**
 * Har qanday turdagi stikerni ko'rsatadigan yagona komponent.
 *
 * - `animated_emoji` -> Noto animatsion emoji (katta o'lchamda Lottie vektor)
 * - `gif` / `image` / `video` -> tashqi fayl
 * - fayl yuklanmasa, emoji glifi yoki neytral joy egallovchi ko'rsatiladi
 */
function StickerViewImpl({
  sticker,
  size = 64,
  className,
  highFidelity = false,
  eager = false,
}: StickerViewProps) {
  const [failed, setFailed] = useState(false);

  if (sticker.kind === 'animated_emoji' && sticker.emoji) {
    return highFidelity ? (
      <LottieEmoji
        emoji={sticker.emoji}
        size={size}
        className={className}
        eager={eager}
        title={sticker.name}
      />
    ) : (
      <AnimatedEmoji emoji={sticker.emoji} size={size} className={className} />
    );
  }

  const src = sticker.previewUrl ?? sticker.fullUrl;

  if (!src || failed) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-xl bg-muted text-muted-foreground',
          className,
        )}
        style={{ width: size, height: size }}
      >
        {sticker.emoji ?? '⬜'}
      </span>
    );
  }

  if (sticker.kind === 'video') {
    return (
      <video
        src={src}
        width={size}
        height={size}
        muted
        loop
        autoPlay
        playsInline
        onError={() => setFailed(true)}
        className={cn('select-none object-contain', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={sticker.name}
      width={size}
      height={size}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={cn('select-none object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}

export const StickerView = memo(StickerViewImpl);
