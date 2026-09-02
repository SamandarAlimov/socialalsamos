import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Check,
  Crosshair,
  Loader2,
  LocateFixed,
  MapPinned,
  MapPin,
  Radio,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistance } from '@/lib/geocoding';
import {
  PLACE_CATEGORIES,
  fetchPlacesByCategory,
  resolveMapClickPlace,
  searchMapPlaces,
  type MapPlace,
  type PlaceCategoryId,
} from '@/lib/mapPlaces';
import type { PostLocationInput } from '@/lib/postMeta';
import { reverseGeocode, type ResolvedAddress } from '@/lib/reverseGeocode';

interface LocationPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (location: PostLocationInput) => void;
  initialCenter?: { latitude: number; longitude: number } | null;
}

type PickerMode = 'place' | 'pin' | 'live';

const TILE_URL = ['https://', '{s}', '.tile.openstreetmap.org/', '{z}/{x}/{y}', '.png'].join('');
const DEFAULT_CENTER = { latitude: 41.2995, longitude: 69.2401 };

const PIN_ICON = L.divIcon({
  className: 'alsamos-map-pin',
  html: [
    '<span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;transform:translate(-50%,-100%)">',
    '<svg viewBox="0 0 24 24" width="34" height="34" fill="#ef4444" stroke="#ffffff" stroke-width="1.5">',
    '<path d="M12 2c-3.9 0-7 3.1-7 7 0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z"/>',
    '<circle cx="12" cy="9" r="2.4" fill="#ffffff" stroke="none"/>',
    '</svg></span>',
  ].join(''),
  iconSize: [34, 34],
  iconAnchor: [0, 0],
});

const LIVE_DURATIONS = [
  { label: '15 daqiqa', minutes: 15 },
  { label: '1 soat', minutes: 60 },
  { label: '8 soat', minutes: 480 },
];

const QUICK_CATEGORIES = PLACE_CATEGORIES.filter((category) =>
  ['restaurant', 'cafe', 'fuel', 'pharmacy', 'market', 'mosque', 'parking', 'atm'].includes(
    category.id,
  ),
);

function MapClickHandler({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (lat: number, lng: number, zoom: number) => void;
}) {
  const map = useMapEvents({
    click: (event) => {
      if (enabled) onPick(event.latlng.lat, event.latlng.lng, map.getZoom());
    },
  });
  return null;
}

