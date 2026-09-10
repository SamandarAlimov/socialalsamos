import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crosshair, History, Loader2, MapPin, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LeafletMapSurface } from '@/components/map/engine/LeafletMapSurface';
import { searchPlaces, reverseGeocode, type GeoPlace } from '@/lib/geocoding';
import type { MapEngineController, MapSceneMarker } from '@/lib/mapEngine';
import { cn } from '@/lib/utils';

export interface MarketplaceLocationValue {
  latitude: number;
  longitude: number;
  label: string;
  accuracy?: number | null;
}

interface MarketplaceLocationPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value?: MarketplaceLocationValue | null;
  onSelect: (location: MarketplaceLocationValue) => void;
  title?: string;
}

const DEFAULT_CENTER = { latitude: 41.311081, longitude: 69.240562 };
const RECENT_LOCATIONS_STORAGE_KEY = 'alsamos:marketplace:delivery-location-history';
const MAX_RECENT_LOCATIONS = 6;

function validPoint(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

function validLocation(value: MarketplaceLocationValue | null | undefined): value is MarketplaceLocationValue {
  return Boolean(
    value &&
    validPoint(Number(value.latitude), Number(value.longitude)) &&
    typeof value.label === 'string' &&
    value.label.trim(),
  );
}

function normalizeLocation(value: MarketplaceLocationValue): MarketplaceLocationValue {
  return {
    latitude: Number(value.latitude),
    longitude: Number(value.longitude),
    label: value.label.trim(),
    accuracy: Number.isFinite(Number(value.accuracy)) ? Number(value.accuracy) : null,
  };
}

function sameLocation(a: MarketplaceLocationValue, b: MarketplaceLocationValue) {
  return (
    Math.abs(a.latitude - b.latitude) < 0.00001 &&
    Math.abs(a.longitude - b.longitude) < 0.00001
  );
}

function readRecentLocations(): MarketplaceLocationValue[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_LOCATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is MarketplaceLocationValue => validLocation(item))
      .map(normalizeLocation)
      .slice(0, MAX_RECENT_LOCATIONS);
  } catch {
    return [];
  }
}

function mergeRecentLocation(
  location: MarketplaceLocationValue,
  current: MarketplaceLocationValue[],
) {
  const normalized = normalizeLocation(location);
  return [normalized, ...current.filter(item => !sameLocation(item, normalized))]
    .slice(0, MAX_RECENT_LOCATIONS);
}

function persistRecentLocations(locations: MarketplaceLocationValue[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RECENT_LOCATIONS_STORAGE_KEY, JSON.stringify(locations));
  } catch {
    // Location history is a convenience preference; selection still works.
  }
}

function pointLabel(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function placeLabel(place: GeoPlace) {
  const values = [place.name, place.address]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(values)).join(', ') || pointLabel(place.latitude, place.longitude);
}

