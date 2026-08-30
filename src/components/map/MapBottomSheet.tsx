import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export type MapSheetSnap = 'peek' | 'half' | 'full';

interface MapBottomSheetProps {
  snap: MapSheetSnap;
  onSnapChange: (snap: MapSheetSnap) => void;
  children: React.ReactNode;
  className?: string;
  onHeightChange?: (height: number) => void;
}

const MIN_PEEK = 112;

function snapHeights(viewportHeight: number) {
  const full = Math.max(420, Math.round(viewportHeight * 0.9));
  const half = Math.min(full - 80, Math.max(300, Math.round(viewportHeight * 0.54)));
  return {
    peek: MIN_PEEK,
    half,
    full,
  } satisfies Record<MapSheetSnap, number>;
}

function nearestSnap(height: number, heights: Record<MapSheetSnap, number>): MapSheetSnap {
  const entries = Object.entries(heights) as [MapSheetSnap, number][];
  return entries.reduce(
    (best, current) =>
      Math.abs(current[1] - height) < Math.abs(best[1] - height) ? current : best,
    entries[0],
  )[0];
}

/**
 * Yandex/Google Maps uslubidagi mobil bottom-sheet:
 * - tutqichni yuqori/pastga sudrash;
 * - tez swipe bo'lsa keyingi snap nuqtasiga o'tish;
 * - sekin qo'yib yuborilganda eng yaqin snapga yopishish;
 * - desktopda doim to'liq chap panel.
 */
export function MapBottomSheet({
  snap,
  onSnapChange,
  children,
  className,
  onHeightChange,
}: MapBottomSheetProps) {
  const isMobile = useIsMobile();
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight,
  );
  const heights = useMemo(() => snapHeights(viewportHeight), [viewportHeight]);
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
      Math.min(heights.full, current - velocityY * 220),
    );

    let next = nearestSnap(projected, heights);
    if (Math.abs(velocityY) > 0.55) {
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
        'absolute inset-x-0 bottom-0 z-[1150] flex min-h-0 flex-col overflow-hidden rounded-t-[28px] border-t border-border/50 bg-background/92 shadow-2xl backdrop-blur-2xl transition-[height] duration-300 ease-out',
        'md:inset-y-3 md:left-3 md:right-auto md:h-auto md:min-h-0 md:w-[376px] md:rounded-[24px] md:border md:border-border/45 md:bg-background/82 md:shadow-2xl md:ring-1 md:ring-white/10',
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
        aria-label="Xarita paneli balandligini o'zgartirish"
      >
        <span className="h-1.5 w-11 rounded-full bg-muted-foreground/35" />
      </button>
      <div className="min-h-0 flex-1 overflow-hidden overscroll-contain">{children}</div>
    </div>
  );
}

export default MapBottomSheet;
