import { useCallback, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { resolveTouchAxis, type TouchAxis } from '@/lib/touchGesture';

const SWIPE_THRESHOLD = 80;
const SWIPE_VELOCITY_THRESHOLD = 0.3;

// Default mobile page navigation order.
const NAVIGATION_ORDER = ['/home', '/messages', '/create', '/videos', '/profile'];

// Product-level gestures that intentionally override the sequential order.
// On Home, a left-to-right swipe opens creation, matching the camera/create
// gesture users expect from modern social apps.
const RIGHT_SWIPE_OVERRIDES: Record<string, string> = {
  '/home': '/create',
};

// Create is an immersive destination rather than a sequential feed tab.
// Mirroring the Home -> Create gesture, a right-to-left swipe from Create
// returns directly to Home instead of continuing to Videos.
const LEFT_SWIPE_OVERRIDES: Record<string, string> = {
  '/create': '/home',
};

interface SwipeNavigationOptions {
  /**
   * Prevent a page swipe from stealing a gesture that started on controls.
   * Create uses this because its canvas contains editors, sliders and pickers.
   */
  ignoreInteractiveTargets?: boolean;
  /** Enable finger movement from left to right. Defaults to true. */
  allowRightSwipe?: boolean;
  /** Enable finger movement from right to left. Defaults to true. */
  allowLeftSwipe?: boolean;
  /**
   * Publish every horizontal drag offset to React state for live translation.
   * Set false on heavy/scrollable creation surfaces: the gesture still
   * navigates on release, but media editors are not re-rendered every frame.
   */
  trackSwipeOffset?: boolean;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  return Boolean(
    target.closest(
      'button, a, input, textarea, select, [role="button"], [role="slider"], [contenteditable="true"], [data-swipe-navigation="ignore"]',
    ),
  );
}

/**
 * Mobile page navigation gesture.
 *
 * Muhim qoida: oddiy tap yoki vertikal scroll React state'ni o'zgartirmaydi.
 * Horizontal gesture faqat yo'nalish aniq bo'lgandan keyin aktivlashadi.
 * Bu mobile Safari/Chrome inertial scroll'ini card ustidagi tapdan keyin
 * "qamalib" qolishidan saqlaydi.
 */
export function useSwipeNavigation(options: SwipeNavigationOptions = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const intent = useRef<TouchAxis>('unknown');
  const offsetRef = useRef(0);
  const gestureBlocked = useRef(false);

  const allowRightSwipe = options.allowRightSwipe ?? true;
  const allowLeftSwipe = options.allowLeftSwipe ?? true;
  const ignoreInteractiveTargets = options.ignoreInteractiveTargets ?? false;
  const trackSwipeOffset = options.trackSwipeOffset ?? true;

  const getCurrentIndex = useCallback(() => {
    return NAVIGATION_ORDER.indexOf(location.pathname);
  }, [location.pathname]);

  const getRightSwipeDestination = useCallback(() => {
    return RIGHT_SWIPE_OVERRIDES[location.pathname] ?? null;
  }, [location.pathname]);

  const getLeftSwipeDestination = useCallback(() => {
    return LEFT_SWIPE_OVERRIDES[location.pathname] ?? null;
  }, [location.pathname]);

  const resetGesture = useCallback(() => {
    intent.current = 'unknown';
    gestureBlocked.current = false;
    offsetRef.current = 0;
    setSwipeOffset((current) => (current === 0 ? current : 0));
    setIsSwiping((current) => (current ? false : current));
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;

    gestureBlocked.current =
      ignoreInteractiveTargets && isInteractiveTarget(e.target);

    startX.current = touch.clientX;
    startY.current = touch.clientY;
    startTime.current = Date.now();
    intent.current = 'unknown';
    offsetRef.current = 0;

    // Tap/vertical scroll paytida render qilmaymiz.
    if (isSwiping) setIsSwiping(false);
    if (trackSwipeOffset && swipeOffset !== 0) setSwipeOffset(0);
  }, [ignoreInteractiveTargets, isSwiping, swipeOffset, trackSwipeOffset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (gestureBlocked.current) return;

    const touch = e.touches[0];
    if (!touch) return;

    const diffX = touch.clientX - startX.current;
    const diffY = touch.clientY - startY.current;

    if (intent.current === 'unknown') {
      intent.current = resolveTouchAxis(diffX, diffY, { threshold: 12 });
      if (intent.current === 'unknown') return;

      // Vertikal intent har doim native scrollga topshiriladi.
      if (intent.current === 'vertical') return;

      setIsSwiping(true);
    }

    if (intent.current !== 'horizontal') return;

    const currentIndex = getCurrentIndex();
    const canSwipeRight =
      allowRightSwipe &&
      (Boolean(getRightSwipeDestination()) || currentIndex > 0);
    const canSwipeLeft =
      allowLeftSwipe &&
      (Boolean(getLeftSwipeDestination()) ||
        (currentIndex < NAVIGATION_ORDER.length - 1 && currentIndex >= 0));

    const nextOffset =
      (diffX > 0 && !canSwipeRight) || (diffX < 0 && !canSwipeLeft)
        ? diffX * 0.2
        : diffX * 0.5;

    // Navigation always uses the ref. Heavy pages can opt out of React state
    // updates while the finger is moving to keep camera/video surfaces stable.
    offsetRef.current = nextOffset;
    if (trackSwipeOffset) setSwipeOffset(nextOffset);
  }, [
    allowLeftSwipe,
    allowRightSwipe,
    getCurrentIndex,
    getLeftSwipeDestination,
    getRightSwipeDestination,
    trackSwipeOffset,
  ]);

  const handleTouchEnd = useCallback(() => {
    if (gestureBlocked.current) {
      resetGesture();
      return;
    }

    const currentOffset = offsetRef.current;
    const currentIndex = getCurrentIndex();

    if (intent.current === 'horizontal' && currentIndex >= 0) {
      const duration = Math.max(Date.now() - startTime.current, 1);
      const velocity = Math.abs(currentOffset) / duration;
      const shouldNavigate =
        Math.abs(currentOffset) > SWIPE_THRESHOLD ||
        velocity > SWIPE_VELOCITY_THRESHOLD;

      if (shouldNavigate) {
        if (currentOffset > 0 && allowRightSwipe) {
          const overrideDestination = getRightSwipeDestination();
          if (overrideDestination) {
            navigate(overrideDestination);
          } else if (currentIndex > 0) {
            navigate(NAVIGATION_ORDER[currentIndex - 1]);
          }
        } else if (currentOffset < 0 && allowLeftSwipe) {
          const overrideDestination = getLeftSwipeDestination();
          if (overrideDestination) {
            navigate(overrideDestination);
          } else if (currentIndex < NAVIGATION_ORDER.length - 1) {
            navigate(NAVIGATION_ORDER[currentIndex + 1]);
          }
        }
      }
    }

    resetGesture();
  }, [
    allowLeftSwipe,
    allowRightSwipe,
    getCurrentIndex,
    getLeftSwipeDestination,
    getRightSwipeDestination,
    navigate,
    resetGesture,
  ]);

  const handleTouchCancel = useCallback(() => {
    resetGesture();
  }, [resetGesture]);

  return {
    swipeOffset,
    isSwiping,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  };
}
