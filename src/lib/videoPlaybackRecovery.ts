export const VIDEO_LOAD_RECOVERY_TIMEOUT_MS = 8_000;
export const VIDEO_STALL_RECOVERY_TIMEOUT_MS = 6_000;

export function buildVideoPlaybackCandidates(
  mediaUrls?: Array<string | null | undefined> | null,
  mediaCandidates?: Array<string | null | undefined> | null,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of [...(mediaUrls ?? []), ...(mediaCandidates ?? [])]) {
    const url = typeof value === 'string' ? value.trim() : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }

  return result;
}

export function getNextVideoSourceIndex(
  currentIndex: number,
  candidateCount: number,
): number | null {
  const nextIndex = Math.max(0, currentIndex) + 1;
  return nextIndex < Math.max(0, candidateCount) ? nextIndex : null;
}

export function resolvePlayableDuration(
  mediaDuration: number,
  seekableEnd?: number | null,
): number {
  if (Number.isFinite(mediaDuration) && mediaDuration > 0) return mediaDuration;
  if (Number.isFinite(seekableEnd) && Number(seekableEnd) > 0) return Number(seekableEnd);
  return 0;
}
