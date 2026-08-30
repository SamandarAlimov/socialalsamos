import { Bus, Clock, Loader2, Navigation, RefreshCw, Radio, Train, X } from 'lucide-react';
import type { TransitRoute, TransitStop } from '@/lib/transit';
import { formatArrival } from '@/lib/transit';
import { formatDistance } from '@/lib/geocoding';
import { cn } from '@/lib/utils';

interface BusStopCardProps {
  stop: TransitStop;
  routes: TransitRoute[];
  loading?: boolean;
  error?: string | null;
  realtimeConfigured?: boolean;
  realtimeFresh?: boolean;
  onReload?: () => void;
  onDirections?: (stop: TransitStop) => void;
  onClose?: () => void;
  className?: string;
}

function ModeIcon({ mode }: { mode?: string }) {
  if (mode === 'tram' || mode === 'train' || mode === 'subway') {
    return <Train className="h-4 w-4" />;
  }
  return <Bus className="h-4 w-4" />;
}

export function BusStopCard({
  stop,
  routes,
  loading,
  error,
  realtimeConfigured = false,
  realtimeFresh = false,
  onReload,
  onDirections,
  onClose,
  className,
}: BusStopCardProps) {
  return (
    <div className={cn('flex flex-col overflow-hidden bg-background', className)}>
      <div className="flex items-start gap-3 border-b border-border/60 px-4 py-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600">
          <Bus className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{stop.name || 'Bekat'}</p>
          <p className="text-xs text-muted-foreground">
            Jamoat transporti bekati
            {stop.distanceM != null ? ' \u00b7 ' + formatDistance(stop.distanceM) : ''}
            {stop.shelter ? ' \u00b7 soyabon bor' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {onReload && (
            <button
              type="button"
              onClick={onReload}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
              aria-label="Yangilash"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
              aria-label="Yopish"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="max-h-72 flex-1 overflow-y-auto">
        {!realtimeConfigured ? (
          <div className="border-b border-border/50 bg-muted/40 px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Jonli kelish vaqti provayderi ulanmagan. Faqat haqiqiy OSM jadval oralig'i mavjud bo'lsa taxminiy vaqt ko'rsatiladi.
          </div>
        ) : !realtimeFresh ? (
          <div className="border-b border-amber-500/20 bg-amber-500/8 px-4 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
            Real-time manba mavjud, lekin hozirgi ma'lumot eskirgan yoki vaqtincha olinmayapti.
          </div>
        ) : (
          <div className="flex items-center gap-1.5 border-b border-emerald-500/15 bg-emerald-500/8 px-4 py-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            <Radio className="h-3 w-3" />
            GTFS real-time yangilanmoqda
          </div>
        )}
        {loading && !routes.length && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Marshrutlar yuklanmoqda...
          </div>
        )}

        {error && <p className="px-4 py-6 text-center text-sm text-destructive">{error}</p>}

        {!loading && !error && !routes.length && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Bu bekat uchun marshrut ma'lumoti topilmadi.
          </p>
        )}

        <div className="divide-y divide-border/50">
          {routes.map((route) => (
            <div key={route.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className="flex h-9 min-w-[2.75rem] items-center justify-center gap-1 rounded-lg px-2 text-sm font-bold text-white"
                style={{ backgroundColor: route.colour || '#1E7BC4' }}
              >
                <ModeIcon mode={route.mode} />
                {route.ref}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {route.to ? (route.from ? route.from + ' - ' + route.to : route.to) : route.name}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  {route.intervalMin ? (
                    <>
                      <Clock className="h-3 w-3" />
                      Har {route.intervalMin} daqiqada
                    </>
                  ) : (
                    route.operator || "Qatnov oralig'i ko'rsatilmagan"
                  )}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end">
                <span
                  className={cn(
                    'text-sm font-semibold',
                    route.realtime ? 'text-emerald-600' : 'text-foreground',
                  )}
                >
                  {route.nextArrivalsMin?.length
                    ? (route.realtime ? formatArrival(route.nextArrivalsMin[0]) : '~' + formatArrival(route.nextArrivalsMin[0]))
                    : "Vaqt ma'lum emas"}
                </span>
                {route.nextArrivalsMin && route.nextArrivalsMin.length > 1 && (
                  <span className="text-[11px] text-muted-foreground">
                    keyingi: {route.nextArrivalsMin.slice(1, 3).join(', ')} daq
                  </span>
                )}
                {route.realtime ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                    <Radio className="h-3 w-3" />
                    real vaqt
                  </span>
                ) : route.intervalMin > 0 ? (
                  <span className="text-[11px] text-muted-foreground">jadval bo'yicha</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {onDirections && (
        <div className="border-t border-border/60 p-3">
          <button
            type="button"
            onClick={() => onDirections(stop)}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
          >
            <Navigation className="h-4 w-4" />
            Bekatgacha yo'l
          </button>
        </div>
      )}
    </div>
  );
}

export default BusStopCard;
