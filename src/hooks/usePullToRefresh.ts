import { useState, useCallback, useRef, useEffect } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

export function usePullToRefresh({ 
  onRefresh, 
  threshold = 80,
  disabled = false 
}: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const pullingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    // Only arm pull-to-refresh at the very top. Normal feed taps/scrolls
    // remain completely native.
    if (container.scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
      pullingRef.current = true;
    } else {
      startY.current = 0;
      pullingRef.current = false;
    }
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing || !pullingRef.current || startY.current === 0) return;
    
    const container = containerRef.current;
    if (!container || container.scrollTop > 0) {
      startY.current = 0;
      pullingRef.current = false;
      setPullDistance(0);
      return;
    }
    
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    
    if (diff > 0) {
      // Apply resistance
      const resistance = 0.5;
      setPullDistance(Math.min(diff * resistance, threshold * 1.5));
      
      if (diff > 10) {
        e.preventDefault();
      }
    }
  }, [disabled, isRefreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (disabled || isRefreshing) return;
    
    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    
    setPullDistance(0);
    startY.current = 0;
    pullingRef.current = false;
  }, [disabled, isRefreshing, onRefresh, pullDistance, threshold]);

  const handleTouchCancel = useCallback(() => {
    startY.current = 0;
    pullingRef.current = false;
    setPullDistance(0);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel]);

  const progress = Math.min(pullDistance / threshold, 1);

  return {
    containerRef,
    isRefreshing,
    pullDistance,
    progress,
  };
}
