import { useState, useRef, useCallback } from 'react';
import { useHapticFeedback } from './useHapticFeedback';

interface SwipeToReplyOptions {
  threshold?: number;
  maxSwipe?: number;
  onReply: () => void;
}

export function useSwipeToReply({ 
  threshold = 60, 
  maxSwipe = 100,
  onReply 
}: SwipeToReplyOptions) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const hasTriggered = useRef(false);
  const { mediumTap, successFeedback } = useHapticFeedback();

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    hasTriggered.current = false;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX.current;
    
    // Only allow right swipe (for reply)
    if (diff > 0) {
      const newOffset = Math.min(diff, maxSwipe);
      setOffset(newOffset);
      
      // Trigger haptic when crossing threshold
      if (newOffset >= threshold && !hasTriggered.current) {
        hasTriggered.current = true;
        mediumTap();
      } else if (newOffset < threshold && hasTriggered.current) {
        hasTriggered.current = false;
      }
    }
  }, [isDragging, maxSwipe, threshold, mediumTap]);

  const handleTouchEnd = useCallback(() => {
    if (offset >= threshold) {
      successFeedback();
      onReply();
    }
    setOffset(0);
    setIsDragging(false);
  }, [offset, threshold, onReply, successFeedback]);

  const swipeHandlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };

  const isReadyToReply = offset >= threshold;

  return {
    offset,
    isDragging,
    isReadyToReply,
    swipeHandlers,
  };
}