export function MarketplaceLocationPicker({
  open,
  onOpenChange,
  value,
  onSelect,
  title = 'Joylashuvni xaritadan tanlang',
}: MarketplaceLocationPickerProps) {
  const controllerRef = useRef<MapEngineController | null>(null);
  const [selected, setSelected] = useState<MarketplaceLocationValue | null>(value ?? null);
  const [recentLocations, setRecentLocations] = useState<MarketplaceLocationValue[]>([]);
  const [center, setCenter] = useState(() =>
    value && validPoint(value.latitude, value.longitude)
      ? { latitude: value.latitude, longitude: value.longitude }
      : DEFAULT_CENTER,
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setSelected(value ?? null);
    setQuery('');
    setResults([]);
    setError(null);

    const stored = readRecentLocations();
    if (value && validLocation(value)) {
      const merged = mergeRecentLocation(value, stored);
      setRecentLocations(merged);
      persistRecentLocations(merged);
    } else {
      setRecentLocations(stored);
    }

    if (value && validPoint(value.latitude, value.longitude)) {
      const next = { latitude: value.latitude, longitude: value.longitude };
      setCenter(next);
      requestAnimationFrame(() => controllerRef.current?.setView([next.latitude, next.longitude], 15));
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      void searchPlaces(term, selected ?? center, controller.signal)
        .then(data => setResults(data.slice(0, 8)))
        .catch(reason => {
          if (reason instanceof Error && reason.name === 'AbortError') return;
          setResults([]);
        })
        .finally(() => setIsSearching(false));
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [center, open, query, selected]);

  const markers = useMemo<MapSceneMarker[]>(() => {
    if (!selected) return [];
    return [{
      id: 'marketplace-selected-location',
      kind: 'selected',
      latitude: selected.latitude,
      longitude: selected.longitude,
      label: selected.label,
      active: true,
    }];
  }, [selected]);

  const selectCoordinates = async (latitude: number, longitude: number) => {
    if (!validPoint(latitude, longitude)) return;
    setError(null);
    setIsResolving(true);
    const nextCenter = { latitude, longitude };
    setCenter(nextCenter);

    try {
      const place = await reverseGeocode(latitude, longitude);
      setSelected({
        latitude,
        longitude,
        label: place ? placeLabel(place) : pointLabel(latitude, longitude),
      });
    } catch {
      setSelected({ latitude, longitude, label: pointLabel(latitude, longitude) });
    } finally {
      setIsResolving(false);
    }
  };

  const selectLocation = (location: MarketplaceLocationValue) => {
    const next = normalizeLocation(location);
    setSelected(next);
    setCenter({ latitude: next.latitude, longitude: next.longitude });
    setQuery('');
    setResults([]);
    setError(null);
    controllerRef.current?.flyTo([next.latitude, next.longitude], 16, { animate: true });
  };

  const selectPlace = (place: GeoPlace) => {
    selectLocation({
      latitude: place.latitude,
      longitude: place.longitude,
      label: placeLabel(place),
    });
  };

  const useCurrentLocation = async () => {
    if (!('geolocation' in navigator)) {
      setError('Qurilma joylashuvni aniqlashni qo‘llab-quvvatlamaydi.');
      return;
    }

    setIsLocating(true);
    setError(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 60000,
        });
      });
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      controllerRef.current?.flyTo([latitude, longitude], 16, { animate: true });
      await selectCoordinates(latitude, longitude);
      setSelected(previous => previous ? { ...previous, accuracy: position.coords.accuracy ?? null } : previous);
    } catch (reason: any) {
      setError(
        reason?.code === 1
          ? 'Joylashuvga ruxsat berilmadi. Xaritadan qo‘lda tanlashingiz mumkin.'
          : 'Joriy joylashuvni aniqlab bo‘lmadi. Xaritadan qo‘lda tanlang.',
      );
    } finally {
      setIsLocating(false);
    }
  };

  const confirm = () => {
    if (!selected) {
      setError('Avval xaritadan manzilni tanlang.');
      return;
    }

    const nextRecent = mergeRecentLocation(selected, recentLocations);
    setRecentLocations(nextRecent);
    persistRecentLocations(nextRecent);
    onSelect(selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="marketplace-neutral flex h-[calc(100dvh-1rem)] max-h-[820px] w-[calc(100vw-1rem)] max-w-[1120px] flex-col gap-0 overflow-hidden p-0 sm:h-[min(820px,calc(100dvh-2rem))] sm:w-[calc(100vw-2rem)] sm:rounded-3xl"
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3.5 text-left sm:px-5 sm:py-4">
          <DialogTitle className="pr-8 text-base sm:text-lg">{title}</DialogTitle>
          <DialogDescription className="sr-only">Manzilni qidirish va xaritadan tanlash</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(175px,0.9fr)_minmax(220px,1.1fr)_auto] md:grid-cols-[320px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="relative z-20 min-h-0 overflow-y-auto border-b border-border/60 bg-background p-3 overscroll-contain md:border-b-0 md:border-r md:p-4">
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Shahar, ko‘cha yoki manzil qidiring"
                  className="h-11 rounded-xl pl-9 pr-9"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Qidiruvni tozalash"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                className="h-11 w-full justify-start rounded-xl"
                onClick={() => void useCurrentLocation()}
                disabled={isLocating}
              >
                {isLocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
                Joriy joylashuvim
              </Button>

              {(isSearching || results.length > 0) && (
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm">
                  {isSearching && results.length === 0 ? (
                    <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Qidirilmoqda…
                    </div>
                  ) : (
                    results.map(place => (
                      <button
                        key={`${place.externalSource}:${place.externalId}`}
                        type="button"
                        onClick={() => selectPlace(place)}
                        className="flex w-full gap-2 border-b border-border/50 p-3 text-left last:border-b-0 hover:bg-muted/45"
                      >
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{place.name}</span>
                          {place.address && <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{place.address}</span>}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className={cn(
                'rounded-2xl border p-3',
                selected ? 'border-foreground/20 bg-muted/30' : 'border-dashed border-border bg-muted/15',
              )}>
                <div className="flex gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tanlangan manzil</p>
                    <p className="mt-1 line-clamp-2 text-sm font-medium">
                      {selected?.label || 'Xaritadagi kerakli nuqtani bosing'}
                    </p>
                    {selected && (
                      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                        {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                      </p>
                    )}
                  </div>
                  {isResolving && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                </div>
              </div>

              {recentLocations.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground">
                    <History className="h-3.5 w-3.5" />
                    Oldingi manzillar
                  </div>
                  <div className="space-y-1.5">
                    {recentLocations.map((location, index) => (
                      <button
                        key={`${location.latitude}:${location.longitude}:${index}`}
                        type="button"
                        onClick={() => selectLocation(location)}
                        className={cn(
                          'flex w-full min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition hover:bg-muted/55',
                          selected && sameLocation(selected, location)
                            ? 'border-foreground/20 bg-muted/45'
                            : 'border-border/50 bg-background',
                        )}
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">{location.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
            </div>
          </div>

          <div className="relative min-h-0 overflow-hidden bg-muted md:col-start-2 md:row-start-1">
            <LeafletMapSurface
              controllerRef={controllerRef}
              center={center}
              zoom={14}
              layerId="map"
              overlays={[]}
              markers={markers}
              lines={[]}
              pickMode
              referenceCenter={center}
              onViewport={() => undefined}
              onMovedCenter={() => undefined}
              onMapClick={(point) => selectCoordinates(point.latitude, point.longitude)}
            />
            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-background/90 px-3 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur">
              Nuqtani tanlash uchun xaritani bosing
            </div>
          </div>

          <div className="flex shrink-0 items-center border-t border-border/60 bg-background px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:col-span-2 md:px-4 md:pb-3">
            <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto">
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-0 rounded-xl px-3 sm:px-4"
                onClick={() => onOpenChange(false)}
              >
                Bekor qilish
              </Button>
              <Button
                type="button"
                className="h-11 min-w-0 rounded-xl px-3 sm:px-4"
                onClick={confirm}
                disabled={!selected || isResolving}
              >
                <Check className="mr-1.5 h-4 w-4 shrink-0 sm:mr-2" />
                <span className="sm:hidden">Tanlash</span>
                <span className="hidden sm:inline">Manzilni tanlash</span>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
