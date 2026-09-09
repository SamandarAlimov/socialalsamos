export type VideoHoldIntent = 'speed' | 'pause';

/**
 * Instagram documents 2x hold as a left/right edge gesture, but does not
 * publish a pixel threshold. Alsamos keeps those zones intentionally narrow so
 * the large center remains a pause/play surface.
 */
export const VIDEO_EDGE_HOLD_ZONE_RATIO = 0.18;
const HOLD_ZONE_EPSILON = 1e-9;

export function resolveVideoHoldIntent(
  clientX: number,
  frameLeft: number,
  frameWidth: number,
): VideoHoldIntent {
  if (!Number.isFinite(frameWidth) || frameWidth <= 0) return 'pause';

  const normalizedX = Math.min(1, Math.max(0, (clientX - frameLeft) / frameWidth));
  const leftEdgeLimit = VIDEO_EDGE_HOLD_ZONE_RATIO + HOLD_ZONE_EPSILON;
  const rightEdgeLimit = 1 - VIDEO_EDGE_HOLD_ZONE_RATIO - HOLD_ZONE_EPSILON;

  return normalizedX <= leftEdgeLimit || normalizedX >= rightEdgeLimit
    ? 'speed'
    : 'pause';
}
