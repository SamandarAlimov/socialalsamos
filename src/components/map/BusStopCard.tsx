import { AlertTriangle, Bus, Clock, ExternalLink, Loader2, Navigation, RefreshCw, Radio, ShieldCheck, Train, X } from 'lucide-react';
import type { TransitRoute, TransitStop } from '@/lib/transit';
import type { TransitServiceAlert } from '@/lib/transitRealtime';
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
  providerName?: string | null;
  authoritative?: boolean;
  staticGtfsAvailable?: boolean;
  alerts?: TransitServiceAlert[];
  highContrast?: boolean;
  onReload?: () => void;
  onDirections?: (stop: TransitStop) => void;
  onClose?: () => void;
  className?: string;
}

function safeExternalUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
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
  providerName = null,
  authoritative = false,
  staticGtfsAvailable = false,
  alerts = [],
  highContrast = false,
  onReload,
  onDirections,
  onClose,
  className,
}: BusStopCardProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden',
        highContrast ? 'map-imagery-card bg-slate-950/90 text-white' : 'bg-background text-foreground',
        className,
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-start gap-3 border-b px-4 py-3.5',
          highContrast ? 'border-white/10 bg-black/10' : 'border-border/60',
        )}
      >
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sky-500',
            highContrast ? 'bg-sky-400/[0.12]' : 'bg-sky-500/15',
          )}
        >
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
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-xl transition',
                highContrast
                  ? 'bg-white/[0.06] text-white/[0.60] hover:bg-white/[0.12] hover:text-white'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              aria-label="Yangilash"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-xl transition',
                highContrast
                  ? 'bg-white/[0.06] text-white/[0.60] hover:bg-white/[0.12] hover:text-white'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              aria-label="Yopish"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="map-panel-scrollbar min-h-0 flex-1 overflow-y-auto">
        {!realtimeConfigured ? (
          <div
            className={cn(
              'border-b px-4 py-2.5 text-[11px] leading-relaxed',
              highContrast
                ? 'border-white/10 bg-white/[0.04] text-white/[0.55]'
                : 'border-border/50 bg-muted/40 text-muted-foreground',
            )}
          >
            {staticGtfsAvailable
              ? (providerName ? providerName + ' · ' : '') +
                (authoritative
                  ? 'rasmiy GTFS marshrut ma’lumoti ulangan. '
                  : 'GTFS marshrut ma’lumoti ulangan. ') +
                'Jonli kelish vaqti feed’i hali ulanmagan.'
              : "Jonli GTFS/GTFS-RT manbasi ulanmagan. OSM'dagi qatnov oralig'i ko‘rsatilishi mumkin, lekin kelish vaqti uydirilmaydi."}
          </div>
        ) : !realtimeFresh ? (
          <div className="border-b border-amber-400/15 bg-amber-400/[0.08] px-4 py-2.5 text-[11px] leading-relaxed text-amber-300">
            {providerName ? providerName + ' · ' : ''}
            real-time manba mavjud, lekin hozirgi ma'lumot eskirgan yoki vaqtincha olinmayapti.
          </div>
        ) : authoritative ? (
          <div className="flex items-center gap-1.5 border-b border-emerald-400/15 bg-emerald-400/[0.08] px-4 py-2.5 text-[11px] font-medium text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            {providerName ? providerName + ' · ' : ''}
            rasmiy GTFS real-time
          </div>
        ) : (
          <div className="flex items-center gap-1.5 border-b border-sky-400/15 bg-sky-400/[0.08] px-4 py-2.5 text-[11px] font-medium text-sky-400">
            <Radio className="h-3 w-3" />
            {providerName ? providerName + ' · ' : ''}
            GTFS real-time · manba statusi tasdiqlanmagan
          </div>
        )}
        {alerts.length > 0 && (
          <div className="space-y-2 border-b border-amber-400/15 p-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  'rounded-2xl border px-3 py-2.5',
                  highContrast
                    ? 'border-amber-300/15 bg-amber-300/[0.08]'
                    : 'border-amber-500/20 bg-amber-500/[0.07]',
                )}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold">{alert.title}</p>
                    {alert.description && (
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        {alert.description}
                      </p>
                    )}
                    {safeExternalUrl(alert.url) && (
                      <a
                        href={safeExternalUrl(alert.url) ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                      >
                        Batafsil
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
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

        <div className={cn('divide-y', highContrast ? 'divide-white/10' : 'divide-border/50')}>
          {routes.map((route) => (
            <div
              key={route.id}
              className={cn(
                'mx-3 my-2 flex items-center gap-3 rounded-2xl px-3 py-3',
                highContrast ? 'bg-white/[0.055]' : 'bg-muted/30',
              )}
            >
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
                    route.realtime
                      ? highContrast
                        ? 'text-emerald-300'
                        : 'text-emerald-600'
                      : highContrast
                        ? 'text-white'
                        : 'text-foreground',
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
                  <span className={cn('flex items-center gap-1 text-[11px] font-medium', highContrast ? 'text-emerald-300' : 'text-emerald-600')}>
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
        <div className={cn('shrink-0 border-t p-3', highContrast ? 'border-white/10 bg-black/10' : 'border-border/60')}>
          <button
            type="button"
            onClick={() => onDirections(stop)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
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
