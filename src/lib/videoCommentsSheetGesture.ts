export type VideoCommentsSheetBounds = {
  height: number;
  minTop: number;
  initialTop: number;
};

export type VideoCommentsSheetDragPosition = {
  top: number;
  dismissOffset: number;
};

export type VideoCommentsSheetDetent = 'initial' | 'expanded';

export const VIDEO_COMMENTS_DISMISS_VELOCITY = 0.85;
export const VIDEO_COMMENTS_SNAP_VELOCITY = 0.45;
export const VIDEO_COMMENTS_DISMISS_DISTANCE_RATIO = 0.12;
export const VIDEO_COMMENTS_DISMISS_MIN_DISTANCE = 88;

/**
 * Instagram uses two different phases for a downward gesture:
 *
 * 1. From the expanded state to the reference compact detent, the sheet's top
 *    edge moves while its bottom/composer stays pinned to the viewport.
 * 2. Once the compact detent is reached, the sheet does not keep shrinking.
 *    Additional downward travel translates the whole sheet (including the
 *    composer) toward dismissal.
 *
 * Treating top + dismissOffset as one continuous gesture coordinate lets a
 * single drag cross the phase boundary without a jump.
 */
export function resolveVideoCommentsSheetDrag(
  startTop: number,
  startDismissOffset: number,
  deltaY: number,
  bounds: VideoCommentsSheetBounds,
): VideoCommentsSheetDragPosition {
  const effectiveTop = startTop + Math.max(0, startDismissOffset) + deltaY;

  if (effectiveTop <= bounds.initialTop) {
    return {
      top: Math.min(bounds.initialTop, Math.max(bounds.minTop, effectiveTop)),
      dismissOffset: 0,
    };
  }

  return {
    top: bounds.initialTop,
    dismissOffset: Math.min(bounds.height, Math.max(0, effectiveTop - bounds.initialTop)),
  };
}

export function shouldDismissVideoCommentsSheet(
  dismissOffset: number,
  velocityY: number,
  viewportHeight: number,
) {
  const distanceThreshold = Math.max(
    VIDEO_COMMENTS_DISMISS_MIN_DISTANCE,
    viewportHeight * VIDEO_COMMENTS_DISMISS_DISTANCE_RATIO,
  );

  return (
    dismissOffset >= distanceThreshold ||
    (dismissOffset >= 28 && velocityY >= VIDEO_COMMENTS_DISMISS_VELOCITY)
  );
}

export function settleVideoCommentsSheetDetent(
  top: number,
  velocityY: number,
  bounds: VideoCommentsSheetBounds,
): VideoCommentsSheetDetent {
  if (velocityY <= -VIDEO_COMMENTS_SNAP_VELOCITY) return 'expanded';
  if (velocityY >= VIDEO_COMMENTS_SNAP_VELOCITY) return 'initial';

  const midpoint = (bounds.minTop + bounds.initialTop) / 2;
  return top < midpoint ? 'expanded' : 'initial';
}
