import { describe, expect, it } from 'vitest';

import {
  buildVideoPlaybackCandidates,
  getNextVideoSourceIndex,
  resolvePlayableDuration,
} from '@/lib/videoPlaybackRecovery';

describe('videoPlaybackRecovery', () => {
  it('keeps the canonical source first and deduplicates fallback candidates', () => {
    expect(
      buildVideoPlaybackCandidates(
        ['https://cdn.example/video.mp4', 'https://cdn.example/poster.jpg'],
        ['https://cdn.example/video.mp4', 'https://backup.example/video.mp4'],
      ),
    ).toEqual([
      'https://cdn.example/video.mp4',
      'https://cdn.example/poster.jpg',
      'https://backup.example/video.mp4',
    ]);
  });

  it('returns the next source until candidates are exhausted', () => {
    expect(getNextVideoSourceIndex(0, 3)).toBe(1);
    expect(getNextVideoSourceIndex(1, 3)).toBe(2);
    expect(getNextVideoSourceIndex(2, 3)).toBeNull();
  });

  it('uses seekable range when media duration is not finite yet', () => {
    expect(resolvePlayableDuration(Number.POSITIVE_INFINITY, 107.42)).toBe(107.42);
    expect(resolvePlayableDuration(Number.NaN, 0)).toBe(0);
    expect(resolvePlayableDuration(142.5, 107.42)).toBe(142.5);
  });
});
