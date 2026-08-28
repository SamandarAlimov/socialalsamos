import { Bus, Clock, Loader2, Navigation, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistance } from '@/lib/geocoding';
import { formatArrival, type TransitRoute, type TransitStop } from '@/lib/transit';

interface BusStopCardProps {
  stop: TransitStop;
  routes: TransitRoute[];
  loading?: boolean;
  error?: string | null;
  onReload?: () => void;
  onDirections?: (stop: TransitStop) => void;
  onClose?: () => void;
  className?: string;
}

const MODE_LABEL: Record<TransitRoute['mode'], string> = {
  bus: 'Avtobus',
  trolleybus: 'Trolleybus',
  minibus: 'Marshrutka',
  tram: 'Tramvay',
  subway: 'Metro',
  other: 'Transport',
};

/**
 * Bekat kartasi: qaysi avtobuslar keladi, qachon keladi, qayerdan-qayerga.
 * Ma'lumot OpenStreetMap marshrutlaridan, real vaqt manbasi ulansa - undan.
 */
export function BusStopCard({
  stop,
  routes,
  loading,
  error,
  onReload,
  onDirections,
  onClose,
  className,
}: BusStopCardProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-3xl bg-card shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-1 ring-border',
        className,
      )}
    >
      <div className="flex items-start gap-3 border-b border-border bg-gradient-to-br from-primary/10 to-transparent p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Bus className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold text-foreground">{stop.name}</p>
          <p className="text-[12px] text-muted-foreground">
            Bekat
            {typeof stop.distanceM === 'number' && ' \u00b7 ' + formatDistance(stop.distanceM)}
            {stop.shelter && ' \u00b7 soyabon bor'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {onReload && (
            <button
              type="button"
              onClick={onReload}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Yangilash"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Yopish"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[46vh] overflow-y-auto p-3">
        {loading && routes.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Marshrutlar yuklanmoqda...</span>
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-destructive">{error}</p>
        ) : routes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Bu bekat uchun marshrut ma\u2018lumoti topilmadi.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {routes.map((route) => (
              <div
                key={route.id}
                className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3 ring-1 ring-border/60"
              >
                <span
                  className="flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-[15px] font-bold text-white"
                  style={{ backgroundColor: route.colour || 'hsl(var(--primary))' }}
                >
                  {route.ref}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-foreground">
                    {route.from && route.to ? route.from + ' \u2192 ' + route.to : route.name}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {MODE_LABEL[route.mode]}
                    {' \u00b7 har ' + route.intervalMin + ' daq'}
                    {route.operator ? ' \u00b7 ' + route.operator : ''}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold',
                      route.realtime
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : 'bg-primary/10 text-primary',
                    )}
                  >
                    <Clock className="h-3 w-3" />
                    {formatArrival(route.nextArrivalsMin[0] ?? 0)}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {route.nextArrivalsMin
                      .slice(1, 3)
                      .map((minutes) => formatArrival(minutes))
                      .join(', ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-3">
        {onDirections && (
          <button
            type="button"
            onClick={() => onDirections(stop)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Navigation className="h-4 w-4" />
            Bekatga yo\u2018nalish
          </button>
        )}
        <p className="flex-1 text-[11px] leading-snug text-muted-foreground">
          {routes.some((route) => route.realtime)
            ? 'Real vaqt ma\u2018lumoti'
            : 'Kelish vaqtlari jadval asosida taxminiy'}
        </p>
      </div>
    </div>
  );
}
