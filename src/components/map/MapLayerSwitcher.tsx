import { Bike, Bus, Car, Check, Layers, MapPin, Moon, Map as MapIcon, Satellite, X } from 'lucide-react';
import { MAP_LAYERS, MAP_OVERLAYS, type MapLayerId } from '@/lib/mapLayers';
import { cn } from '@/lib/utils';

interface MapLayerSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layerId: MapLayerId;
  onLayerChange: (id: MapLayerId) => void;
  overlays: string[];
  onToggleOverlay: (id: string) => void;
  className?: string;
}

const LAYER_ICON: Record<string, typeof MapIcon> = {
  map: MapIcon,
  satellite: Satellite,
  hybrid: Layers,
  night: Moon,
};

const OVERLAY_ICON: Record<string, typeof MapIcon> = {
  traffic: Car,
  transit: Bus,
  cycle: Bike,
  stops: MapPin,
};

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
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/95 text-foreground shadow-md ring-1 ring-border/60 backdrop-blur"
        aria-label="Qatlamlar"
      >
        <Layers className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-[1200] w-64 rounded-2xl border border-border/60 bg-background/98 p-3 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Qatlamlar</p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
              aria-label="Yopish"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {MAP_LAYERS.map((layer) => {
              const Icon = LAYER_ICON[layer.id] ?? MapIcon;
              const active = layer.id === layerId;
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => onLayerChange(layer.id)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl border p-2 text-xs font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border/60 text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {layer.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 border-t border-border/60 pt-2">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Ustama qatlamlar</p>
            {MAP_OVERLAYS.map((overlay) => {
              const Icon = OVERLAY_ICON[overlay.id] ?? Layers;
              const active = overlays.includes(overlay.id);
              return (
                <button
                  key={overlay.id}
                  type="button"
                  onClick={() => onToggleOverlay(overlay.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-1.5 py-2 text-sm hover:bg-muted"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-left">{overlay.label}</span>
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded border',
                      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default MapLayerSwitcher;
