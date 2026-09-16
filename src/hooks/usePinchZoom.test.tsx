import type React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePinchZoom } from './usePinchZoom';

describe('usePinchZoom', () => {
  it('allows a zoomed desktop video to be panned with the mouse', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 200,
      width: 300,
      height: 200,
      toJSON: () => ({}),
    });
    Object.defineProperty(container, 'setPointerCapture', { configurable: true, value: vi.fn() });
    Object.defineProperty(container, 'hasPointerCapture', { configurable: true, value: vi.fn(() => true) });
    Object.defineProperty(container, 'releasePointerCapture', { configurable: true, value: vi.fn() });

    const targetRef = { current: container } as React.RefObject<HTMLDivElement>;
    const { result } = renderHook(() => usePinchZoom(2.5, 1, targetRef));

    act(() => {
      result.current.handlers.onWheel({
        ctrlKey: true,
        deltaY: -100,
        clientX: 150,
        clientY: 100,
        preventDefault: vi.fn(),
      } as unknown as React.WheelEvent);
    });
    expect(result.current.isZoomed).toBe(true);

    act(() => {
      result.current.handlers.onPointerDown({
        pointerType: 'mouse',
        pointerId: 7,
        button: 0,
        clientX: 150,
        clientY: 100,
        currentTarget: container,
        preventDefault: vi.fn(),
      } as unknown as React.PointerEvent);
      result.current.handlers.onPointerMove({
        pointerType: 'mouse',
        pointerId: 7,
        clientX: 180,
        clientY: 120,
        currentTarget: container,
        preventDefault: vi.fn(),
      } as unknown as React.PointerEvent);
    });

    expect(result.current.translateX).toBeGreaterThan(0);
    expect(result.current.translateY).toBeGreaterThan(0);

    act(() => {
      result.current.handlers.onPointerUp({
        pointerType: 'mouse',
        pointerId: 7,
        currentTarget: container,
      } as unknown as React.PointerEvent);
    });
  });
});
