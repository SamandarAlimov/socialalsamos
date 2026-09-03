import { useCallback, useEffect, useRef, useState } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

function findVerticalScrollParent(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null;

  while (current) {
    if (current.dataset.platformScrollRoot === 'true') return current;

    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    if (
      overflowY === 'auto' ||
      overflowY === 'scroll' ||
      overflowY === 'overlay'
    ) {
      return current;
    }
    current = current.parentElement;
  }

  const scrollingElement = document.scrollingElement;
  return scrollingElement instanceof HTMLElement ? scrollingElement : document.documentElement;
}

function scrollTopOf(node: HTMLElement | null): number {
  if (!node) return window.scrollY || document.documentElement.scrollTop || 0;
  if (node === document.documentElement || node === document.body) {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }
  return node.scrollTop;
}

/**
 * Pull-to-refresh platform policy:
 * - wrapper itself NEVER becomes a second scroll container;
 * - it attaches to the nearest existing vertical scroller (normally AppLayout main);
 * - native vertical scrolling wins unless the page is already at top and the
 *   finger is clearly pulling downward;
 * - touchcancel always releases the gesture.
 *
 * This avoids nested-scroller momentum locks on mobile Safari/Chromium.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  disabled = false,
}: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const startY = useRef(0);
  const pullingRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const pullDistanceRef = useRef(0);

  const resetGesture = useCallback(() => {
    startY.current = 0;
    pullingRef.current = false;
    pullDistanceRef.current = 0;
    setPullDistance(0);
  }, []);

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      if (disabled || isRefreshing) return;

      const touch = event.touches[0];
      if (!touch) return;

      const root = scrollRootRef.current;
      if (scrollTopOf(root) <= 0) {
        startY.current = touch.clientY;
        pullingRef.current = true;
      } else {
        resetGesture();
      }
    },
    [disabled, isRefreshing, resetGesture],
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      if (
        disabled ||
        isRefreshing ||
        !pullingRef.current ||
        startY.current === 0
      ) {
        return;
      }

      const root = scrollRootRef.current;
      if (scrollTopOf(root) > 0) {
        resetGesture();
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;

      const diff = touch.clientY - startY.current;

      // Finger went upward/sideways: native page scroll owns the gesture.
      if (diff <= 0) {
        resetGesture();
        return;
      }

      // Small movement stays native. We only take ownership after clear pull intent.
      if (diff <= 10) return;

      const resistance = 0.5;
      const next = Math.min(diff * resistance, threshold * 1.5);
      pullDistanceRef.current = next;
      setPullDistance(next);

      // Only a real top-edge pull is cancelled from browser scrolling.
      event.preventDefault();
    },
    [disabled, isRefreshing, resetGesture, threshold],
  );

  const finishGesture = useCallback(async () => {
    if (disabled || isRefreshing) {
      resetGesture();
      return;
    }

    const shouldRefresh = pullDistanceRef.current >= threshold;
    resetGesture();

    if (!shouldRefresh) return;

    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [disabled, isRefreshing, onRefresh, resetGesture, threshold]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const scrollRoot = findVerticalScrollParent(wrapper);
    scrollRootRef.current = scrollRoot;

    // Listen on the wrapper: only this page's content can arm PTR. Scroll position
    // is read from the real parent scroller, so no nested overflow container exists.
    wrapper.addEventListener('touchstart', handleTouchStart, { passive: true });
    wrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
    wrapper.addEventListener('touchend', finishGesture, { passive: true });
    wrapper.addEventListener('touchcancel', resetGesture, { passive: true });

    return () => {
      wrapper.removeEventListener('touchstart', handleTouchStart);
      wrapper.removeEventListener('touchmove', handleTouchMove);
      wrapper.removeEventListener('touchend', finishGesture);
      wrapper.removeEventListener('touchcancel', resetGesture);
      scrollRootRef.current = null;
    };
  }, [finishGesture, handleTouchMove, handleTouchStart, resetGesture]);

  const progress = Math.min(pullDistance / threshold, 1);

  return {
    containerRef: wrapperRef,
    isRefreshing,
    pullDistance,
    progress,
  };
}
