import { describe, expect, it } from 'vitest';

import {
  movedBeyondTouchTolerance,
  resolveTouchAxis,
} from '@/lib/touchGesture';

describe('touch gesture policy', () => {
  it('keeps tiny movement unknown', () => {
    expect(resolveTouchAxis(5, 7)).toBe('unknown');
  });

  it('prioritizes vertical scrolling on ties', () => {
    expect(resolveTouchAxis(14, 14)).toBe('vertical');
    expect(resolveTouchAxis(10, 18)).toBe('vertical');
  });

  it('requires a clear horizontal ratio when configured', () => {
    expect(resolveTouchAxis(20, 16, { horizontalRatio: 1.25 })).toBe('vertical');
    expect(resolveTouchAxis(24, 14, { horizontalRatio: 1.25 })).toBe('horizontal');
  });

  it('detects movement that must cancel click or long press', () => {
    expect(movedBeyondTouchTolerance(3, 5, 8)).toBe(false);
    expect(movedBeyondTouchTolerance(2, 11, 8)).toBe(true);
  });
});
