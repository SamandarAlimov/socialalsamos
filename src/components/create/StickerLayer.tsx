import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Layers, RotateCw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StickerView } from '@/components/stickers/StickerView';
import {
  DEFAULT_STICKER_SCALE,
  MAX_STICKERS_PER_MEDIA,
  type StickerItem,
  type StickerPlacement,
} from '@/lib/stickers';

interface StickerLayerProps {
  placements: StickerPlacement[];
  onChange: (next: StickerPlacement[]) => void;
  /** Faqat ko'rish rejimi (lentada post ko'rsatilganda). */
  editable?: boolean;
  className?: string;
}

const MIN_SCALE = 0.08;
const MAX_SCALE = 1.6;

/** Yangi stiker joylashuvini yaratadi (markazda, bir oz siljish bilan). */
export function createPlacement(
  sticker: StickerItem,
  existing: StickerPlacement[],
): StickerPlacement | null {
  if (existing.length >= MAX_STICKERS_PER_MEDIA) return null;

  // Ketma-ket qo'shilganda ustma-ust tushmasligi uchun kichik siljish
  const offset = (existing.length % 5) * 0.04;
  const maxZ = existing.reduce((max, item) => Math.max(max, item.z), 0);

  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `sticker-${Date.now()}-${existing.length}`,
    sticker,
    x: 0.5 + offset - 0.08,
    y: 0.42 + offset - 0.08,
    scale: DEFAULT_STICKER_SCALE,
    rotation: 0,
    opacity: 1,
    z: maxZ + 1,
  };
}

/**
 * Media ustidagi stiker qatlami.
 *
 * Koordinatalar 0..1 oralig'ida nisbiy saqlanadi — shu sababli telefonda
 * qo'yilgan stiker kompyuterda ham xuddi shu joyda turadi, va bir xil
 * ma'lumot post, story va reel uchun ishlatiladi.
 *
 * Boshqarish: surish (drag), o'ng-past burchak dastasi bilan bir vaqtda
 * kattalashtirish va burash, ikki barmoq bilan pinch-zoom.
 */
