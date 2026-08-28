import { Check, Layers, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MAP_LAYERS, MAP_OVERLAYS, type MapLayerDef, type MapOverlayDef } from '@/lib/mapLayers';

interface MapLayerSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layerId: MapLayerDef['id'];
  onLayerChange: (id: MapLayerDef['id']) => void;
  overlays: Record<MapOverlayDef['id'], boolean>;
  onToggleOverlay: (id: MapOverlayDef['id']) => void;
  className?: string;
}

/** Yandex Mapsdagidek qatlam menyusi: Xarita / Sputnik / Gibrid + ustama qatlamlar. */
export function MapLayerSwitcher({
  open,
  onOpenChange,
  layerId,
  onLayerChange,
  overlays,
  onToggleOverlay,
  className,
}: MapLayerSwitcherProps) {
  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-2xl bg-background/95 text-foreground shadow-lg ring-1 ring-border backdrop-blur transition-colors hover:bg-muted',
          open && 'bg-primary text-primary-foreground ring-primary',
        )}
        aria-label="Qatlamlar"
      >
        <Layers className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 top-0 z-[1200] w-[268px] origin-top-right overflow-hidden rounded-3xl bg-background/98 shadow-2xl ring-1 ring-border backdrop-blur">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-[14px] font-bold">Qatlamlar</p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Yopish"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3">
            {MAP_LAYERS.map((layer) => (
              <button
                key={layer.id}
                type="button"
                onClick={() => {
                  onLayerChange(layer.id);
                  onOpenChange(false);
                }}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-2xl p-2.5 text-left ring-1 transition-all',
                  layerId === layer.id
                    ? 'bg-primary/10 ring-2 ring-primary'
                    : 'bg-muted/40 ring-border hover:bg-muted',
                )}
              >
                <span className="text-lg">{layer.emoji}</span>
                <span className="text-[12px] font-semibold">{layer.label}</span>
              </button>
            ))}
          </div>

          <div className="border-t border-border p-2">
            {MAP_OVERLAYS.map((overlay) => (
              <button
                key={overlay.id}
                type="button"
                onClick={() => onToggleOverlay(overlay.id)}
                className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted"
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    overlays[overlay.id]
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border',
                  )}
                >
                  {overlays[overlay.id] && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{overlay.label}</span>
                  {overlay.hint && (
                    <span className="block text-[11px] leading-snug text-muted-foreground">
                      {overlay.hint}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
