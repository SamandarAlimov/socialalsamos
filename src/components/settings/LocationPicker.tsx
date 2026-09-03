import { useCallback, useMemo, useState } from 'react';
import { Loader2, LocateFixed, MapPin, Search, X } from 'lucide-react';

import { AlsamosMapSurface } from '@/components/map/AlsamosMapSurface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePlaceSearch } from '@/hooks/useMapPlaces';
import { resolveMapClickPlace, type MapPlace } from '@/lib/mapPlaces';
import type { MapSceneMarker } from '@/lib/mapEngine';
import { categoryUi } from '@/lib/placeIcons';
import { reverseGeocode } from '@/lib/reverseGeocode';
import { cn } from '@/lib/utils';

interface LocationPickerProps {
  value: string | null;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Settings location editor ham MapPage bilan bir xil provider/engine stack'da.
 * Alohida Nominatim endpoint yoki OSM iframe yo'q.
 */
export function LocationPicker({ value, onChange, className }: LocationPickerProps) {
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [resolvingPoint, setResolvingPoint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const search = usePlaceSearch(query, coords, 300);

  const applyPlace = useCallback(
    (place: MapPlace) => {
      const label = place.address ? `${place.name}, ${place.address}` : place.name;
      onChange(label);
      setCoords({ latitude: place.latitude, longitude: place.longitude });
      setQuery('');
      setError(null);
    },
    [onChange],
  );

  const useCurrentLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Brauzer joylashuvni qo‘llab-quvvatlamaydi');
      return;
    }

    setLocating(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const point = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCoords(point);

        try {
          const place = await resolveMapClickPlace(point, 16);
          if (place) {
            applyPlace(place);
          } else {
            const resolved = await reverseGeocode(point.latitude, point.longitude);
            if (resolved) onChange(resolved.full);
          }
        } catch {
          const resolved = await reverseGeocode(point.latitude, point.longitude);
          if (resolved) onChange(resolved.full);
          else setError('Nuqta aniqlandi, lekin manzil nomini olish imkoni bo‘lmadi');
        } finally {
          setLocating(false);
        }
      },
      () => {
        setError('Joylashuvga ruxsat berilmadi');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, [applyPlace, onChange]);

  const handleMapPick = useCallback(
    async (point: { latitude: number; longitude: number }, zoom: number) => {
      setCoords(point);
      setResolvingPoint(true);
      setError(null);
      try {
        const place = await resolveMapClickPlace(point, zoom);
        if (place) {
          applyPlace(place);
          return;
        }

        const resolved = await reverseGeocode(point.latitude, point.longitude);
        onChange(
          resolved?.full ??
            `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,
        );
      } catch {
        onChange(`${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`);
      } finally {
        setResolvingPoint(false);
      }
    },
    [applyPlace, onChange],
  );

  const mapMarkers = useMemo<MapSceneMarker[]>(
    () =>
      coords
        ? [
            {
              id: 'settings-location',
              kind: 'selected',
              latitude: coords.latitude,
              longitude: coords.longitude,
              label: value || 'Tanlangan joy',
              color: '#2F6FED',
              active: true,
            },
          ]
        : [],
    [coords, value],
  );

  return (
    <div className={cn('space-y-2.5', className)}>
      {value ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{value}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label="Joylashuvni tozalash"
            onClick={() => {
              onChange('');
              setCoords(null);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Shahar, tuman yoki manzilni yozing"
          className="pl-9 pr-9"
          autoComplete="off"
        />
        {search.loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {query.trim().length >= 2 && search.places.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {search.places.slice(0, 6).map((place, index) => {
            const ui = categoryUi(place.categoryId);
            const Icon = ui.Icon;
            return (
              <button
                key={place.id}
                type="button"
                onClick={() => applyPlace(place)}
                className={cn(
                  'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/60',
                  index !== 0 && 'border-t border-border/60',
                )}
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-4 w-4" style={{ color: ui.color }} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{place.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {place.address || place.categoryLabel || ui.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {(search.error || error) && (
        <p className="text-xs text-destructive">{error || search.error}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={locating}
          onClick={useCurrentLocation}
        >
          {locating ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <LocateFixed className="mr-1.5 h-3.5 w-3.5" />
          )}
          Joriy joylashuvim
        </Button>
        <span className="text-xs text-muted-foreground">
          Alsamos Xarita ma’lumotlari
        </span>
      </div>

      {coords && (
        <div className="relative h-48 overflow-hidden rounded-2xl border border-border/60 bg-muted shadow-sm">
          <AlsamosMapSurface
            center={coords}
            referenceCenter={coords}
            zoom={15}
            markers={mapMarkers}
            pickMode
            onMapClick={handleMapPick}
          />
          {resolvingPoint && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
              <span className="flex items-center gap-2 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-[11px] font-medium shadow-lg backdrop-blur">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Joy aniqlanmoqda…
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