function MapCenterSync({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const map = useMap();
  useEffect(() => {
    const zoom = map.getZoom();
    map.setView([latitude, longitude], zoom < 14 ? 15 : zoom, { animate: true });
  }, [latitude, longitude, map]);
  return null;
}

function toLocation(place: MapPlace): PostLocationInput {
  return {
    mode: 'place',
    latitude: place.latitude,
    longitude: place.longitude,
    label: place.name,
    place: {
      name: place.name,
      address: place.address ?? null,
      category: place.categoryLabel ?? place.categoryId ?? null,
      externalSource: place.source,
      externalId: place.id,
    },
  };
}

export function LocationPicker({
  open,
  onClose,
  onSelect,
  initialCenter,
}: LocationPickerProps) {
  const [mode, setMode] = useState<PickerMode>('place');
  const [myCoords, setMyCoords] = useState<{ latitude: number; longitude: number } | null>(
    initialCenter ?? null,
  );
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MapPlace[]>([]);
  const [nearby, setNearby] = useState<MapPlace[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<PlaceCategoryId | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);

  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null);
  const [currentPlace, setCurrentPlace] = useState<MapPlace | null>(null);
  const [currentAddress, setCurrentAddress] = useState<ResolvedAddress | null>(null);
  const [isResolvingCurrent, setIsResolvingCurrent] = useState(false);
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pinLabel, setPinLabel] = useState<string | null>(null);
  const [isResolvingPin, setIsResolvingPin] = useState(false);
  const [liveMinutes, setLiveMinutes] = useState(60);

  const searchAbort = useRef<AbortController | null>(null);
  const nearbyAbort = useRef<AbortController | null>(null);
  const resolveAbort = useRef<AbortController | null>(null);
  const currentResolveAbort = useRef<AbortController | null>(null);

  const center = selectedPlace ?? pin ?? myCoords ?? initialCenter ?? DEFAULT_CENTER;

  const locateMe = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocationError('Qurilma joylashuvni qo‘llab-quvvatlamaydi');
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setMyCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setAccuracy(position.coords.accuracy ?? null);
        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? 'Joylashuvga ruxsat berilmadi. Brauzer sozlamalaridan yoqing.'
            : 'Joylashuvni aniqlab bo‘lmadi',
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, []);

  useEffect(() => {
    if (open && !myCoords) locateMe();
  }, [locateMe, myCoords, open]);

  useEffect(() => {
    if (!open || mode !== 'place' || !myCoords) {
      setCurrentPlace(null);
      setCurrentAddress(null);
      setIsResolvingCurrent(false);
      return;
    }

    currentResolveAbort.current?.abort();
    const controller = new AbortController();
    currentResolveAbort.current = controller;
    setIsResolvingCurrent(true);

    void Promise.all([
      resolveMapClickPlace(myCoords, 18, controller.signal).catch((error) => {
        if ((error as Error).name === 'AbortError') return null;
        return null;
      }),
      reverseGeocode(myCoords.latitude, myCoords.longitude, controller.signal),
    ]).then(([place, address]) => {
      if (controller.signal.aborted) return;
      setCurrentPlace(place);
      setCurrentAddress(address);
      setIsResolvingCurrent(false);
    });

    return () => controller.abort();
  }, [mode, myCoords, open]);

  useEffect(() => {
    if (!open || mode !== 'place') return;

    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;

    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await searchMapPlaces(
          term,
          myCoords ?? initialCenter ?? null,
          controller.signal,
        );
        if (!controller.signal.aborted) setResults(response.places);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Create place search xatosi:', error);
          if (!controller.signal.aborted) setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [initialCenter, mode, myCoords, open, query]);

  useEffect(() => {
    if (!open || mode !== 'place' || !myCoords) {
      setNearby([]);
      return;
    }

    nearbyAbort.current?.abort();
    const controller = new AbortController();
    nearbyAbort.current = controller;

    const load = async () => {
      setIsLoadingNearby(true);
      try {
        let places: MapPlace[];

        if (selectedCategory) {
          places = await fetchPlacesByCategory(selectedCategory, myCoords, {
            radiusM: 7000,
            limit: 30,
            signal: controller.signal,
          });
        } else {
          const ids: PlaceCategoryId[] = [
            'restaurant',
            'cafe',
            'pharmacy',
            'fuel',
            'market',
            'mosque',
          ];
          const settled = await Promise.allSettled(
            ids.map((id) =>
              fetchPlacesByCategory(id, myCoords, {
                radiusM: 5000,
                limit: 7,
                signal: controller.signal,
              }),
            ),
          );

          const merged = new Map<string, MapPlace>();
          for (const item of settled) {
            if (item.status !== 'fulfilled') continue;
            for (const place of item.value) merged.set(place.id, place);
          }
          places = Array.from(merged.values())
            .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
            .slice(0, 36);
        }

        if (!controller.signal.aborted) setNearby(places);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Create nearby places xatosi:', error);
          if (!controller.signal.aborted) setNearby([]);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingNearby(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [mode, myCoords, open, selectedCategory]);

  useEffect(
    () => () => {
      searchAbort.current?.abort();
      nearbyAbort.current?.abort();
      resolveAbort.current?.abort();
      currentResolveAbort.current?.abort();
    },
    [],
  );

  const handleMapPick = useCallback(
    async (latitude: number, longitude: number, zoom: number) => {
      resolveAbort.current?.abort();
      const controller = new AbortController();
      resolveAbort.current = controller;

      setIsResolvingPin(true);
      setPin({ latitude, longitude });
      setPinLabel(null);

      if (mode === 'place') setSelectedPlace(null);

      try {
        const place = await resolveMapClickPlace({ latitude, longitude }, zoom, controller.signal);
        if (controller.signal.aborted) return;

        if (mode === 'place' && place) {
          setSelectedPlace(place);
          setPin({ latitude: place.latitude, longitude: place.longitude });
        } else {
          setPinLabel(place?.address ?? place?.name ?? null);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Map click resolve xatosi:', error);
        }
      } finally {
        if (!controller.signal.aborted) setIsResolvingPin(false);
      }
    },
    [mode],
  );

  const handleSelectPlace = useCallback(
    (place: MapPlace) => {
      onSelect(toLocation(place));
      onClose();
    },
    [onClose, onSelect],
  );

  const handleSelectCurrentLocation = useCallback(() => {
    if (!myCoords) {
      locateMe();
      return;
    }

    const name =
      currentPlace?.name ??
      currentAddress?.short ??
      'Joriy joylashuv';
    const address =
      currentPlace?.address ??
      currentAddress?.full ??
      null;

    onSelect({
      mode: 'place',
      latitude: myCoords.latitude,
      longitude: myCoords.longitude,
      label: name,
      accuracyM: accuracy,
      place:
        currentPlace
          ? {
              name: currentPlace.name,
              address: currentPlace.address ?? currentAddress?.full ?? null,
              category: currentPlace.categoryLabel ?? currentPlace.categoryId ?? null,
              externalSource: currentPlace.source,
              externalId: currentPlace.canonicalId ?? currentPlace.id,
            }
          : currentAddress
            ? {
                name: currentAddress.short,
                address: currentAddress.full,
                category: 'Joylashuv',
                externalSource: null,
                externalId: null,
              }
            : null,
    });
    onClose();
  }, [
    accuracy,
    currentAddress,
    currentPlace,
    locateMe,
    myCoords,
    onClose,
    onSelect,
  ]);

  const handleConfirmMapSelection = useCallback(() => {
    if (mode === 'place' && selectedPlace) {
      handleSelectPlace(selectedPlace);
      return;
    }

    if (mode === 'pin' && pin) {
      onSelect({
        mode: 'place',
        latitude: pin.latitude,
        longitude: pin.longitude,
        label: pinLabel ?? 'Xaritadagi aniq nuqta',
        accuracyM: accuracy,
        place: null,
      });
      onClose();
    }
  }, [accuracy, handleSelectPlace, mode, onClose, onSelect, pin, pinLabel, selectedPlace]);

  const handleShareLive = useCallback(() => {
    if (!myCoords) {
      locateMe();
      return;
    }

    onSelect({
      mode: 'live',
      latitude: myCoords.latitude,
      longitude: myCoords.longitude,
      label: 'Real vaqtli joylashuv',
      accuracyM: accuracy,
      liveUntil: new Date(Date.now() + liveMinutes * 60_000).toISOString(),
    });
    onClose();
  }, [accuracy, liveMinutes, locateMe, myCoords, onClose, onSelect]);

  const list = query.trim().length >= 2 ? results : nearby;

  const selectionLabel = useMemo(() => {
    if (mode === 'place' && selectedPlace) {
      return {
        title: selectedPlace.name,
        subtitle: selectedPlace.address ?? selectedPlace.categoryLabel ?? 'Joy',
      };
    }

    if (mode === 'pin' && pin) {
      return {
        title: isResolvingPin ? 'Nuqta aniqlanmoqda...' : 'Aniq nuqta',
        subtitle: pinLabel ?? `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`,
      };
    }

    return null;
  }, [isResolvingPin, mode, pin, pinLabel, selectedPlace]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex h-[100dvh] min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
        <h2 className="text-base font-semibold">Joylashuv</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Yopish"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-2 px-4 py-3">
        {([
          ['place', 'Joy', MapPin],
          ['pin', 'Aniq pin', MapPinned],
          ['live', 'Jonli', Radio],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMode(id);
              setSelectedPlace(null);
              setPin(null);
              setPinLabel(null);
            }}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-medium transition',
              mode === id
                ? 'border-foreground/25 bg-muted text-foreground'
                : 'border-border/60 text-muted-foreground hover:bg-muted',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="relative h-[38dvh] min-h-[220px] shrink-0 overflow-hidden border-y border-border/60">
        <MapContainer
          center={[center.latitude, center.longitude]}
          zoom={15}
          scrollWheelZoom
          className="h-full w-full"
          attributionControl={false}
        >
          <TileLayer url={TILE_URL} maxZoom={19} />
          <MapCenterSync latitude={center.latitude} longitude={center.longitude} />
          <MapClickHandler enabled={mode !== 'live'} onPick={handleMapPick} />
          {mode === 'place' && selectedPlace && (
            <Marker
              position={[selectedPlace.latitude, selectedPlace.longitude]}
              icon={PIN_ICON}
            />
          )}
          {mode === 'pin' && pin && <Marker position={[pin.latitude, pin.longitude]} icon={PIN_ICON} />}
          {mode === 'live' && myCoords && (
            <Marker position={[myCoords.latitude, myCoords.longitude]} icon={PIN_ICON} />
          )}
        </MapContainer>

        <button
          type="button"
          onClick={locateMe}
          aria-label="Mening joylashuvim"
          className="absolute bottom-3 right-3 z-[500] flex h-10 w-10 items-center justify-center rounded-full bg-background/95 shadow-lg"
        >
          {isLocating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Crosshair className="h-4 w-4" />
          )}
        </button>

        {mode !== 'live' && (
          <p className="absolute left-3 top-3 z-[500] rounded-full bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground shadow">
            {mode === 'place' ? 'Joyni bosib tanlang' : 'Aniq nuqtani belgilang'}
          </p>
        )}
      </div>

      {selectionLabel && (
        <div className="mx-4 mt-3 flex shrink-0 items-center gap-3 rounded-xl border border-primary/35 bg-primary/5 p-3">
          {mode === 'place' ? (
            <MapPin className="h-5 w-5 shrink-0 text-primary" />
          ) : (
            <LocateFixed className="h-5 w-5 shrink-0 text-primary" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selectionLabel.title}</p>
            <p className="truncate text-xs text-muted-foreground">{selectionLabel.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={handleConfirmMapSelection}
            disabled={isResolvingPin || (mode === 'place' && !selectedPlace)}
            className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Tanlash
          </button>
        </div>
      )}

      {locationError && <p className="shrink-0 px-4 pt-3 text-xs text-destructive">{locationError}</p>}

      {mode === 'place' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-3 px-4 pt-3">
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Joy nomini qidirish..."
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {isSearching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {query && !isSearching && (
                <button type="button" onClick={() => setQuery('')} aria-label="Tozalash">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>

            {query.trim().length < 2 && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hidden">
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium',
                    selectedCategory === null
                      ? 'border-foreground/25 bg-muted text-foreground'
                      : 'border-border/60 text-muted-foreground',
                  )}
                >
                  Yaqin
                </button>
                {QUICK_CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelectedCategory(category.id)}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium',
                      selectedCategory === category.id
                        ? 'border-foreground/25 bg-muted text-foreground'
                        : 'border-border/60 text-muted-foreground',
                    )}
                  >
                    {category.emoji} {category.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {query.trim().length < 2 && (
            <div className="px-4 pt-3">
              <button
                type="button"
                onClick={handleSelectCurrentLocation}
                disabled={isLocating || isResolvingCurrent}
                className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card px-3 py-3 text-left shadow-sm transition hover:bg-muted/40 disabled:cursor-wait disabled:opacity-70"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                  {isLocating || isResolvingCurrent ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <LocateFixed className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {currentPlace?.name ??
                      currentAddress?.short ??
                      (myCoords ? 'Joy aniqlanmoqda…' : 'Joriy joylashuv')}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {currentPlace?.address ??
                      currentAddress?.full ??
                      (myCoords
                        ? myCoords.latitude.toFixed(5) + ', ' + myCoords.longitude.toFixed(5)
                        : 'Qurilmaning hozirgi joyini aniqlash')}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-link">
                  Tanlash
                </span>
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 [-webkit-overflow-scrolling:touch]">
            {(isLoadingNearby || isSearching) && list.length === 0 ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : list.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {query.trim().length >= 2
                  ? 'Mos joy topilmadi'
                  : myCoords
                    ? 'Yaqin joy topilmadi. Xaritadan tanlang.'
                    : 'Yaqin joylar uchun joylashuvga ruxsat bering.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {list.map((place) => (
                  <li key={place.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectPlace(place)}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-muted"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{place.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[place.categoryLabel, place.address].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {place.distanceM != null && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDistance(place.distanceM)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : mode === 'pin' ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="rounded-2xl border border-border/60 p-4 text-sm text-muted-foreground">
            Xaritada istalgan nuqtani bosing. Bu rejim yaqin POI nomiga bog‘lanmaydi —
            post aynan siz belgilagan koordinatani saqlaydi.
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="rounded-2xl border border-border/60 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Radio className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Jonli joylashuv</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Post yaratilgach, belgilangan muddat davomida koordinata yangilanib boradi.
                </p>
                {myCoords && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {myCoords.latitude.toFixed(5)}, {myCoords.longitude.toFixed(5)}
                    {accuracy ? ' · ±' + Math.round(accuracy) + ' m' : ''}
                  </p>
                )}
              </div>
            </div>

            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Muddat
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {LIVE_DURATIONS.map((duration) => (
                <button
                  key={duration.minutes}
                  type="button"
                  onClick={() => setLiveMinutes(duration.minutes)}
                  className={cn(
                    'rounded-xl border px-2 py-2 text-xs font-medium transition',
                    liveMinutes === duration.minutes
                      ? 'border-foreground/25 bg-muted text-foreground'
                      : 'border-border/60 text-muted-foreground',
                  )}
                >
                  {duration.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleShareLive}
              disabled={isLocating}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {isLocating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Radio className="h-4 w-4" />
              )}
              {myCoords ? 'Jonli ulashishni tanlash' : 'Joylashuvni aniqlash'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
