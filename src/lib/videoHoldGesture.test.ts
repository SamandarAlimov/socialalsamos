import { describe, expect, it } from 'vitest';

import {
  VIDEO_EDGE_HOLD_ZONE_RATIO,
  resolveVideoHoldIntent,
} from './videoHoldGesture';

describe('resolveVideoHoldIntent', () => {
  const left = 100;
  const width = 400;

  it('uses narrow left and right edge zones for 2x hold', () => {
    expect(resolveVideoHoldIntent(left, left, width)).toBe('speed');
    expect(resolveVideoHoldIntent(left + width * VIDEO_EDGE_HOLD_ZONE_RATIO, left, width)).toBe('speed');
    expect(resolveVideoHoldIntent(left + width * (1 - VIDEO_EDGE_HOLD_ZONE_RATIO), left, width)).toBe('speed');
    expect(resolveVideoHoldIntent(left + width, left, width)).toBe('speed');
  });

  it('keeps the broad middle of the display as the pause hold zone', () => {
    expect(resolveVideoHoldIntent(left + width * 0.19, left, width)).toBe('pause');
    expect(resolveVideoHoldIntent(left + width * 0.5, left, width)).toBe('pause');
    expect(resolveVideoHoldIntent(left + width * 0.81, left, width)).toBe('pause');
  });

  it('falls back to pause when frame geometry is not usable', () => {
    expect(resolveVideoHoldIntent(200, 0, 0)).toBe('pause');
  });
});
