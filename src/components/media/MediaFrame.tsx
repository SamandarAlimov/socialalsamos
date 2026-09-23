import { CSSProperties, ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * MediaFrame — shared responsive container for all post media (images & videos).
 *
 * Behaves like modern social feeds:
 *   - Preserves the media's natural aspect ratio where the viewport has room.
 *   - Lets portrait media down to 9:16 use the full post width instead of
 *     forcing it into a 4:5 box with large pillarboxes.
 *   - Clamps only extreme ratios / viewport height so the feed stays usable.
 *   - Video can cover the frame when the viewport-height budget requires a
 *     small crop; images remain contained and are never distorted.
 *
 * Variants:
 *   - "feed"       → 9:16 ≤ ratio ≤ 1.91:1 + adaptive viewport-height budget
 *   - "feed-video" → same portrait-friendly range (explicit video surface)
 *   - "reel"       → 9:16 fixed                (Reels / Shorts viewport)
 *   - "preview"    → 16:9 fixed                (small shared previews, chat cards)
 *   - "free"       → no clamp, exact natural ratio
 */

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
    case 'feed-video':
    case 'feed':
    default: {
      // A standard 9:16 upload is allowed to keep its real portrait ratio and
      // therefore occupy the card width. Media taller than 9:16 is clamped and
      // video is allowed a small object-cover crop instead of side pillarboxes.
      if (!naturalRatio || !isFinite(naturalRatio) || naturalRatio <= 0) return 1;
      return Math.min(FEED_MAX, Math.max(REEL_RATIO, naturalRatio));
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
  const isFeed = variant === 'feed' || variant === 'feed-video';

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden bg-neutral-950 flex items-center justify-center',
        isFeed &&
          'max-h-[min(82dvh,860px)] sm:max-h-[min(84dvh,880px)] xl:max-h-[min(86dvh,900px)] [&_video]:object-cover',
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
