import { useEffect, useMemo, useState } from 'react';
import { Clock3, Layers3, Loader2, Search, X } from 'lucide-react';
import type { MapPlace, PlaceCategory } from '@/lib/mapPlaces';
import { searchCategorySuggestions } from '@/lib/mapPlaces';
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
  onSelectCategory: (category: PlaceCategory) => void;
  onSelectRecent: (value: string) => void;
  onClearRecent: () => void;
}

type KeyboardItem =
  | { type: 'recent'; value: string }
  | { type: 'category'; value: PlaceCategory }
  | { type: 'place'; value: MapPlace };

export function MapSearchSuggestions({
  query,
  places,
  loading,
  error,
  recent,
  visible,
  highContrast = false,
  onSelectPlace,
  onSelectCategory,
  onSelectRecent,
  onClearRecent,
}: MapSearchSuggestionsProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const term = query.trim();
  const showRecent = term.length < 2;
  const categories = useMemo(
    () => (showRecent ? [] : searchCategorySuggestions(term, 4)),
    [showRecent, term],
  );

  const keyboardItems = useMemo<KeyboardItem[]>(() => {
    if (showRecent) {
      return recent.slice(0, 6).map((value) => ({ type: 'recent' as const, value }));
    }
    return [
      ...categories.map((value) => ({ type: 'category' as const, value })),
      ...places.slice(0, 6).map((value) => ({ type: 'place' as const, value })),
    ];
  }, [showRecent, recent, categories, places]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [query, visible]);

  useEffect(() => {
    if (!visible) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        if (!keyboardItems.length) return;
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % keyboardItems.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        if (!keyboardItems.length) return;
        event.preventDefault();
        setActiveIndex((current) =>
          current <= 0 ? keyboardItems.length - 1 : current - 1,
        );
        return;
      }

      if (event.key !== 'Enter') return;
      const fallback =
        keyboardItems[activeIndex] ??
        (!showRecent && places.length
          ? ({ type: 'place', value: places[0] } as KeyboardItem)
          : keyboardItems[0]);
      if (!fallback) return;

      event.preventDefault();
      if (fallback.type === 'place') onSelectPlace(fallback.value);
      if (fallback.type === 'category') onSelectCategory(fallback.value);
      if (fallback.type === 'recent') onSelectRecent(fallback.value);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    visible,
    keyboardItems,
    activeIndex,
    showRecent,
    places,
    onSelectPlace,
    onSelectCategory,
    onSelectRecent,
  ]);

  if (!visible) return null;

  const surface = highContrast
    ? 'border-white/15 bg-slate-950/94 text-white'
    : 'border-border/50 bg-background/96 text-foreground';
  const hover = highContrast ? 'hover:bg-white/[0.08]' : 'hover:bg-muted/60';
  const active = highContrast ? 'bg-white/[0.11]' : 'bg-primary/[0.07]';

  return (
    <div
      className={cn(
        'absolute inset-x-0 top-[52px] z-[1250] max-h-[min(70vh,520px)] overflow-y-auto rounded-[20px] border shadow-2xl backdrop-blur-2xl map-panel-scrollbar',
        surface,
      )}
    >
      {showRecent ? (
        <>
          <div className="flex items-center justify-between px-3.5 pb-2 pt-3">
            <p
              className={cn(
                'text-xs font-semibold uppercase tracking-wide',
                highContrast ? 'text-white/[0.55]' : 'text-muted-foreground',
              )}
            >
              Oxirgi qidiruvlar
            </p>
            {recent.length > 0 && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onClearRecent}
                className={cn(
                  'text-xs font-semibold transition',
                  highContrast
                    ? 'text-white/[0.60] hover:text-white'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Tozalash
              </button>
            )}
          </div>

          {recent.length ? (
            <div className="pb-1">
              {recent.slice(0, 6).map((item, index) => (
                <button
                  key={item}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectRecent(item)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm transition',
                    hover,
                    activeIndex === index && active,
                  )}
                >
                  <Clock3
                    className={cn(
                      'h-4 w-4 shrink-0',
                      highContrast ? 'text-white/[0.45]' : 'text-muted-foreground',
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{item}</span>
                </button>
              ))}
            </div>
          ) : (
            <div
              className={cn(
                'px-4 pb-4 pt-1 text-sm',
                highContrast ? 'text-white/[0.55]' : 'text-muted-foreground',
              )}
            >
              Joy nomini yozing — masalan, “Rahimjon ota masjidi”.
            </div>
          )}
        </>
      ) : (
        <>
          {categories.length > 0 && (
            <div className={cn('border-b py-1', highContrast ? 'border-white/10' : 'border-border/30')}>
              <div
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em]',
                  highContrast ? 'text-white/[0.42]' : 'text-muted-foreground',
                )}
              >
                <Layers3 className="h-3 w-3" />
                Kategoriyalar
              </div>
              {categories.map((category, index) => {
                const itemIndex = index;
                const ui = categoryUi(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(itemIndex)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSelectCategory(category)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition',
                      hover,
                      activeIndex === itemIndex && active,
                    )}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: ui.color + (highContrast ? '33' : '1f') }}
                    >
                      <ui.Icon className="h-4 w-4" style={{ color: ui.color }} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{category.label}</span>
                      <span
                        className={cn(
                          'block truncate text-[11px]',
                          highContrast ? 'text-white/[0.48]' : 'text-muted-foreground',
                        )}
                      >
                        Yaqin atrofdagi {category.label.toLocaleLowerCase('uz-UZ')}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {loading && (
            <div
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm',
                highContrast ? 'text-white/[0.60]' : 'text-muted-foreground',
              )}
            >
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
              <div
                className={cn(
                  'px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em]',
                  highContrast ? 'text-white/[0.42]' : 'text-muted-foreground',
                )}
              >
                Joylar
              </div>
              {places.slice(0, 6).map((place, index) => {
                const itemIndex = categories.length + index;
                const ui = categoryUi(place.categoryId);
                return (
                  <button
                    key={place.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(itemIndex)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSelectPlace(place)}
                    className={cn(
                      'flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition',
                      hover,
                      activeIndex === itemIndex && active,
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

          {!loading && !error && places.length === 0 && categories.length === 0 && (
            <div
              className={cn(
                'flex items-center gap-2 px-4 py-4 text-sm',
                highContrast ? 'text-white/[0.55]' : 'text-muted-foreground',
              )}
            >
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
