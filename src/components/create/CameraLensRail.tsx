import { useCallback, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CAMERA_LENSES, cameraOverlayCss } from './filters/CameraLensData';

interface CameraLensRailProps {
  value: string;
  onChange: (lensId: string) => void;
}

export function CameraLensRail({ value, onChange }: CameraLensRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const selected = CAMERA_LENSES.find((lens) => lens.id === value) ?? CAMERA_LENSES[0];

  const select = useCallback((lensId: string) => {
    onChange(lensId);
    requestAnimationFrame(() => {
      const target = railRef.current?.querySelector<HTMLElement>(`[data-camera-lens="${lensId}"]`);
      target?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    });
  }, [onChange]);

  const onScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const rail = railRef.current;
      if (!rail) return;
      const center = rail.scrollLeft + rail.clientWidth / 2;
      let nearestId: string | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      rail.querySelectorAll<HTMLElement>('[data-camera-lens]').forEach((button) => {
        const distance = Math.abs(button.offsetLeft + button.offsetWidth / 2 - center);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestId = button.dataset.cameraLens ?? null;
        }
      });
      if (nearestId && nearestId !== value) onChange(nearestId);
    });
  }, [onChange, value]);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-1 z-20 flex justify-center">
        <span className="inline-flex max-w-[80vw] items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-[10px] font-medium text-white/90 backdrop-blur">
          <Sparkles className="h-3 w-3 shrink-0" />
          <span className="truncate">{selected?.name ?? 'Normal'}</span>
          {selected?.source === 'cssgram' && (
            <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white/75">OSS</span>
          )}
        </span>
      </div>

      <div
        ref={railRef}
        data-swipe-navigation="ignore"
        onScroll={onScroll}
        className="alsamos-scrollbar flex touch-pan-x snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-[calc(50%_-_32px)] pb-2 pt-9 [-webkit-overflow-scrolling:touch]"
      >
        {CAMERA_LENSES.map((lens) => {
          const active = lens.id === value;
          const overlay = lens.overlays?.[0];
          return (
            <button
              key={lens.id}
              type="button"
              data-camera-lens={lens.id}
              onClick={() => select(lens.id)}
              aria-label={`${lens.name} filtri`}
              aria-pressed={active}
              title={`${lens.name} · ${lens.sourceLabel}`}
              className="group flex w-16 shrink-0 snap-center flex-col items-center gap-1.5"
            >
              <span className={cn(
                'relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 bg-gradient-to-br from-zinc-200 via-zinc-500 to-zinc-950 shadow-sm transition duration-200 group-active:scale-95',
                active ? 'scale-110 border-white shadow-[0_0_0_3px_rgba(255,255,255,.18)]' : 'border-white/35 opacity-80 group-hover:opacity-100',
              )}>
                <span className="absolute inset-0 bg-gradient-to-br from-orange-300 via-rose-500 to-indigo-700" style={{ filter: lens.style || undefined }} />
                {overlay && (
                  <span className="absolute inset-0" style={{ background: cameraOverlayCss(overlay), mixBlendMode: overlay.blendMode, opacity: overlay.opacity ?? 1 }} />
                )}
                {lens.id === 'none' && <span className="relative z-10 h-6 w-px rotate-45 bg-white/90 shadow" />}
              </span>
              <span className={cn('max-w-[64px] truncate text-[9px] font-medium leading-none transition', active ? 'text-white' : 'text-white/55')}>
                {lens.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
