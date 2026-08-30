import { Bike, Bus, Car, Check, Layers, Loader2, MapPin, Moon, Map as MapIcon, Satellite, X } from 'lucide-react';
import { MAP_LAYERS, MAP_OVERLAYS, type MapLayerId } from '@/lib/mapLayers';
import { cn } from '@/lib/utils';

interface MapLayerSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layerId: MapLayerId;
  onLayerChange: (id: MapLayerId) => void;
  overlays: string[];
  onToggleOverlay: (id: string) => void;
  highContrast?: boolean;
  overlayMeta?: Record<
    string,
    {
      available: boolean;
      loading?: boolean;
      detail?: string | null;
    }
  >;
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
  highContrast = false,
  overlayMeta = {},
  className,
}: MapLayerSwitcherProps) {
  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-2xl text-foreground shadow-lg ring-1 backdrop-blur-2xl transition hover:shadow-xl',
          highContrast
            ? 'bg-slate-950/85 text-white ring-white/20 hover:bg-slate-950/95'
            : 'bg-background/82 ring-border/45 hover:bg-background/95',
        )}
        aria-label="Qatlamlar"
      >
        <Layers className="h-5 w-5" />
      </button>

      {open && (
        <div
          className={cn(
            'absolute right-0 top-12 z-[1200] w-64 rounded-[22px] border p-3 text-foreground shadow-2xl backdrop-blur-2xl',
            highContrast
              ? 'border-white/15 bg-slate-950/90 text-white'
              : 'border-border/45 bg-background/88',
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Qatlamlar</p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg',
                highContrast
                  ? 'text-white/60 hover:bg-white/10 hover:text-white'
                  : 'text-muted-foreground hover:text-foreground',
              )}
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
                      : highContrast
                        ? 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white'
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
            <p
              className={cn(
                'mb-1 text-xs font-medium',
                highContrast ? 'text-white/65' : 'text-muted-foreground',
              )}
            >
              Ustama qatlamlar
            </p>
            {MAP_OVERLAYS.map((overlay) => {
              const Icon = OVERLAY_ICON[overlay.id] ?? Layers;
              const active = overlays.includes(overlay.id);
              const meta = overlayMeta[overlay.id];
              const disabled = meta ? !meta.available : false;
              const loading = Boolean(meta?.loading);
              return (
                <button
                  key={overlay.id}
                  type="button"
                  disabled={disabled || loading}
                  onClick={() => onToggleOverlay(overlay.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-1.5 py-2 text-sm transition',
                    highContrast ? 'text-white/90 hover:bg-white/10' : 'hover:bg-muted',
                    (disabled || loading) && 'cursor-not-allowed opacity-45',
                  )}
                  title={
                    disabled
                      ? meta?.detail || 'Provider ulanmagan'
                      : meta?.detail || undefined
                  }
                >
                  <Icon
                    className={cn(
                      'h-4 w-4',
                      highContrast ? 'text-white/70' : 'text-muted-foreground',
                    )}
                  />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block">{overlay.label}</span>
                    {meta?.detail && (
                      <span
                        className={cn(
                          'block truncate text-[10px] font-normal',
                          highContrast
                            ? 'text-white/45'
                            : 'text-muted-foreground',
                        )}
                      >
                        {meta.detail}
                      </span>
                    )}
                  </span>
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <span
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded border',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border',
                      )}
                    >
                      {active && <Check className="h-3 w-3" />}
                    </span>
                  )}
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
