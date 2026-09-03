import { useCallback, useEffect, useRef } from 'react';
import { useHapticFeedback } from './useHapticFeedback';
import { movedBeyondTouchTolerance } from '@/lib/touchGesture';

interface LongPressOptions {
  /** Telegramdagi kabi standart uzoq bosish vaqti (ms) */
  delay?: number;
  /** Barmoq shuncha px siljisa, uzoq bosish bekor qilinadi */
  moveTolerance?: number;
  onLongPress: (position: { x: number; y: number }) => void;
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * Telegramdagi uzoq bosish (long press) xatti-harakati:
 * - 400 ms bosib turilganda kontekst menyu / reaksiya paneli ochiladi
 * - haptic (tebranish) qaytarish beriladi
 * - barmoq siljisa yoki tez qo'yib yuborilsa, oddiy bosish sifatida qabul qilinadi
 * - brauzerning matn tanlash / nusxalash oynasi chiqmaydi
 */
export function useLongPress({
  delay = 400,
  moveTolerance = 10,
  onLongPress,
  onClick,
  disabled = false,
}: LongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const movedRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const { mediumTap } = useHapticFeedback();

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const start = useCallback(
    (x: number, y: number) => {
      if (disabled) return;
      firedRef.current = false;
      movedRef.current = false;
      startRef.current = { x, y };
      clear();
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        mediumTap();
        onLongPress({ x, y });
      }, delay);
    },
    [clear, delay, disabled, mediumTap, onLongPress]
  );

  const move = useCallback(
    (x: number, y: number) => {
      if (!timerRef.current) return;
      const dx = x - startRef.current.x;
      const dy = y - startRef.current.y;
      if (movedBeyondTouchTolerance(dx, dy, moveTolerance)) {
        movedRef.current = true;
        clear();
      }
    },
    [clear, moveTolerance]
  );

  const finish = useCallback(() => {
    const wasLongPress = firedRef.current;
    const didMove = movedRef.current;
    clear();
    firedRef.current = false;
    movedRef.current = false;
    if (!wasLongPress && !didMove && onClick) onClick();
  }, [clear, onClick]);

  return {
    handlers: {
      onTouchStart: (e: React.TouchEvent) =>
        start(e.touches[0].clientX, e.touches[0].clientY),
      onTouchMove: (e: React.TouchEvent) => move(e.touches[0].clientX, e.touches[0].clientY),
      onTouchEnd: finish,
      onTouchCancel: clear,
      onMouseDown: (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        start(e.clientX, e.clientY);
      },
      onMouseMove: (e: React.MouseEvent) => move(e.clientX, e.clientY),
      onMouseUp: finish,
      onMouseLeave: clear,
      // Uzoq bosishda brauzerning "nusxalash / tanlash" oynasi chiqmasligi uchun
      onContextMenu: (e: React.MouseEvent) => {
        if (window.matchMedia('(pointer: coarse)').matches) e.preventDefault();
      },
    },
    /** Uzoq bosish hozir sodir bo'ldimi (click'ni bekor qilish uchun) */
    didLongPress: () => firedRef.current,
    cancel: clear,
  };
}
