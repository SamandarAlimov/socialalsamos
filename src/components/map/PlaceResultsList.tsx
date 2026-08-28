import { Clock, Loader2, MapPin, Navigation, Send, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistance } from '@/lib/geocoding';
import { isProbablyOpen, type MapPlace } from '@/lib/mapPlaces';

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

/** Qidiruv/filtr natijalari ro'yxati - premium karta ko'rinishida. */
export function PlaceResultsList({
  places,
  loading,
  error,
  activeId,
  emptyText = 'Natija topilmadi',
  onSelect,
  onDirections,
  onSendToChat,
  onSave,
  className,
}: PlaceResultsListProps) {
  if (loading && places.length === 0) {
    return (
      <div className={cn('flex items-center justify-center gap-2 py-8 text-muted-foreground', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Qidirilmoqda...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('px-4 py-6 text-center text-sm text-destructive', className)}>{error}</div>
    );
  }

  if (places.length === 0) {
    return (
      <div className={cn('px-4 py-8 text-center text-sm text-muted-foreground', className)}>
        {emptyText}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {places.map((place) => {
        const open = isProbablyOpen(place.openingHours);
        const isActive = activeId === place.id;
        return (
          <button
            key={place.id}
            type="button"
            onClick={() => onSelect(place)}
            className={cn(
              'group w-full rounded-2xl bg-card p-3 text-left ring-1 transition-all duration-150 hover:shadow-md',
              isActive ? 'ring-2 ring-primary' : 'ring-border',
            )}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg">
                {place.categoryId ? getEmoji(place.categoryId) : <MapPin className="h-5 w-5 text-primary" />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-foreground">{place.name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                  {place.categoryLabel && <span>{place.categoryLabel}</span>}
                  {typeof place.distanceM === 'number' && (
                    <span className="font-medium text-foreground/70">
                      {formatDistance(place.distanceM)}
                    </span>
                  )}
                  {open !== null && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 font-medium',
                        open ? 'text-emerald-600' : 'text-destructive',
                      )}
                    >
                      <Clock className="h-3 w-3" />
                      {open ? 'Ochiq' : 'Yopiq'}
                    </span>
                  )}
                </div>
                {place.address && (
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{place.address}</p>
                )}
              </div>
            </div>

            <div className="mt-2.5 flex items-center gap-1.5">
              {onDirections && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDirections(place);
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Yo\u2018nalish
                </span>
              )}
              {onSendToChat && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSendToChat(place);
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/80"
                >
                  <Send className="h-3.5 w-3.5" />
                  Chatga
                </span>
              )}
              {onSave && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSave(place);
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/80"
                >
                  <Star className="h-3.5 w-3.5" />
                  Saqlash
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function getEmoji(categoryId: string): string {
  const map: Record<string, string> = {
    restaurant: '\ud83c\udf7d\ufe0f',
    cafe: '\u2615',
    fast_food: '\ud83c\udf54',
    bakery: '\ud83e\udd50',
    fuel: '\u26fd',
    parking: '\ud83c\udd7f\ufe0f',
    pharmacy: '\ud83d\udc8a',
    hospital: '\ud83c\udfe5',
    atm: '\ud83c\udfe7',
    bank: '\ud83c\udfe6',
    market: '\ud83e\uded1',
    supermarket: '\ud83d\uded2',
    mosque: '\ud83d\udd4c',
    hotel: '\ud83c\udfe8',
    school: '\ud83c\udfeb',
    gym: '\ud83c\udfcb\ufe0f',
    car_wash: '\ud83e\uddfd',
    bus_stop: '\ud83d\ude8f',
  };
  return map[categoryId] ?? '\ud83d\udccd';
}
