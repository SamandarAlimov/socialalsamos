import { Bus, Loader2, Navigation } from 'lucide-react';
import type { TransitStop } from '@/lib/transit';
import { formatDistance } from '@/lib/geocoding';
import { cn } from '@/lib/utils';

interface BusStopResultsListProps {
  stops: TransitStop[];
  loading?: boolean;
  activeId?: string | null;
  onSelect: (stop: TransitStop) => void;
  onDirections?: (stop: TransitStop) => void;
  className?: string;
}

export function BusStopResultsList({
  stops,
  loading,
  activeId,
  onSelect,
  onDirections,
  className,
}: BusStopResultsListProps) {
  if (loading && !stops.length) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Bekatlar qidirilmoqda...
      </div>
    );
  }

  if (!stops.length) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted-foreground">
        Yaqin atrofda bekat topilmadi. Xaritani surib, “Shu hududda qidirish”ni bosing.
      </p>
    );
  }

  return (
    <div className={cn('divide-y divide-border/60', className)}>
      {stops.map((stop) => (
        <div
          key={stop.id}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(stop)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSelect(stop);
          }}
          className={cn(
            'flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60',
            activeId === stop.id && 'bg-muted',
          )}
        >
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600">
            <Bus className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-semibold">{stop.name || 'Bekat'}</p>
              {stop.distanceM != null && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDistance(stop.distanceM)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Jamoat transporti bekati{stop.shelter ? ' · soyabon bor' : ''}
            </p>

            {onDirections && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDirections(stop);
                }}
                className="mt-2 flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground"
              >
                <Navigation className="h-3.5 w-3.5" />
                Bekatgacha
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default BusStopResultsList;
