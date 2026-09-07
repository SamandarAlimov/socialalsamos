import { useCallback, useEffect, useRef } from 'react';

interface Point {
  x: number;
  y: number;
  at: number;
}

interface UseVideoSurfaceTapOptions {
  onSingleTap: () => void;
  onDoubleTap: () => void;
  delay?: number;
  maxDistance?: number;
}

/**
 * Distinguishes a deliberate single tap (play/pause) from a double tap (like).
 * Delaying the single tap by a fraction of a second prevents the first tap of a
 * double-tap from pausing the video and then immediately resuming it.
 */
export function useVideoSurfaceTap({
  onSingleTap,
  onDoubleTap,
  delay = 240,
  maxDistance = 56,
}: UseVideoSurfaceTapOptions) {
  const lastTapRef = useRef<Point | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const registerTap = useCallback((clientX: number, clientY: number) => {
    const now = Date.now();
    const previous = lastTapRef.current;
    const isDouble = Boolean(
      previous &&
        now - previous.at <= delay + 80 &&
        Math.hypot(clientX - previous.x, clientY - previous.y) <= maxDistance,
    );

    if (isDouble) {
      clearPending();
      lastTapRef.current = null;
      onDoubleTap();
      return;
    }

    lastTapRef.current = { x: clientX, y: clientY, at: now };
    clearPending();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      lastTapRef.current = null;
      onSingleTap();
    }, delay);
  }, [clearPending, delay, maxDistance, onDoubleTap, onSingleTap]);

  useEffect(() => clearPending, [clearPending]);

  return { registerTap, clearPending };
}
