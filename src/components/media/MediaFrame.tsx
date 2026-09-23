import { CSSProperties, ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * MediaFrame — shared responsive container for all post media (images & videos).
 *
 * Behaves like Instagram / YouTube / Telegram:
 *   - Preserves the media's natural aspect ratio where the feed has room.
 *   - Uses a dedicated portrait-video range so 9:16 feed video can actually
 *     occupy the card width instead of being squeezed into a 4:5 image frame.
 *   - Clamps only extreme ratios / viewport height so the feed stays usable.
 *   - Centers media over an optional blurred media-derived backdrop.
 *
 * Variants:
 *   - "feed"       → 4:5 ≤ ratio ≤ 1.91:1 (images / standard visual media)
 *   - "feed-video" → 9:16 ≤ ratio ≤ 1.91:1 + taller viewport budget
 *   - "reel"       → 9:16 fixed                (Reels / Shorts viewport)
 *   - "preview"    → 16:9 fixed                (small shared previews, chat cards)
 *   - "free"       → no clamp, exact natural ratio
 */

const FEED_MIN = 4 / 5;        // 0.8 (image-feed portrait floor)
const FEED_MAX = 1.91;         // widest landscape allowed in feed
const REEL_RATIO = 9 / 16;     // 0.5625
const PREVIEW_RATIO = 16 / 9;  // 1.777…

export type MediaFrameVariant = 'feed' | 'feed-video' | 'reel' | 'preview' | 'free';

export interface MediaFrameProps {
  children: ReactNode;
  /** Natural aspect ratio (width / height). Use 0/undefined while loading. */
  naturalRatio?: number;
  variant?: MediaFrameVariant;
  className?: string;
  innerClassName?: string;
  /** Image/poster used to create a soft premium backdrop behind contained media. */
  backdropUrl?: string | null;
  rounded?: boolean;
  style?: CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Forwarded touch/wheel handlers (e.g. pinch-zoom) */
  onTouchStart?: React.TouchEventHandler<HTMLDivElement>;
  onTouchMove?: React.TouchEventHandler<HTMLDivElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
  onTouchCancel?: React.TouchEventHandler<HTMLDivElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLDivElement>;
  onWheel?: React.WheelEventHandler<HTMLDivElement>;
  containerRef?: React.Ref<HTMLDivElement>;
}

export function resolveFrameRatio(variant: MediaFrameVariant, naturalRatio?: number): number {
  switch (variant) {
    case 'reel':
      return REEL_RATIO;
    case 'preview':
      return PREVIEW_RATIO;
    case 'free':
      return naturalRatio && isFinite(naturalRatio) && naturalRatio > 0 ? naturalRatio : 1;
    case 'feed-video': {
      // Instagram-style feed video: a normal 9:16 upload is allowed to use its
      // real portrait ratio and therefore the full card width. Only videos even
      // taller than 9:16 are cropped into the 9:16 floor.
      if (!naturalRatio || !isFinite(naturalRatio) || naturalRatio <= 0) return REEL_RATIO;
      return Math.min(FEED_MAX, Math.max(REEL_RATIO, naturalRatio));
    }
    case 'feed':
    default: {
      if (!naturalRatio || !isFinite(naturalRatio) || naturalRatio <= 0) return 1;
      return Math.min(FEED_MAX, Math.max(FEED_MIN, naturalRatio));
    }
  }
}

export function MediaFrame({
  children,
  naturalRatio,
  variant = 'feed',
  className,
  innerClassName,
  backdropUrl = null,
  rounded = false,
  style,
  onClick,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
  onDoubleClick,
  onWheel,
  containerRef,
}: MediaFrameProps) {
  const ratio = resolveFrameRatio(variant, naturalRatio);
  const isFeed = variant === 'feed';
  const isFeedVideo = variant === 'feed-video';

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden bg-neutral-950 flex items-center justify-center',
        isFeed &&
          'max-h-[min(72dvh,720px)] sm:max-h-[min(74dvh,720px)] xl:max-h-[min(76dvh,740px)]',
        isFeedVideo &&
          'max-h-[min(82dvh,860px)] sm:max-h-[min(84dvh,880px)] xl:max-h-[min(86dvh,900px)]',
        rounded && 'rounded-2xl',
        className,
      )}
      style={{ aspectRatio: String(ratio), ...style }}
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
    >
      {backdropUrl && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <img
            src={backdropUrl}
            alt=""
            className="h-full w-full scale-[1.14] object-cover opacity-70 blur-[30px] saturate-125"
            draggable={false}
          />
          <div className="absolute inset-0 bg-black/20" />
        </div>
      )}

      <div
        className={cn(
          'absolute inset-0 z-[1] flex items-center justify-center',
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Helper hook: tracks an <img> / <video> natural ratio on load.
 */
export function useNaturalRatio() {
  const [ratio, setRatio] = useState<number | undefined>(undefined);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    if (el.naturalWidth && el.naturalHeight) {
      setRatio(el.naturalWidth / el.naturalHeight);
    }
  };

  const onVideoLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    if (el.videoWidth && el.videoHeight) {
      setRatio(el.videoWidth / el.videoHeight);
    }
  };

  return { ratio, onImageLoad, onVideoLoadedMetadata, setRatio };
}
