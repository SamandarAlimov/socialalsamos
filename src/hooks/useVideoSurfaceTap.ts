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
 * Touch browsers (notably iOS Safari) dispatch `pointerleave` immediately after
 * `pointerup`. VideosPage intentionally calls `clearPending()` from its pointer
 * cleanup path, so without a tiny post-up guard that leave event cancels the
 * just-scheduled single tap and play/pause never fires on touch.
 *
 * This guard is deliberately much shorter than the double-tap window: it only
 * protects the browser's immediate post-pointerup cleanup event. A later
 * gesture can still cancel a pending single tap normally.
 */
const POST_POINTER_UP_CLEAR_GUARD_MS = 64;

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
  const lastRegisteredAtRef = useRef(0);

  const cancelTimer = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const clearPending = useCallback(() => {
    const hasJustCommittedTap = Boolean(
      timerRef.current &&
        lastTapRef.current &&
        Date.now() - lastRegisteredAtRef.current <= POST_POINTER_UP_CLEAR_GUARD_MS,
    );

    // Ignore the synthetic pointerleave that follows a successful touch
    // pointerup. This is the mobile play/pause regression guard.
    if (hasJustCommittedTap) return;

    cancelTimer();
    lastTapRef.current = null;
  }, [cancelTimer]);

  const registerTap = useCallback((clientX: number, clientY: number) => {
    const now = Date.now();
    const previous = lastTapRef.current;
    const isDouble = Boolean(
      previous &&
        now - previous.at <= delay + 80 &&
        Math.hypot(clientX - previous.x, clientY - previous.y) <= maxDistance,
    );

    if (isDouble) {
      cancelTimer();
      lastTapRef.current = null;
      lastRegisteredAtRef.current = 0;
      onDoubleTap();
      return;
    }

    // A new non-double tap supersedes any older pending tap.
    cancelTimer();
    lastTapRef.current = { x: clientX, y: clientY, at: now };
    lastRegisteredAtRef.current = now;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      lastTapRef.current = null;
      lastRegisteredAtRef.current = 0;
      onSingleTap();
    }, delay);
  }, [cancelTimer, delay, maxDistance, onDoubleTap, onSingleTap]);

  useEffect(() => () => {
    cancelTimer();
    lastTapRef.current = null;
    lastRegisteredAtRef.current = 0;
  }, [cancelTimer]);

  return { registerTap, clearPending };
}
