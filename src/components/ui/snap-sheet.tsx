import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

/**
 * Platformadagi yagona "snap sheet" qatlami.
 *
 * Xarita paneli (MapBottomSheet) shu komponent ustiga qurilgan va create
 * oqimi ham aynan shu xatti-harakatni ishlatadi: mobil qurilmada tutqichni
 * sudrab peek/half/full holatlariga o'tish, desktopda esa chapdagi shisha
 * panel. Dizayn tokenlari bir joyda turgani uchun map va create bir-biridan
 * ajralib ketmaydi.
 */

export type SnapSheetSnap = 'peek' | 'half' | 'full';

/** Panel yopilganda ham ko'rinib turadigan minimal balandlik (px). */
export const SNAP_SHEET_MIN_PEEK = 112;

/** Shu tezlikdan (px/ms) oshsa, eng yaqin snap emas, keyingi snap tanlanadi. */
export const SNAP_SHEET_FLICK_VELOCITY = 0.55;

/** Qo'yib yuborilgandan keyin harakat qancha vaqtga (ms) proyeksiya qilinadi. */
const PROJECTION_MS = 220;

/** Mobil holatdagi shisha sirt: pastdan chiqadigan sheet. */
export const SNAP_SHEET_MOBILE_SURFACE =
  'absolute inset-x-0 bottom-0 z-[1150] flex min-h-0 flex-col overflow-hidden rounded-t-[28px] border-t border-border/50 bg-background/92 shadow-2xl backdrop-blur-2xl transition-[height] duration-300 ease-out';

/** Desktop holatdagi shisha sirt: chapdagi qat'iy kenglikdagi panel. */
export const SNAP_SHEET_DESKTOP_SURFACE =
  'md:inset-y-3 md:left-3 md:right-auto md:h-auto md:min-h-0 md:w-[376px] md:rounded-[24px] md:border md:border-border/45 md:bg-background/82 md:shadow-2xl md:ring-1 md:ring-white/10';

export interface SnapSheetProps {
  snap: SnapSheetSnap;
  onSnapChange: (snap: SnapSheetSnap) => void;
  children: React.ReactNode;
  /** Tashqi sirtga qo'shiladigan sinflar. */
  className?: string;
  /** Ichki kontent o'ramiga qo'shiladigan sinflar. */
  contentClassName?: string;
  /** Mobil balandlik o'zgarganda chaqiriladi (masalan xarita markazini surish uchun). */
  onHeightChange?: (height: number) => void;
  /** Peek holatidagi balandlikni moslashtirish. */
  minPeek?: number;
  /** Tutqich uchun ekran o'qiydigan matn. */
  grabberLabel?: string;
}

/** Viewport balandligiga qarab uchta snap nuqtasini hisoblaydi. */
export function snapSheetHeights(
  viewportHeight: number,
  minPeek: number = SNAP_SHEET_MIN_PEEK,
) {
  const full = Math.max(420, Math.round(viewportHeight * 0.9));
  const half = Math.min(full - 80, Math.max(300, Math.round(viewportHeight * 0.54)));
  return {
    peek: minPeek,
    half,
    full,
  } satisfies Record<SnapSheetSnap, number>;
}

/** Berilgan balandlikka eng yaqin snap nuqtasini qaytaradi. */
export function nearestSnapSheetSnap(
  height: number,
  heights: Record<SnapSheetSnap, number>,
): SnapSheetSnap {
  const entries = Object.entries(heights) as [SnapSheetSnap, number][];
  return entries.reduce(
    (best, current) =>
      Math.abs(current[1] - height) < Math.abs(best[1] - height) ? current : best,
    entries[0],
  )[0];
}

export function SnapSheet({
  snap,
  onSnapChange,
  children,
  className,
  contentClassName,
  onHeightChange,
  minPeek = SNAP_SHEET_MIN_PEEK,
  grabberLabel = "Panel balandligini o'zgartirish",
}: SnapSheetProps) {
  const isMobile = useIsMobile();
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight,
  );
  const heights = useMemo(
    () => snapSheetHeights(viewportHeight, minPeek),
    [viewportHeight, minPeek],
  );
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    startedAt: number;
    lastY: number;
    lastAt: number;
  } | null>(null);

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);

  const visualHeight = dragHeight ?? heights[snap];

  useEffect(() => {
    if (isMobile) onHeightChange?.(visualHeight);
  }, [isMobile, visualHeight, onHeightChange]);

  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isMobile) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const now = performance.now();
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: heights[snap],
      startedAt: now,
      lastY: event.clientY,
      lastAt: now,
    };
    setDragHeight(heights[snap]);
  };

  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - drag.startY;
    const next = Math.max(heights.peek, Math.min(heights.full, drag.startHeight - deltaY));
    drag.lastY = event.clientY;
    drag.lastAt = performance.now();
    setDragHeight(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const now = performance.now();
    const current = dragHeight ?? heights[snap];
    const elapsed = Math.max(16, now - drag.startedAt);
    const velocityY = (event.clientY - drag.startY) / elapsed; // px/ms
    const projected = Math.max(
      heights.peek,
      Math.min(heights.full, current - velocityY * PROJECTION_MS),
    );

    let next = nearestSnapSheetSnap(projected, heights);
    if (Math.abs(velocityY) > SNAP_SHEET_FLICK_VELOCITY) {
      if (velocityY < 0) {
        next = snap === 'peek' ? 'half' : 'full';
      } else {
        next = snap === 'full' ? 'half' : 'peek';
      }
    }

    dragRef.current = null;
    setDragHeight(null);
    onSnapChange(next);
  };

  const cycleSnap = () => {
    onSnapChange(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'half');
  };

  return (
    <div
      className={cn(
        SNAP_SHEET_MOBILE_SURFACE,
        SNAP_SHEET_DESKTOP_SURFACE,
        // Sudrab turganda balandlik animatsiyasi barmoqdan orqada qolmasligi kerak.
        dragHeight != null && 'transition-none',
        className,
      )}
      style={isMobile ? { height: visualHeight } : undefined}
    >
      <button
        type="button"
        onClick={cycleSnap}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex h-7 w-full shrink-0 touch-none items-center justify-center bg-transparent md:hidden"
        aria-label={grabberLabel}
      >
        <span className="h-1.5 w-11 rounded-full bg-muted-foreground/35" />
      </button>
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain',
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export default SnapSheet;
