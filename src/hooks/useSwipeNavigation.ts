import { useCallback, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const SWIPE_THRESHOLD = 80;
const SWIPE_VELOCITY_THRESHOLD = 0.3;

// Define navigation order for swipe
const NAVIGATION_ORDER = ['/home', '/messages', '/create', '/videos', '/profile'];

export function useSwipeNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const getCurrentIndex = useCallback(() => {
    return NAVIGATION_ORDER.indexOf(location.pathname);
  }, [location.pathname]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startTime.current = Date.now();
    isHorizontalSwipe.current = null;
    setIsSwiping(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isSwiping) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - startX.current;
    const diffY = currentY - startY.current;
    
    // Determine if this is a horizontal swipe (only once per gesture)
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
        isHorizontalSwipe.current = Math.abs(diffX) > Math.abs(diffY);
      }
    }
    
    if (isHorizontalSwipe.current) {
      const currentIndex = getCurrentIndex();
      const canSwipeRight = currentIndex > 0;
      const canSwipeLeft = currentIndex < NAVIGATION_ORDER.length - 1 && currentIndex >= 0;
      
      // Limit swipe if at edges
      if ((diffX > 0 && !canSwipeRight) || (diffX < 0 && !canSwipeLeft)) {
        setSwipeOffset(diffX * 0.2); // Reduced resistance at edges
      } else {
        setSwipeOffset(diffX * 0.5); // Normal swipe with some resistance
      }
    }
  }, [isSwiping, getCurrentIndex]);

  const handleTouchEnd = useCallback(() => {
    if (!isSwiping) return;
    
    const endTime = Date.now();
    const duration = endTime - startTime.current;
    const velocity = Math.abs(swipeOffset) / duration;
    
    const currentIndex = getCurrentIndex();
    
    if (isHorizontalSwipe.current && currentIndex >= 0) {
      const shouldNavigate = Math.abs(swipeOffset) > SWIPE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD;
      
      if (shouldNavigate) {
        if (swipeOffset > 0 && currentIndex > 0) {
          // Swipe right - go to previous page
          navigate(NAVIGATION_ORDER[currentIndex - 1]);
        } else if (swipeOffset < 0 && currentIndex < NAVIGATION_ORDER.length - 1) {
          // Swipe left - go to next page
          navigate(NAVIGATION_ORDER[currentIndex + 1]);
        }
      }
    }
    
    setSwipeOffset(0);
    setIsSwiping(false);
    isHorizontalSwipe.current = null;
  }, [isSwiping, swipeOffset, getCurrentIndex, navigate]);

  return {
    swipeOffset,
    isSwiping,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
