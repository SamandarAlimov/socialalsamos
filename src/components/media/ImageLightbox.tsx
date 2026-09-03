import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { UI_LAYER } from '@/lib/uiLayers';
import { cn } from '@/lib/utils';

export interface ImageLightboxItem {
  url: string;
  alt?: string | null;
  name?: string | null;
  caption?: string | null;
}

interface ImageLightboxProps {
  open: boolean;
  images: ImageLightboxItem[];
  initialIndex?: number;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function touchDistance(touches: React.TouchList) {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

/**
 * Platformadagi canonical fullscreen image viewer.
 *
 * Browser/page zoom bilan raqobat qilmaydi:
 * - wheel / Ctrl+wheel viewer ichida image zoom bo'ladi;
 * - pinch viewer ichida scale qiladi;
 * - zoom qilinganda drag/pan ishlaydi;
 * - double click, +/-/0, arrows va Escape keyboard shortcutlari mavjud.
 */
export function ImageLightbox({
  open,
  images,
  initialIndex = 0,
  onClose,
}: ImageLightboxProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const touchRef = useRef<{
    initialDistance: number;
    initialScale: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const safeInitialIndex = Math.max(
    0,
    Math.min(initialIndex, Math.max(0, images.length - 1)),
  );

  const [index, setIndex] = useState(safeInitialIndex);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const current = images[index] ?? null;
  const hasMultiple = images.length > 1;

  const resetTransform = useCallback(() => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  const clampOffset = useCallback(
    (x: number, y: number, nextScale = scale) => {
      const node = stageRef.current;
      if (!node || nextScale <= 1) return { x: 0, y: 0 };

      const rect = node.getBoundingClientRect();
      const maxX = (rect.width * (nextScale - 1)) / 2;
      const maxY = (rect.height * (nextScale - 1)) / 2;

      return {
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y)),
      };
    },
    [scale],
  );

  const setZoom = useCallback(
    (next: number) => {
      const nextScale = clampScale(next);
      setScale(nextScale);
      if (nextScale <= 1) {
        setOffset({ x: 0, y: 0 });
      } else {
        setOffset((currentOffset) =>
          clampOffset(currentOffset.x, currentOffset.y, nextScale),
        );
      }
    },
    [clampOffset],
  );

  const goPrevious = useCallback(() => {
    if (!images.length) return;
    setIndex((currentIndex) =>
      (currentIndex - 1 + images.length) % images.length,
    );
  }, [images.length]);

  const goNext = useCallback(() => {
    if (!images.length) return;
    setIndex((currentIndex) => (currentIndex + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    if (!open) return;
    setIndex(safeInitialIndex);
    resetTransform();
  }, [open, safeInitialIndex, resetTransform]);

  useEffect(() => {
    if (!open) return;
    resetTransform();
  }, [index, open, resetTransform]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      const zoomKey =
        event.key === '+' ||
        event.key === '=' ||
        event.key === '-' ||
        event.key === '0';

      if ((event.ctrlKey || event.metaKey) && zoomKey) {
        event.preventDefault();
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowLeft' && hasMultiple) {
        event.preventDefault();
        goPrevious();
      } else if (event.key === 'ArrowRight' && hasMultiple) {
        event.preventDefault();
        goNext();
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setZoom(scale + 0.25);
      } else if (event.key === '-') {
        event.preventDefault();
        setZoom(scale - 0.25);
      } else if (event.key === '0') {
        event.preventDefault();
        resetTransform();
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        setRotation((value) => (value + 90) % 360);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    goNext,
    goPrevious,
    hasMultiple,
    onClose,
    open,
    resetTransform,
    scale,
    setZoom,
  ]);

  // Native non-passive listener is deliberate: Chrome reports touchpad pinch
  // as Ctrl+wheel. Preventing default here keeps the browser page at 100%.
  useEffect(() => {
    if (!open) return;
    const node = stageRef.current;
    if (!node) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const step = event.deltaY < 0 ? 0.18 : -0.18;
      setZoom(scale + step);
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [open, scale, setZoom]);

  const handleDownload = useCallback(async () => {
    if (!current?.url) return;

    try {
      const response = await fetch(current.url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download =
        current.name ||
        current.url.split('/').pop()?.split('?')[0] ||
        'alsamos-image';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(current.url, '_blank', 'noopener,noreferrer');
    }
  }, [current]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (scale <= 1) return;
    event.preventDefault();
    event.stopPropagation();

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || scale <= 1) return;

    event.preventDefault();
    const next = clampOffset(
      drag.originX + event.clientX - drag.startX,
      drag.originY + event.clientY - drag.startY,
    );
    setOffset(next);
  };

  const releasePointer = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
    }
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length >= 2) {
      event.preventDefault();
      touchRef.current = {
        initialDistance: touchDistance(event.touches),
        initialScale: scale,
        startX: 0,
        startY: 0,
        originX: offset.x,
        originY: offset.y,
      };
      return;
    }

    if (event.touches.length === 1 && scale > 1) {
      const touch = event.touches[0];
      touchRef.current = {
        initialDistance: 0,
        initialScale: scale,
        startX: touch.clientX,
        startY: touch.clientY,
        originX: offset.x,
        originY: offset.y,
      };
    }
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const gesture = touchRef.current;
    if (!gesture) return;

    if (event.touches.length >= 2 && gesture.initialDistance > 0) {
      event.preventDefault();
      const ratio = touchDistance(event.touches) / gesture.initialDistance;
      setZoom(gesture.initialScale * ratio);
      return;
    }

    if (event.touches.length === 1 && scale > 1) {
      event.preventDefault();
      const touch = event.touches[0];
      setOffset(
        clampOffset(
          gesture.originX + touch.clientX - gesture.startX,
          gesture.originY + touch.clientY - gesture.startY,
        ),
      );
    }
  };

  const handleTouchEnd = () => {
    touchRef.current = null;
  };

  const transformStyle = useMemo(
    () => ({
      transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale}) rotate(${rotation}deg)`,
    }),
    [offset.x, offset.y, rotation, scale],
  );

  if (!open || !current || typeof document === 'undefined') return null;

  const toolbarButton =
    'flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white shadow-lg backdrop-blur-xl transition hover:bg-white/15 active:scale-95';

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 overflow-hidden bg-black/94 text-white backdrop-blur-xl',
        UI_LAYER.mediaViewer,
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Rasmni to'liq ekranda ko'rish"
      onClick={onClose}
    >
      <img
        aria-hidden="true"
        src={current.url}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-[42px] saturate-125"
      />
      <div className="pointer-events-none absolute inset-0 bg-black/75" />

      <div
        className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-3 py-3 sm:px-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white/90">
            {current.name || current.alt || 'Rasm'}
          </p>
          {hasMultiple && (
            <p className="mt-0.5 text-[11px] tabular-nums text-white/55">
              {index + 1} / {images.length}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={toolbarButton}
            aria-label="Kichiklashtirish"
            title="Kichiklashtirish (-)"
            onClick={() => setZoom(scale - 0.25)}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={toolbarButton}
            aria-label="Kattalashtirish"
            title="Kattalashtirish (+)"
            onClick={() => setZoom(scale + 0.25)}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={toolbarButton}
            aria-label="Burish"
            title="Burish (R)"
            onClick={() => setRotation((value) => (value + 90) % 360)}
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={toolbarButton}
            aria-label="Yuklab olish"
            onClick={() => void handleDownload()}
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={toolbarButton}
            aria-label="Yopish"
            title="Yopish (Esc)"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className="absolute inset-0 z-10 flex touch-none items-center justify-center overflow-hidden px-3 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-20"
        onClick={onClose}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <img
          key={current.url}
          src={current.url}
          alt={current.alt || current.name || 'Rasm'}
          draggable={false}
          className={cn(
            'max-h-full max-w-full select-none object-contain shadow-2xl will-change-transform',
            scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
          )}
          style={transformStyle}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (scale > 1) resetTransform();
            else setZoom(2);
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={releasePointer}
          onPointerCancel={releasePointer}
        />
      </div>

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              goPrevious();
            }}
            aria-label="Oldingi rasm"
            className="absolute left-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white shadow-xl backdrop-blur-xl transition hover:bg-white/15 active:scale-95 sm:left-5"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              goNext();
            }}
            aria-label="Keyingi rasm"
            className="absolute right-3 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white shadow-xl backdrop-blur-xl transition hover:bg-white/15 active:scale-95 sm:right-5"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {current.caption && (
        <div
          className="absolute inset-x-0 bottom-0 z-30 px-4 pb-5 pt-10 text-center"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="mx-auto max-w-2xl whitespace-pre-wrap break-words text-sm text-white/80">
            {current.caption}
          </p>
        </div>
      )}
    </div>,
    document.body,
  );
}

export default ImageLightbox;
