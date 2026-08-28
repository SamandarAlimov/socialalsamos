import { Bookmark, Clock, Loader2, Navigation, Send, Star } from 'lucide-react';
import type { MapPlace } from '@/lib/mapPlaces';
import { isProbablyOpen } from '@/lib/mapPlaces';
import { formatDistance } from '@/lib/geocoding';
import { categoryUi } from '@/lib/placeIcons';
import { cn } from '@/lib/utils';

interface PlaceResultsListProps {
  places: MapPlace[];
  loading?: boolean;
  error?: string | null;
  activeId?: string | null;
  emptyText?: string;
  onSelect: (place: MapPlace) => void;
  onDirections?: (place: MapPlace) => void;
  onSendToChat?: (place: MapPlace) => void;
  onSave?: (place: MapPlace) => void;
  className?: string;
}

export function PlaceResultsList({
  places,
  loading,
  error,
  activeId,
  emptyText,
  onSelect,
  onDirections,
  onSendToChat,
  onSave,
  className,
}: PlaceResultsListProps) {
  if (loading && !places.length) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Joylar qidirilmoqda...
      </div>
    );
  }

  if (error) {
    return <p className="px-4 py-8 text-center text-sm text-destructive">{error}</p>;
  }

  if (!places.length) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        {emptyText ?? "Hech narsa topilmadi. Boshqa so'z bilan qidirib ko'ring."}
      </p>
    );
  }

  return (
    <div className={cn('divide-y divide-border/60', className)}>
      {places.map((place) => {
        const ui = categoryUi(place.categoryId);
        const open = isProbablyOpen(place.openingHours);
        return (
          <div
            key={place.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(place)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSelect(place);
            }}
            className={cn(
              'flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-muted/60',
              activeId === place.id && 'bg-muted',
            )}
          >
            <span
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: ui.color + '1f' }}
            >
              <ui.Icon className="h-5 w-5" style={{ color: ui.color }} />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-semibold">{place.name}</p>
                {place.distanceM != null && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDistance(place.distanceM)}
                  </span>
                )}
              </div>

              <p className="truncate text-xs text-muted-foreground">
                {place.categoryLabel || ui.label}
                {place.address ? ' \u00b7 ' + place.address : ''}
              </p>

              {open !== null && (
                <span
                  className={cn(
                    'mt-1 flex items-center gap-1 text-xs font-medium',
                    open ? 'text-emerald-600' : 'text-destructive',
                  )}
                >
                  <Clock className="h-3.5 w-3.5" />
                  {open ? 'Ochiq' : 'Yopiq'}
                </span>
              )}

              <div className="mt-2 flex items-center gap-1.5">
                {onDirections && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDirections(place);
                    }}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    Marshrut
                  </button>
                )}
                {onSendToChat && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSendToChat(place);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground hover:text-foreground"
                    aria-label="Chatga yuborish"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
                {onSave && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSave(place);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground hover:text-foreground"
                    aria-label="Saqlash"
                  >
                    <Bookmark className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default PlaceResultsList;
