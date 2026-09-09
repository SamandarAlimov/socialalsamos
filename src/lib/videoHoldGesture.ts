export type VideoHoldIntent = 'speed' | 'pause';

/**
 * Instagram documents 2x hold as a left/right edge gesture, but does not
 * publish a pixel threshold. Alsamos keeps those zones intentionally narrow so
 * the large center remains a pause/play surface.
 */
export const VIDEO_EDGE_HOLD_ZONE_RATIO = 0.18;

export function resolveVideoHoldIntent(
  clientX: number,
  frameLeft: number,
  frameWidth: number,
): VideoHoldIntent {
  if (!Number.isFinite(frameWidth) || frameWidth <= 0) return 'pause';

  const normalizedX = Math.min(1, Math.max(0, (clientX - frameLeft) / frameWidth));
  return normalizedX <= VIDEO_EDGE_HOLD_ZONE_RATIO || normalizedX >= 1 - VIDEO_EDGE_HOLD_ZONE_RATIO
    ? 'speed'
    : 'pause';
}
