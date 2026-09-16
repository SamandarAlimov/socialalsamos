export function resolveVideoDigitSeekTarget(key: string, duration: number): number | null {
  if (!/^[0-9]$/.test(key)) return null;
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return (Number(key) / 10) * duration;
}

export function resolveAdjacentVideoIndex(
  currentIndex: number,
  totalVideos: number,
  delta: -1 | 1,
): number {
  if (!Number.isFinite(currentIndex) || totalVideos <= 0) return 0;
  return Math.min(totalVideos - 1, Math.max(0, currentIndex + delta));
}
