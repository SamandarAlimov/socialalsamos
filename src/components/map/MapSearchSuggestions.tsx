import { Clock3, Loader2, MapPin, Search, X } from 'lucide-react';
import type { MapPlace } from '@/lib/mapPlaces';
import { categoryUi } from '@/lib/placeIcons';
import { formatDistance } from '@/lib/geocoding';
import { cn } from '@/lib/utils';

interface MapSearchSuggestionsProps {
  query: string;
  places: MapPlace[];
  loading?: boolean;
  error?: string | null;
  recent: string[];
  visible: boolean;
  highContrast?: boolean;
  onSelectPlace: (place: MapPlace) => void;
  onSelectRecent: (value: string) => void;
  onClearRecent: () => void;
}

export function MapSearchSuggestions({
  query,
  places,
  loading,
  error,
  recent,
  visible,
  highContrast = false,
  onSelectPlace,
  onSelectRecent,
  onClearRecent,
}: MapSearchSuggestionsProps) {
  if (!visible) return null;

  const term = query.trim();
  const showRecent = term.length < 2;

  return (
    <div
      className={cn(
        'absolute inset-x-0 top-[52px] z-[1250] overflow-hidden rounded-[20px] border shadow-2xl backdrop-blur-2xl',
        highContrast
          ? 'border-white/15 bg-slate-950/94 text-white'
          : 'border-border/50 bg-background/96 text-foreground',
      )}
    >
      {showRecent ? (
        <>
          <div className="flex items-center justify-between px-3.5 pb-2 pt-3">
            <p className={cn('text-xs font-semibold uppercase tracking-wide', highContrast ? 'text-white/[0.55]' : 'text-muted-foreground')}>
              Oxirgi qidiruvlar
            </p>
            {recent.length > 0 && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onClearRecent}
                className={cn(
                  'text-xs font-semibold transition',
                  highContrast ? 'text-white/[0.60] hover:text-white' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Tozalash
              </button>
            )}
          </div>

          {recent.length ? (
            <div className="pb-1">
              {recent.slice(0, 6).map((item) => (
                <button
                  key={item}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectRecent(item)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm transition',
                    highContrast ? 'hover:bg-white/[0.08]' : 'hover:bg-muted/60',
                  )}
                >
                  <Clock3 className={cn('h-4 w-4 shrink-0', highContrast ? 'text-white/[0.45]' : 'text-muted-foreground')} />
                  <span className="min-w-0 flex-1 truncate font-medium">{item}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={cn('px-4 pb-4 pt-1 text-sm', highContrast ? 'text-white/[0.55]' : 'text-muted-foreground')}>
              Joy nomini yozing — masalan, “Rahimjon ota masjidi”.
            </div>
          )}
        </>
      ) : (
        <>
          {loading && (
            <div className={cn('flex items-center gap-2 px-4 py-3 text-sm', highContrast ? 'text-white/[0.60]' : 'text-muted-foreground')}>
              <Loader2 className="h-4 w-4 animate-spin" />
              Qidirilmoqda...
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2 px-4 py-3 text-sm text-destructive">
              <X className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && places.length > 0 && (
            <div className="py-1">
              {places.slice(0, 6).map((place) => {
                const ui = categoryUi(place.categoryId);
                return (
                  <button
                    key={place.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSelectPlace(place)}
                    className={cn(
                      'flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition',
                      highContrast ? 'hover:bg-white/[0.08]' : 'hover:bg-muted/60',
                    )}
                  >
                    <span
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: ui.color + (highContrast ? '33' : '1f') }}
                    >
                      <ui.Icon className="h-4 w-4" style={{ color: ui.color }} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{place.name}</span>
                      <span
                        className={cn(
                          'mt-0.5 block truncate text-xs',
                          highContrast ? 'text-white/[0.55]' : 'text-muted-foreground',
                        )}
                      >
                        {place.address || place.categoryLabel || ui.label}
                      </span>
                    </span>

                    {place.distanceM != null && (
                      <span
                        className={cn(
                          'shrink-0 pt-0.5 text-[11px]',
                          highContrast ? 'text-white/[0.45]' : 'text-muted-foreground',
                        )}
                      >
                        {formatDistance(place.distanceM)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {!loading && !error && places.length === 0 && (
            <div className={cn('flex items-center gap-2 px-4 py-4 text-sm', highContrast ? 'text-white/[0.55]' : 'text-muted-foreground')}>
              <Search className="h-4 w-4" />
              Natija topilmadi. Nomni boshqacha yozib ko‘ring.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MapSearchSuggestions;
