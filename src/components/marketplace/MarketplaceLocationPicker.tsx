import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crosshair, Loader2, MapPin, Search, X } from 'lucide-react';

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
  description?: string;
}

const DEFAULT_CENTER = { latitude: 41.311081, longitude: 69.240562 };

function validPoint(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
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
  description = 'Joriy joylashuv bilan cheklanmaydi — xaritadan istalgan manzilni belgilang yoki qidiruvdan toping.',
}: MarketplaceLocationPickerProps) {
  const controllerRef = useRef<MapEngineController | null>(null);
  const [selected, setSelected] = useState<MarketplaceLocationValue | null>(value ?? null);
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

  const selectPlace = (place: GeoPlace) => {
    const next = {
      latitude: place.latitude,
      longitude: place.longitude,
      label: placeLabel(place),
    };
    setSelected(next);
    setCenter({ latitude: place.latitude, longitude: place.longitude });
    setQuery('');
    setResults([]);
    controllerRef.current?.flyTo([place.latitude, place.longitude], 16, { animate: true });
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
    onSelect(selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="marketplace-neutral max-w-4xl overflow-hidden p-0 sm:rounded-3xl">
        <DialogHeader className="border-b border-border/60 px-5 py-4 text-left">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-[620px] grid-rows-[auto_1fr_auto] lg:grid-cols-[340px_1fr] lg:grid-rows-[1fr_auto]">
          <div className="relative z-20 border-b border-border/60 bg-background p-4 lg:border-b-0 lg:border-r">
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
                    <p className="mt-1 text-sm font-medium">
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

              {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
            </div>
          </div>

          <div className="relative min-h-[360px] overflow-hidden bg-muted lg:min-h-0">
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
            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur">
              Nuqtani tanlash uchun xaritani bosing
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-background px-4 py-3 lg:col-span-2">
            <p className="hidden text-xs text-muted-foreground sm:block">
              Bu manzil Marketplace qidiruvi, mahsulot joylashuvi yoki yetkazib berish uchun ishlatiladi.
            </p>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
                Bekor qilish
              </Button>
              <Button type="button" className="rounded-xl" onClick={confirm} disabled={!selected || isResolving}>
                <Check className="mr-2 h-4 w-4" />
                Manzilni tanlash
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
