import { useState, useRef, useCallback } from 'react';
import { useHapticFeedback } from './useHapticFeedback';
import { resolveTouchAxis, type TouchAxis } from '@/lib/touchGesture';

interface SwipeToReplyOptions {
  /** Javob berish uchun kerakli masofa (Telegramda ~50-60px) */
  threshold?: number;
  /** Maksimal siljish */
  maxSwipe?: number;
  /** O'chirib qo'yish (masalan, o'chirilgan xabarlar uchun) */
  disabled?: boolean;
  onReply: () => void;
}

/**
 * Telegramdagidek o'ngga surib javob berish.
 * - Vertikal scroll bilan urushmaydi: avval yo'nalish aniqlanadi.
 * - Barmoq/sichqoncha (pointer) bilan ham ishlaydi.
 * - Qo'yib yuborilganda spring bilan joyiga qaytadi (rubber-band).
 */
export function useSwipeToReply({
  threshold = 56,
  maxSwipe = 88,
  disabled = false,
  onReply,
}: SwipeToReplyOptions) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<TouchAxis>('unknown');
  const hasTriggered = useRef(false);
  const { mediumTap, successFeedback } = useHapticFeedback();

  const reset = useCallback(() => {
    setOffset(0);
    setIsDragging(false);
    axis.current = 'unknown';
    hasTriggered.current = false;
  }, []);

  const begin = useCallback(
    (x: number, y: number) => {
      if (disabled) return;
      startX.current = x;
      startY.current = y;
      axis.current = 'unknown';
      hasTriggered.current = false;
      setIsDragging(true);
    },
    [disabled]
  );

  const move = useCallback(
    (x: number, y: number) => {
      if (disabled || !isDragging) return;

      const dx = x - startX.current;
      const dy = y - startY.current;

      // Yo'nalishni bir marta aniqlaymiz: vertikal bo'lsa native scroll yutadi.
      if (axis.current === 'unknown') {
        axis.current = resolveTouchAxis(dx, dy, { threshold: 8 });
        if (axis.current === 'unknown') return;
      }
      if (axis.current !== 'horizontal') {
        setIsDragging(false);
        return;
      }

      if (dx <= 0) {
        setOffset(0);
        return;
      }

      // Rubber-band: threshold'dan keyin qarshilik oshadi
      const eased =
        dx <= threshold ? dx : threshold + (dx - threshold) * 0.35;
      const next = Math.min(eased, maxSwipe);
      setOffset(next);

      if (next >= threshold && !hasTriggered.current) {
        hasTriggered.current = true;
        mediumTap();
      } else if (next < threshold && hasTriggered.current) {
        hasTriggered.current = false;
      }
    },
    [disabled, isDragging, maxSwipe, threshold, mediumTap]
  );

  const end = useCallback(() => {
    if (!disabled && offset >= threshold) {
      successFeedback();
      onReply();
    }
    reset();
  }, [disabled, offset, threshold, onReply, successFeedback, reset]);

  const swipeHandlers = {
    onTouchStart: (e: React.TouchEvent) => begin(e.touches[0].clientX, e.touches[0].clientY),
    onTouchMove: (e: React.TouchEvent) => move(e.touches[0].clientX, e.touches[0].clientY),
    onTouchEnd: end,
    onTouchCancel: reset,
  };

  /** Sichqoncha/stylus bilan ham surish (desktop) */
  const pointerHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'touch') return; // touch handlerlari bor
      begin(e.clientX, e.clientY);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType === 'touch') return;
      move(e.clientX, e.clientY);
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (e.pointerType === 'touch') return;
      end();
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === 'touch') return;
      reset();
    },
  };

  const isReadyToReply = offset >= threshold;

  return {
    offset,
    isDragging,
    isReadyToReply,
    swipeHandlers,
    pointerHandlers,
    /** Bubble uchun tayyor style: sudrash paytida animatsiya o'chadi, qo'yib yuborilganda spring */
    swipeStyle: {
      transform: `translateX(${offset}px)`,
      transition: isDragging ? 'none' : 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)',
    } as React.CSSProperties,
  };
}