export function StickerLayer({
  placements,
  onChange,
  editable = true,
  className,
}: StickerLayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Faol o'zgarish holati (render orasida saqlanadi)
  const gesture = useRef<{
    id: string;
    mode: 'move' | 'transform';
    pointerId: number;
    startX: number;
    startY: number;
    origin: StickerPlacement;
    rect: DOMRect;
  } | null>(null);

  const pinch = useRef<{
    id: string;
    pointers: Map<number, { x: number; y: number }>;
    startDistance: number;
    startAngle: number;
    origin: StickerPlacement;
  } | null>(null);

  const update = useCallback(
    (id: string, patch: Partial<StickerPlacement>) => {
      onChange(placements.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    },
    [onChange, placements],
  );

  const remove = useCallback(
    (id: string) => {
      onChange(placements.filter((item) => item.id !== id));
      setActiveId((current) => (current === id ? null : current));
    },
    [onChange, placements],
  );

  const duplicate = useCallback(
    (id: string) => {
      if (placements.length >= MAX_STICKERS_PER_MEDIA) return;
      const source = placements.find((item) => item.id === id);
      if (!source) return;

      const maxZ = placements.reduce((max, item) => Math.max(max, item.z), 0);
      const copy: StickerPlacement = {
        ...source,
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `sticker-${Date.now()}`,
        x: Math.min(source.x + 0.06, 0.97),
        y: Math.min(source.y + 0.06, 0.97),
        z: maxZ + 1,
      };
      onChange([...placements, copy]);
      setActiveId(copy.id);
    },
    [onChange, placements],
  );

  const bringToFront = useCallback(
    (id: string) => {
      const maxZ = placements.reduce((max, item) => Math.max(max, item.z), 0);
      update(id, { z: maxZ + 1 });
    },
    [placements, update],
  );

  // --- Pointer boshqaruvi ---

  const handlePointerDown = useCallback(
    (event: React.PointerEvent, placement: StickerPlacement, mode: 'move' | 'transform') => {
      if (!editable) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      event.stopPropagation();
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);

      setActiveId(placement.id);
      bringToFront(placement.id);

      // Ikkinchi barmoq qo'shilsa — pinch rejimiga o'tamiz
      if (gesture.current && gesture.current.id === placement.id && mode === 'move') {
        const first = gesture.current;
        const pointers = new Map<number, { x: number; y: number }>();
        pointers.set(first.pointerId, { x: first.startX, y: first.startY });
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        const points = Array.from(pointers.values());
        const dx = points[1].x - points[0].x;
        const dy = points[1].y - points[0].y;

        pinch.current = {
          id: placement.id,
          pointers,
          startDistance: Math.hypot(dx, dy) || 1,
          startAngle: (Math.atan2(dy, dx) * 180) / Math.PI,
          origin: placement,
        };
        gesture.current = null;
        return;
      }

      gesture.current = {
        id: placement.id,
        mode,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin: placement,
        rect,
      };
    },
    [bringToFront, editable],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!editable) return;

      // Pinch: masshtab + burilish
      const activePinch = pinch.current;
      if (activePinch && activePinch.pointers.has(event.pointerId)) {
        activePinch.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const points = Array.from(activePinch.pointers.values());
        if (points.length >= 2) {
          const dx = points[1].x - points[0].x;
          const dy = points[1].y - points[0].y;
          const distance = Math.hypot(dx, dy) || 1;
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

          update(activePinch.id, {
            scale: clamp(
              activePinch.origin.scale * (distance / activePinch.startDistance),
              MIN_SCALE,
              MAX_SCALE,
            ),
            rotation: activePinch.origin.rotation + (angle - activePinch.startAngle),
          });
        }
        return;
      }

      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) return;

      const { rect, origin } = active;

      if (active.mode === 'move') {
        const dx = (event.clientX - active.startX) / rect.width;
        const dy = (event.clientY - active.startY) / rect.height;
        update(active.id, {
          x: clamp(origin.x + dx, 0.02, 0.98),
          y: clamp(origin.y + dy, 0.02, 0.98),
        });
        return;
      }

      // Transform dastasi: markazdan masofa -> masshtab, burchak -> burilish
      const centerX = rect.left + origin.x * rect.width;
      const centerY = rect.top + origin.y * rect.height;

      const startDistance =
        Math.hypot(active.startX - centerX, active.startY - centerY) || 1;
      const currentDistance = Math.hypot(event.clientX - centerX, event.clientY - centerY);

      const startAngle = Math.atan2(active.startY - centerY, active.startX - centerX);
      const currentAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);

      update(active.id, {
        scale: clamp(origin.scale * (currentDistance / startDistance), MIN_SCALE, MAX_SCALE),
        rotation: origin.rotation + ((currentAngle - startAngle) * 180) / Math.PI,
      });
    },
    [editable, update],
  );

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    if (pinch.current?.pointers.has(event.pointerId)) {
      pinch.current.pointers.delete(event.pointerId);
      if (pinch.current.pointers.size < 2) pinch.current = null;
    }
    if (gesture.current?.pointerId === event.pointerId) {
      gesture.current = null;
    }
  }, []);

  // Escape bilan tanlovni bekor qilish
  useEffect(() => {
    if (!editable || !activeId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveId(null);
      if (event.key === 'Delete' || event.key === 'Backspace') remove(activeId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeId, editable, remove]);

  const sorted = [...placements].sort((a, b) => a.z - b.z);

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerDown={() => setActiveId(null)}
      className={cn(
        'absolute inset-0 touch-none select-none',
        editable ? 'z-20' : 'pointer-events-none z-10',
        className,
      )}
    >
      {sorted.map((placement) => {
        const isActive = editable && activeId === placement.id;

        return (
          <div
            key={placement.id}
            style={{
              position: 'absolute',
              left: `${placement.x * 100}%`,
              top: `${placement.y * 100}%`,
              width: `${placement.scale * 100}%`,
              opacity: placement.opacity,
              transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
              zIndex: placement.z,
            }}
            className={cn(
              'group',
              editable ? 'cursor-move' : 'pointer-events-none',
              isActive && 'rounded-xl ring-2 ring-primary ring-offset-1 ring-offset-black/20',
            )}
            onPointerDown={(event) => handlePointerDown(event, placement, 'move')}
          >
            <div className="aspect-square w-full">
              <StickerView
                sticker={placement.sticker}
                size={512}
                highFidelity
                eager
                className="h-full w-full"
              />
            </div>

            {isActive && (
              <>
                {/* O'chirish */}
                <button
                  type="button"
                  aria-label="Stikerni o‘chirish"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => remove(placement.id)}
                  className="absolute -left-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>

                {/* Nusxalash */}
                <button
                  type="button"
                  aria-label="Nusxalash"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => duplicate(placement.id)}
                  className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full bg-background text-foreground shadow-lg"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>

                {/* Oldinga chiqarish */}
                <button
                  type="button"
                  aria-label="Oldinga chiqarish"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => bringToFront(placement.id)}
                  className="absolute -bottom-3 -left-3 flex h-7 w-7 items-center justify-center rounded-full bg-background text-foreground shadow-lg"
                >
                  <Layers className="h-3.5 w-3.5" />
                </button>

                {/* Burash + kattalashtirish dastasi */}
                <button
                  type="button"
                  aria-label="Burash va o‘lchamni o‘zgartirish"
                  onPointerDown={(event) => handlePointerDown(event, placement, 'transform')}
                  className="absolute -bottom-3 -right-3 flex h-7 w-7 cursor-nwse-resize items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
