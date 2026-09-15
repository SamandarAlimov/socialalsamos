import { describe, expect, it } from 'vitest';

import {
  resolveVideoCommentsSheetDrag,
  settleVideoCommentsSheetDetent,
  shouldDismissVideoCommentsSheet,
} from './videoCommentsSheetGesture';

const bounds = {
  height: 844,
  minTop: 0,
  initialTop: 308,
};

describe('Instagram-style video comments sheet gestures', () => {
  it('resizes only until the compact detent, then translates the whole sheet', () => {
    expect(resolveVideoCommentsSheetDrag(0, 0, 180, bounds)).toEqual({
      top: 180,
      dismissOffset: 0,
    });

    expect(resolveVideoCommentsSheetDrag(0, 0, 360, bounds)).toEqual({
      top: 308,
      dismissOffset: 52,
    });
  });

  it('does not create a tiny intermediate sheet below the compact detent', () => {
    expect(resolveVideoCommentsSheetDrag(308, 0, 220, bounds)).toEqual({
      top: 308,
      dismissOffset: 220,
    });
  });

  it('lets an upward reversal consume dismiss translation before expanding', () => {
    expect(resolveVideoCommentsSheetDrag(308, 120, -60, bounds)).toEqual({
      top: 308,
      dismissOffset: 60,
    });

    expect(resolveVideoCommentsSheetDrag(308, 120, -180, bounds)).toEqual({
      top: 248,
      dismissOffset: 0,
    });
  });

  it('dismisses after a deliberate compact-state pull or a fast fling', () => {
    expect(shouldDismissVideoCommentsSheet(110, 0.2, bounds.height)).toBe(true);
    expect(shouldDismissVideoCommentsSheet(40, 0.9, bounds.height)).toBe(true);
    expect(shouldDismissVideoCommentsSheet(40, 0.2, bounds.height)).toBe(false);
  });

  it('snaps only between expanded and the Instagram compact detent', () => {
    expect(settleVideoCommentsSheetDetent(80, 0, bounds)).toBe('expanded');
    expect(settleVideoCommentsSheetDetent(250, 0, bounds)).toBe('initial');
    expect(settleVideoCommentsSheetDetent(250, -0.5, bounds)).toBe('expanded');
  });
});
