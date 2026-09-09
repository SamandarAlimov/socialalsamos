import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveVideoDoubleTapZone, useVideoSurfaceTap } from './useVideoSurfaceTap';

describe('resolveVideoDoubleTapZone', () => {
  it('maps the left third to backward, center third to like, and right third to forward', () => {
    expect(resolveVideoDoubleTapZone(0, 0, 300)).toBe('backward');
    expect(resolveVideoDoubleTapZone(99, 0, 300)).toBe('backward');
    expect(resolveVideoDoubleTapZone(100, 0, 300)).toBe('center');
    expect(resolveVideoDoubleTapZone(150, 0, 300)).toBe('center');
    expect(resolveVideoDoubleTapZone(200, 0, 300)).toBe('center');
    expect(resolveVideoDoubleTapZone(201, 0, 300)).toBe('forward');
    expect(resolveVideoDoubleTapZone(300, 0, 300)).toBe('forward');
  });
});

describe('useVideoSurfaceTap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
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

  it('keeps center double tap reserved for like without firing play pause', () => {
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

  it('seeks backward 10 seconds on a left-third double tap without liking', () => {
    const surface = document.createElement('div');
    const video = document.createElement('video');
    surface.appendChild(video);
    document.body.appendChild(surface);

    Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
    video.currentTime = 50;
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 600,
      width: 300,
      height: 600,
      toJSON: () => ({}),
    });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => surface),
    });

    const onSingleTap = vi.fn();
    const onDoubleTap = vi.fn();
    const { result } = renderHook(() =>
      useVideoSurfaceTap({ onSingleTap, onDoubleTap, delay: 240 }),
    );

    act(() => {
      result.current.registerTap(40, 200);
      vi.advanceTimersByTime(100);
      result.current.registerTap(42, 202);
    });

    expect(video.currentTime).toBe(40);
    expect(onDoubleTap).not.toHaveBeenCalled();
    expect(onSingleTap).not.toHaveBeenCalled();
  });

  it('seeks forward 10 seconds on a right-third double tap and clamps to duration', () => {
    const surface = document.createElement('div');
    const video = document.createElement('video');
    surface.appendChild(video);
    document.body.appendChild(surface);

    Object.defineProperty(video, 'duration', { configurable: true, value: 60 });
    video.currentTime = 55;
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 600,
      width: 300,
      height: 600,
      toJSON: () => ({}),
    });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => surface),
    });

    const onSingleTap = vi.fn();
    const onDoubleTap = vi.fn();
    const { result } = renderHook(() =>
      useVideoSurfaceTap({ onSingleTap, onDoubleTap, delay: 240 }),
    );

    act(() => {
      result.current.registerTap(260, 200);
      vi.advanceTimersByTime(100);
      result.current.registerTap(262, 202);
    });

    expect(video.currentTime).toBe(60);
    expect(onDoubleTap).not.toHaveBeenCalled();
    expect(onSingleTap).not.toHaveBeenCalled();
  });

  it('reveals VideoWatchPanel controls on single tap instead of toggling playback', () => {
    const surface = document.createElement('div');
    const video = document.createElement('video');
    const backButton = document.createElement('button');
    backButton.setAttribute('aria-label', 'Videolarga qaytish');
    surface.append(video, backButton);
    document.body.appendChild(surface);

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => surface),
    });

    const revealControls = vi.fn();
    surface.addEventListener('pointermove', revealControls);

    const onSingleTap = vi.fn();
    const onDoubleTap = vi.fn();
    const { result } = renderHook(() =>
      useVideoSurfaceTap({ onSingleTap, onDoubleTap, delay: 240 }),
    );

    act(() => {
      result.current.registerTap(150, 220);
      vi.advanceTimersByTime(240);
    });

    expect(revealControls).toHaveBeenCalledTimes(1);
    expect(onSingleTap).not.toHaveBeenCalled();
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('collapses an expanded caption when a single tap lands above the username info block', () => {
    const surface = document.createElement('div');
    const video = document.createElement('video');
    const infoBlock = document.createElement('div');
    const usernameRow = document.createElement('div');
    const contentWrapper = document.createElement('div');
    const expandedCaption = document.createElement('div');
    const lessButton = document.createElement('button');

    expandedCaption.className = 'max-h-[32vh] overflow-y-auto';
    lessButton.textContent = 'less';
    expandedCaption.appendChild(lessButton);
    contentWrapper.appendChild(expandedCaption);
    infoBlock.append(usernameRow, contentWrapper);
    surface.append(video, infoBlock);
    document.body.appendChild(surface);

    vi.spyOn(infoBlock, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 420,
      left: 0,
      top: 420,
      right: 300,
      bottom: 720,
      width: 300,
      height: 300,
      toJSON: () => ({}),
    });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => surface),
    });

    const collapse = vi.fn();
    lessButton.addEventListener('click', collapse);
    const onSingleTap = vi.fn();
    const onDoubleTap = vi.fn();
    const { result } = renderHook(() =>
      useVideoSurfaceTap({ onSingleTap, onDoubleTap, delay: 240 }),
    );

    act(() => {
      result.current.registerTap(150, 220);
      vi.advanceTimersByTime(240);
    });

    expect(collapse).toHaveBeenCalledTimes(1);
    expect(onSingleTap).not.toHaveBeenCalled();
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('keeps normal single-tap playback when the tap lands inside the expanded info block', () => {
    const surface = document.createElement('div');
    const video = document.createElement('video');
    const infoBlock = document.createElement('div');
    const contentWrapper = document.createElement('div');
    const expandedCaption = document.createElement('div');
    const lessButton = document.createElement('button');

    expandedCaption.className = 'max-h-[32vh] overflow-y-auto';
    expandedCaption.appendChild(lessButton);
    contentWrapper.appendChild(expandedCaption);
    infoBlock.appendChild(contentWrapper);
    surface.append(video, infoBlock);
    document.body.appendChild(surface);

    vi.spyOn(infoBlock, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 420,
      left: 0,
      top: 420,
      right: 300,
      bottom: 720,
      width: 300,
      height: 300,
      toJSON: () => ({}),
    });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => surface),
    });

    const collapse = vi.fn();
    lessButton.addEventListener('click', collapse);
    const onSingleTap = vi.fn();
    const onDoubleTap = vi.fn();
    const { result } = renderHook(() =>
      useVideoSurfaceTap({ onSingleTap, onDoubleTap, delay: 240 }),
    );

    act(() => {
      result.current.registerTap(150, 500);
      vi.advanceTimersByTime(240);
    });

    expect(collapse).not.toHaveBeenCalled();
    expect(onSingleTap).toHaveBeenCalledTimes(1);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });
});
