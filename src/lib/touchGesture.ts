export type TouchAxis = 'unknown' | 'horizontal' | 'vertical';

export interface TouchIntentOptions {
  threshold?: number;
  horizontalRatio?: number;
}

/**
 * Platform-wide touch intent arbitration.
 *
 * Until the finger moves beyond threshold, the gesture remains unknown.
 * Once resolved, the axis is sticky for the rest of the gesture.
 *
 * Vertical wins ties so native page/chat scrolling is always the safest
 * default on mobile/tablet browsers.
 */
export function resolveTouchAxis(
  dx: number,
  dy: number,
  options: TouchIntentOptions = {},
): TouchAxis {
  const threshold = options.threshold ?? 10;
  const horizontalRatio = options.horizontalRatio ?? 1;

  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absX < threshold && absY < threshold) return 'unknown';
  return absX > absY * horizontalRatio ? 'horizontal' : 'vertical';
}

export function movedBeyondTouchTolerance(
  dx: number,
  dy: number,
  tolerance = 8,
): boolean {
  return Math.abs(dx) > tolerance || Math.abs(dy) > tolerance;
}
