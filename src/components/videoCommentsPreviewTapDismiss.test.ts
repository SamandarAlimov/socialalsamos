import { describe, expect, it } from 'vitest';

import { isVideoCommentsPreviewTap } from '@/lib/videoCommentsPreviewTapDismiss';

describe('mobile Reel comments preview tap dismissal', () => {
  it('accepts a short stationary tap', () => {
    expect(isVideoCommentsPreviewTap({
      startX: 120,
      startY: 180,
      endX: 126,
      endY: 184,
      durationMs: 180,
    })).toBe(true);
  });

  it('does not dismiss for a drag', () => {
    expect(isVideoCommentsPreviewTap({
      startX: 120,
      startY: 180,
      endX: 160,
      endY: 230,
      durationMs: 220,
    })).toBe(false);
  });

  it('does not dismiss for a long press or invalid timing', () => {
    expect(isVideoCommentsPreviewTap({
      startX: 120,
      startY: 180,
      endX: 121,
      endY: 181,
      durationMs: 900,
    })).toBe(false);
    expect(isVideoCommentsPreviewTap({
      startX: 120,
      startY: 180,
      endX: 120,
      endY: 180,
      durationMs: Number.NaN,
    })).toBe(false);
  });
});
