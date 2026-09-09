import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useVideoSurfaceTap } from './useVideoSurfaceTap';

describe('useVideoSurfaceTap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a touch single tap alive through the immediate pointerleave cleanup', () => {
    const onSingleTap = vi.fn();
    const onDoubleTap = vi.fn();
    const { result } = renderHook(() =>
      useVideoSurfaceTap({ onSingleTap, onDoubleTap, delay: 240 }),
    );

    act(() => {
      result.current.registerTap(120, 240);
      // Mirrors VideosPage: touch pointerup registers the tap, then iOS emits
      // pointerleave immediately and the surface cleanup calls clearPending().
      result.current.clearPending();
    });

    act(() => {
      vi.advanceTimersByTime(240);
    });

    expect(onSingleTap).toHaveBeenCalledTimes(1);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('still cancels a pending single tap when cleanup happens after the post-up guard', () => {
    const onSingleTap = vi.fn();
    const onDoubleTap = vi.fn();
    const { result } = renderHook(() =>
      useVideoSurfaceTap({ onSingleTap, onDoubleTap, delay: 240 }),
    );

    act(() => {
      result.current.registerTap(120, 240);
      vi.advanceTimersByTime(80);
      result.current.clearPending();
      vi.advanceTimersByTime(240);
    });

    expect(onSingleTap).not.toHaveBeenCalled();
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('keeps double tap reserved for like without firing play pause', () => {
    const onSingleTap = vi.fn();
    const onDoubleTap = vi.fn();
    const { result } = renderHook(() =>
      useVideoSurfaceTap({ onSingleTap, onDoubleTap, delay: 240 }),
    );

    act(() => {
      result.current.registerTap(120, 240);
      vi.advanceTimersByTime(100);
      result.current.registerTap(126, 244);
      vi.advanceTimersByTime(300);
    });

    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    expect(onSingleTap).not.toHaveBeenCalled();
  });
});
