import {
  AlertTriangle,
  Clock3,
  Construction,
  MapPin,
  Navigation,
  Route,
  Timer,
  X,
} from 'lucide-react';

import {
  trafficIncidentLabel,
  type TrafficIncident,
} from '@/lib/traffic';
import { formatKm, formatMinutes } from '@/lib/routing';
import { cn } from '@/lib/utils';

interface TrafficIncidentCardProps {
  incident: TrafficIncident;
  highContrast?: boolean;
  onClose?: () => void;
  onDirections?: (incident: TrafficIncident) => void;
  className?: string;
}

function IncidentIcon({
  category,
}: {
  category: TrafficIncident['category'];
}) {
  if (category === 'road_works') {
    return <Construction className="h-5 w-5" />;
  }
  if (category === 'road_closed') {
    return <X className="h-5 w-5" />;
  }
  return <AlertTriangle className="h-5 w-5" />;
}

export function TrafficIncidentCard({
  incident,
  highContrast = false,
  onClose,
  onDirections,
  className,
}: TrafficIncidentCardProps) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden',
        highContrast
          ? 'map-imagery-card bg-slate-950/90 text-white'
          : 'bg-background text-foreground',
        className,
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-start gap-3 border-b px-4 py-4',
          highContrast
            ? 'border-white/10 bg-black/10'
            : 'border-border/60',
        )}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/15 text-orange-500">
          <IncidentIcon category={incident.category} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold">
            {trafficIncidentLabel(incident)}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {incident.roadNumbers.length
              ? incident.roadNumbers.join(', ')
              : incident.from || incident.to || 'Yo‘l holati'}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-xl transition',
              highContrast
                ? 'bg-white/[0.06] text-white/60 hover:bg-white/[0.12] hover:text-white'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            aria-label="Yopish"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="map-panel-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
        {incident.description && (
          <p className="text-sm leading-relaxed">
            {incident.description}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          {incident.delayS > 0 && (
            <div className="rounded-2xl bg-orange-500/[0.08] p-3">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-orange-500">
                <Timer className="h-3.5 w-3.5" />
                Kechikish
              </span>
              <p className="mt-1 text-sm font-extrabold">
                +{formatMinutes(incident.delayS)}
              </p>
            </div>
          )}

          {incident.lengthM > 0 && (
            <div className="rounded-2xl bg-muted/45 p-3">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Route className="h-3.5 w-3.5" />
                Ta’sir uzunligi
              </span>
              <p className="mt-1 text-sm font-extrabold">
                {formatKm(incident.lengthM)}
              </p>
            </div>
          )}
        </div>

        {(incident.from || incident.to) && (
          <div className="mt-3 rounded-2xl border border-border/50 bg-muted/20 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              Hudud
            </p>
            <p className="mt-1 text-sm font-semibold">
              {[incident.from, incident.to]
                .filter(Boolean)
                .join(' → ')}
            </p>
          </div>
        )}

        {incident.endTime && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            Taxminiy yakun:{' '}
            {new Date(incident.endTime).toLocaleString('uz-UZ', {
              hour: '2-digit',
              minute: '2-digit',
              day: '2-digit',
              month: 'short',
            })}
          </div>
        )}
      </div>

      {onDirections && (
        <div
          className={cn(
            'shrink-0 border-t p-3',
            highContrast
              ? 'border-white/10 bg-black/10'
              : 'border-border/60',
          )}
        >
          <button
            type="button"
            onClick={() => onDirections(incident)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-extrabold text-primary-foreground shadow-sm"
          >
            <Navigation className="h-4 w-4" />
            Hodisa joyigacha marshrut
          </button>
        </div>
      )}
    </div>
  );
}

export default TrafficIncidentCard;
