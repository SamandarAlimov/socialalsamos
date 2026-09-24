export const POST_PREVIEW_ASPECT_RATIOS = {
  landscape: 16 / 9,
  square: 1,
  portraitFourFive: 4 / 5,
  portraitThreeFour: 3 / 4,
  portraitNineSixteen: 9 / 16,
} as const;

const COMMON_RATIOS = Object.values(POST_PREVIEW_ASPECT_RATIOS);
const MIN_PREVIEW_RATIO = POST_PREVIEW_ASPECT_RATIOS.portraitNineSixteen;
const MAX_PREVIEW_RATIO = POST_PREVIEW_ASPECT_RATIOS.landscape;
const SNAP_TOLERANCE = 0.035;

function positiveFinite(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Reads canonical post-media dimensions before falling back to the serialized
 * `aspect_ratio` value. Historical rows contain both `16:9`/`4/5` strings and
 * decimal ratios, so the parser deliberately accepts all three forms.
 */
export function parsePostMediaAspectRatio(
  aspectRatio?: string | number | null,
  width?: number | null,
  height?: number | null,
): number | null {
  const safeWidth = positiveFinite(width);
  const safeHeight = positiveFinite(height);
  if (safeWidth && safeHeight) return safeWidth / safeHeight;

  if (typeof aspectRatio === 'number') return positiveFinite(aspectRatio);
  if (typeof aspectRatio !== 'string') return null;

  const value = aspectRatio.trim();
  if (!value) return null;

  const separated = value.match(/^([0-9]*\.?[0-9]+)\s*[:/]\s*([0-9]*\.?[0-9]+)$/);
  if (separated) {
    const numerator = positiveFinite(separated[1]);
    const denominator = positiveFinite(separated[2]);
    return numerator && denominator ? numerator / denominator : null;
  }

  return positiveFinite(value);
}

/**
 * Preview surfaces preserve the media's real ratio while keeping pathological
 * legacy dimensions inside the professional post range (9:16 through 16:9).
 * Values very close to common social ratios snap to the exact canonical ratio
 * so 1080x1918 and similar encoded videos do not create one-pixel layout drift.
 */
export function normalizePostPreviewAspectRatio(
  ratio?: number | null,
  fallback = POST_PREVIEW_ASPECT_RATIOS.landscape,
): number {
  const safeFallback = positiveFinite(fallback) ?? POST_PREVIEW_ASPECT_RATIOS.landscape;
  const safeRatio = positiveFinite(ratio) ?? safeFallback;
  const clamped = Math.min(MAX_PREVIEW_RATIO, Math.max(MIN_PREVIEW_RATIO, safeRatio));

  let nearest = COMMON_RATIOS[0];
  let distance = Math.abs(clamped - nearest);
  for (const candidate of COMMON_RATIOS.slice(1)) {
    const nextDistance = Math.abs(clamped - candidate);
    if (nextDistance < distance) {
      nearest = candidate;
      distance = nextDistance;
    }
  }

  return distance / nearest <= SNAP_TOLERANCE ? nearest : clamped;
}

export function isTallPostPreviewRatio(ratio?: number | null): boolean {
  return normalizePostPreviewAspectRatio(ratio) < 2 / 3;
}
