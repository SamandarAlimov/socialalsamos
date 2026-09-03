import { useCallback, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { resolveTouchAxis, type TouchAxis } from '@/lib/touchGesture';

const SWIPE_THRESHOLD = 80;
const SWIPE_VELOCITY_THRESHOLD = 0.3;
// Define navigation order for swipe
const NAVIGATION_ORDER = ['/home', '/messages', '/create', '/videos', '/profile'];

/**
 * Mobile page navigation gesture.
 *
 * Muhim qoida: oddiy tap yoki vertikal scroll React state'ni o'zgartirmaydi.
 * Horizontal gesture faqat yo'nalish aniq bo'lgandan keyin aktivlashadi.
 * Bu mobile Safari/Chrome inertial scroll'ini card ustidagi tapdan keyin
 * "qamalib" qolishidan saqlaydi.
 */
export function useSwipeNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const intent = useRef<TouchAxis>('unknown');
  const offsetRef = useRef(0);

  const getCurrentIndex = useCallback(() => {
    return NAVIGATION_ORDER.indexOf(location.pathname);
  }, [location.pathname]);

  const resetGesture = useCallback(() => {
    intent.current = 'unknown';
    offsetRef.current = 0;
    setSwipeOffset(0);
    setIsSwiping(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;

    startX.current = touch.clientX;
    startY.current = touch.clientY;
    startTime.current = Date.now();
    intent.current = 'unknown';
    offsetRef.current = 0;

    // Tap/vertical scroll paytida render qilmaymiz.
    if (isSwiping) setIsSwiping(false);
    if (swipeOffset !== 0) setSwipeOffset(0);
  }, [isSwiping, swipeOffset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
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
    const canSwipeRight = currentIndex > 0;
    const canSwipeLeft =
      currentIndex < NAVIGATION_ORDER.length - 1 && currentIndex >= 0;

    const nextOffset =
      (diffX > 0 && !canSwipeRight) || (diffX < 0 && !canSwipeLeft)
        ? diffX * 0.2
        : diffX * 0.5;

    offsetRef.current = nextOffset;
    setSwipeOffset(nextOffset);
  }, [getCurrentIndex]);

  const handleTouchEnd = useCallback(() => {
    const currentOffset = offsetRef.current;
    const currentIndex = getCurrentIndex();

    if (intent.current === 'horizontal' && currentIndex >= 0) {
      const duration = Math.max(Date.now() - startTime.current, 1);
      const velocity = Math.abs(currentOffset) / duration;
      const shouldNavigate =
        Math.abs(currentOffset) > SWIPE_THRESHOLD ||
        velocity > SWIPE_VELOCITY_THRESHOLD;

      if (shouldNavigate) {
        if (currentOffset > 0 && currentIndex > 0) {
          navigate(NAVIGATION_ORDER[currentIndex - 1]);
        } else if (
          currentOffset < 0 &&
          currentIndex < NAVIGATION_ORDER.length - 1
        ) {
          navigate(NAVIGATION_ORDER[currentIndex + 1]);
        }
      }
    }

    resetGesture();
  }, [getCurrentIndex, navigate, resetGesture]);

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
