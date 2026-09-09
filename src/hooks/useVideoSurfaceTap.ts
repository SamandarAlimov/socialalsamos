import { useCallback, useEffect, useRef } from 'react';

interface Point {
  x: number;
  y: number;
  at: number;
}

type DoubleTapZone = 'backward' | 'center' | 'forward';

interface UseVideoSurfaceTapOptions {
  onSingleTap: () => void;
  /** Center-zone double tap action (VideosPage uses this for like). */
  onDoubleTap: () => void;
  delay?: number;
  maxDistance?: number;
  seekSeconds?: number;
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

export function resolveVideoDoubleTapZone(
  clientX: number,
  surfaceLeft: number,
  surfaceWidth: number,
): DoubleTapZone {
  if (!Number.isFinite(surfaceWidth) || surfaceWidth <= 0) return 'center';
  const ratio = (clientX - surfaceLeft) / surfaceWidth;
  if (ratio < 1 / 3) return 'backward';
  if (ratio > 2 / 3) return 'forward';
  return 'center';
}

function findVideoSurfaceAt(clientX: number, clientY: number) {
  if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return null;

  let node = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  let depth = 0;

  while (node && node !== document.body && depth < 8) {
    if (node instanceof HTMLVideoElement) {
      const surface = node.parentElement;
      if (surface) return { surface, video: node };
    }

    const directVideo = Array.from(node.children).find(
      (child): child is HTMLVideoElement => child instanceof HTMLVideoElement,
    );
    if (directVideo) return { surface: node, video: directVideo };

    node = node.parentElement;
    depth += 1;
  }

  return null;
}

function isVideoWatchSurface(surface: HTMLElement) {
  return Boolean(surface.querySelector('button[aria-label="Videolarga qaytish"]'));
}

function revealVideoWatchControls(surface: HTMLElement) {
  surface.dispatchEvent(new Event('pointermove', { bubbles: true }));
}

function seekVideoBy(video: HTMLVideoElement, delta: number) {
  const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
  const target = duration === null
    ? Math.max(0, current + delta)
    : Math.min(duration, Math.max(0, current + delta));

  if (Math.abs(target - current) < 0.001) return false;
  video.currentTime = target;
  return true;
}

/**
 * Distinguishes single tap from double tap while preserving the richer Alsamos
 * video gesture model:
 * - regular Videos feed single tap: play/pause;
 * - YouTube-style VideoWatchPanel single tap: reveal controls without changing
 *   playback; play/pause remains an explicit controller action;
 * - double tap in left third: seek -10s (YouTube-style);
 * - double tap in center third: caller action (VideosPage = like);
 * - double tap in right third: seek +10s (YouTube-style).
 *
 * Long-press speed/pause is handled separately by the owning video surface and
 * is unaffected.
 */
export function useVideoSurfaceTap({
  onSingleTap,
  onDoubleTap,
  delay = 240,
  maxDistance = 56,
  seekSeconds = 10,
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

      const hit = findVideoSurfaceAt(clientX, clientY);
      if (!hit) {
        onDoubleTap();
        return;
      }

      const rect = hit.surface.getBoundingClientRect();
      const zone = resolveVideoDoubleTapZone(clientX, rect.left, rect.width);
      if (zone === 'backward') {
        seekVideoBy(hit.video, -Math.abs(seekSeconds));
        return;
      }
      if (zone === 'forward') {
        seekVideoBy(hit.video, Math.abs(seekSeconds));
        return;
      }

      onDoubleTap();
      return;
    }

    // A new non-double tap supersedes any older pending tap.
    cancelTimer();
    lastTapRef.current = { x: clientX, y: clientY, at: now };
    lastRegisteredAtRef.current = now;
    timerRef.current = setTimeout(() => {
      const point = lastTapRef.current;
      timerRef.current = null;
      lastTapRef.current = null;
      lastRegisteredAtRef.current = 0;

      if (point) {
        const hit = findVideoSurfaceAt(point.x, point.y);
        if (hit && isVideoWatchSurface(hit.surface)) {
          revealVideoWatchControls(hit.surface);
          return;
        }
      }

      onSingleTap();
    }, delay);
  }, [cancelTimer, delay, maxDistance, onDoubleTap, onSingleTap, seekSeconds]);

  useEffect(() => () => {
    cancelTimer();
    lastTapRef.current = null;
    lastRegisteredAtRef.current = 0;
  }, [cancelTimer]);

  return { registerTap, clearPending };
}
