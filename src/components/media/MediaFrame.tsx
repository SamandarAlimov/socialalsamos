import { CSSProperties, ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * MediaFrame — shared responsive container for all post media (images & videos).
 *
 * Behaves like Instagram / YouTube / Telegram:
 *   - Preserves the media's natural aspect ratio (no cropping, no distortion).
 *   - Clamps extreme ratios into a feed-friendly range so the layout stays stable.
 *   - Always centers media on a solid black backdrop (letterbox / pillarbox).
 *
 * Variants:
 *   - "feed"    → 4:5 ≤ ratio ≤ 1.91:1   (Instagram feed rules, default)
 *   - "reel"    → 9:16 fixed                (Reels / Shorts viewport)
 *   - "preview" → 16:9 fixed                (small shared previews, chat cards)
 *   - "free"    → no clamp, exact natural ratio
 */

const FEED_MIN = 4 / 5;        // 0.8 (tallest portrait allowed in feed)
const FEED_MAX = 1.91;         // widest landscape allowed in feed
const REEL_RATIO = 9 / 16;     // 0.5625
const PREVIEW_RATIO = 16 / 9;  // 1.777…

export type MediaFrameVariant = 'feed' | 'reel' | 'preview' | 'free';

export interface MediaFrameProps {
  children: ReactNode;
  /** Natural aspect ratio (width / height). Use 0/undefined while loading. */
  naturalRatio?: number;
  variant?: MediaFrameVariant;
  className?: string;
  innerClassName?: string;
  rounded?: boolean;
  style?: CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Forwarded touch/wheel handlers (e.g. pinch-zoom) */
  onTouchStart?: React.TouchEventHandler<HTMLDivElement>;
  onTouchMove?: React.TouchEventHandler<HTMLDivElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
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
  rounded = false,
  style,
  onClick,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onDoubleClick,
  onWheel,
  containerRef,
}: MediaFrameProps) {
  const ratio = resolveFrameRatio(variant, naturalRatio);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden bg-black flex items-center justify-center',
        rounded && 'rounded-2xl',
        className,
      )}
      style={{ aspectRatio: String(ratio), ...style }}
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
    >
      <div className={cn('absolute inset-0 flex items-center justify-center', innerClassName)}>
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
