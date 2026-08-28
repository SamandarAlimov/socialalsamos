import { useState } from 'react';
import { cn } from '@/lib/utils';

interface StickerMessageProps {
  url: string;
  /** 'sticker' - shaffof stiker, 'gif' - animatsion GIF */
  kind: 'sticker' | 'gif';
  className?: string;
}

/** Stiker uchun maksimal o'lcham (Telegramdagidek ~200px) */
const STICKER_SIZE = 200;
/** GIF uchun maksimal kenglik */
const GIF_MAX_WIDTH = 280;

/**
 * Telegramdek stiker va GIF xabari.
 *
 * Stiker fonsiz (karta va dumchasiz) ko'rinadi, o'lchami kvadrat emas -
 * rasmning haqiqiy nisbatida chiziladi. GIF esa yumaloq burchakli ramkada,
 * o'z nisbatida, avtomatik takrorlanadi.
 */
export function StickerMessage({ url, kind, className }: StickerMessageProps) {
  const [ratio, setRatio] = useState<number>(1);

  const isSticker = kind === 'sticker';
  const maxWidth = isSticker ? STICKER_SIZE : GIF_MAX_WIDTH;
  const width = ratio >= 1 ? maxWidth : Math.round(maxWidth * ratio);

  return (
    <div
      className={cn('relative overflow-hidden', isSticker ? '' : 'rounded-2xl bg-muted', className)}
      style={{ width, aspectRatio: String(ratio) }}
    >
      <img
        src={url}
        alt={isSticker ? 'Stiker' : 'GIF'}
        loading="lazy"
        draggable={false}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth && naturalHeight) setRatio(naturalWidth / naturalHeight);
        }}
        className={cn('h-full w-full select-none', isSticker ? 'object-contain' : 'object-cover')}
      />
    </div>
  );
}

export default StickerMessage;
