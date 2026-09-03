import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Banknote,
  Check,
  CircleParking,
  Coffee,
  Crosshair,
  Fuel,
  Landmark,
  Loader2,
  LocateFixed,
  MapPinned,
  MapPin,
  Navigation,
  Pill,
  Radio,
  Search,
  Store,
  UtensilsCrossed,
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
import { UI_LAYER } from '@/lib/uiLayers';

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
    '<svg viewBox="0 0 24 24" width="34" height="34" fill="#2563eb" stroke="#ffffff" stroke-width="1.6" style="filter:drop-shadow(0 4px 7px rgba(15,23,42,.28))">',
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

function categoryIcon(categoryId?: PlaceCategoryId | null) {
  switch (categoryId) {
    case 'restaurant':
      return UtensilsCrossed;
    case 'cafe':
      return Coffee;
    case 'fuel':
      return Fuel;
    case 'pharmacy':
      return Pill;
    case 'market':
    case 'supermarket':
      return Store;
    case 'mosque':
      return Landmark;
    case 'parking':
      return CircleParking;
    case 'atm':
    case 'bank':
      return Banknote;
    default:
      return MapPin;
  }
}

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
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, open]);

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

  const picker = (
    <div
      className={cn(
        'fixed inset-0 flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background',
        UI_LAYER.immersive,
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Joylashuvni tanlash"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <MapPinned className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em] sm:text-base">
              Joylashuvni tanlang
            </h2>
            <p className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">
              Joy, aniq nuqta yoki jonli lokatsiyani postga qo‘shing
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Yopish"
          title="Yopish (Esc)"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground active:scale-95"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </header>

      <div className="shrink-0 border-b border-border/50 bg-background/95 px-3 py-2.5 sm:px-5">
        <div className="mx-auto grid max-w-5xl grid-cols-3 gap-1.5 rounded-2xl border border-border/50 bg-muted/35 p-1.5">
          {([
            ['place', 'Joy', 'Yaqin joylar', MapPin],
            ['pin', 'Aniq pin', 'Xaritadan belgilang', MapPinned],
            ['live', 'Jonli', 'Real vaqt', Radio],
          ] as const).map(([id, label, hint, Icon]) => {
            const active = mode === id;
            return (
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
                  'flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-left transition-all duration-200 sm:px-3',
                  active
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border/60'
                    : 'text-muted-foreground hover:bg-background/55 hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors',
                    active
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'bg-background/70 text-muted-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold sm:text-[13px]">{label}</span>
                  <span className="hidden truncate text-[10px] text-muted-foreground md:block">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-muted/[0.14]">
        <div className="relative mx-3 mt-3 h-[31dvh] min-h-[220px] shrink-0 overflow-hidden rounded-[24px] border border-border/60 bg-muted shadow-sm sm:mx-5 sm:h-[34dvh]">
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
            {mode === 'pin' && pin && (
              <Marker position={[pin.latitude, pin.longitude]} icon={PIN_ICON} />
            )}
            {mode === 'live' && myCoords && (
              <Marker position={[myCoords.latitude, myCoords.longitude]} icon={PIN_ICON} />
            )}
          </MapContainer>

          <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex items-start justify-between gap-3 p-3">
            {mode !== 'live' ? (
              <div className="flex items-center gap-2 rounded-full border border-white/50 bg-background/90 px-3 py-1.5 text-[11px] font-medium text-foreground shadow-lg backdrop-blur-xl">
                <MapPin className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                {mode === 'place' ? 'Xaritadan joyni tanlang' : 'Aniq nuqtani belgilang'}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full border border-white/50 bg-background/90 px-3 py-1.5 text-[11px] font-medium text-foreground shadow-lg backdrop-blur-xl">
                <Radio className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                Jonli joylashuv
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={locateMe}
            aria-label="Mening joylashuvim"
            title="Mening joylashuvim"
            className="absolute bottom-3 right-3 z-[500] flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-background/95 text-foreground shadow-xl backdrop-blur-xl transition hover:bg-background active:scale-95"
          >
            {isLocating ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin text-blue-600 dark:text-blue-400" />
            ) : (
              <Crosshair className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>

        {selectionLabel && (
          <div className="mx-3 mt-3 flex shrink-0 items-center gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/[0.055] p-3 shadow-sm sm:mx-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              {mode === 'place' ? (
                <MapPin className="h-[18px] w-[18px]" />
              ) : (
                <LocateFixed className="h-[18px] w-[18px]" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{selectionLabel.title}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {selectionLabel.subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={handleConfirmMapSelection}
              disabled={isResolvingPin || (mode === 'place' && !selectedPlace)}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-foreground px-3.5 text-xs font-semibold text-background shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Tanlash
            </button>
          </div>
        )}

        {locationError && (
          <div className="mx-3 mt-3 rounded-xl border border-destructive/20 bg-destructive/[0.055] px-3 py-2 text-xs text-destructive sm:mx-5">
            {locationError}
          </div>
        )}

        {mode === 'place' ? (
          <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
            <div className="shrink-0 space-y-3 px-3 pt-3 sm:px-5">
              <div className="flex h-12 items-center gap-2.5 rounded-2xl border border-border/60 bg-card px-3.5 shadow-sm">
                <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Joy nomi yoki manzilni qidiring"
                  className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {isSearching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {query && !isSearching && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Qidiruvni tozalash"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {query.trim().length < 2 && (
                <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 scrollbar-hidden sm:-mx-5 sm:px-5">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className={cn(
                      'flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-medium transition',
                      selectedCategory === null
                        ? 'border-blue-500/25 bg-blue-500/[0.08] text-blue-700 dark:text-blue-300'
                        : 'border-border/60 bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    Yaqin
                  </button>

                  {QUICK_CATEGORIES.map((category) => {
                    const CategoryIcon = categoryIcon(category.id);
                    const active = selectedCategory === category.id;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => setSelectedCategory(category.id)}
                        className={cn(
                          'flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-medium transition',
                          active
                            ? 'border-blue-500/25 bg-blue-500/[0.08] text-blue-700 dark:text-blue-300'
                            : 'border-border/60 bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                        )}
                      >
                        <CategoryIcon className="h-3.5 w-3.5" />
                        {category.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {query.trim().length < 2 && (
              <div className="px-3 pt-3 sm:px-5">
                <button
                  type="button"
                  onClick={handleSelectCurrentLocation}
                  disabled={isLocating || isResolvingCurrent}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card px-3.5 py-3 text-left shadow-sm transition hover:border-border hover:bg-muted/35 disabled:cursor-wait disabled:opacity-70"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    {isLocating || isResolvingCurrent ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
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
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {currentPlace?.address ??
                        currentAddress?.full ??
                        (myCoords
                          ? myCoords.latitude.toFixed(5) + ', ' + myCoords.longitude.toFixed(5)
                          : 'Qurilmaning hozirgi joyini aniqlash')}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 transition group-hover:bg-blue-500/15 dark:text-blue-300">
                    Tanlash
                  </span>
                </button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 [-webkit-overflow-scrolling:touch] sm:px-5">
              {(isLoadingNearby || isSearching) && list.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-xs">Joylar yuklanmoqda…</span>
                </div>
              ) : list.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-card/50 px-5 py-8 text-center">
                  <MapPin className="mx-auto h-5 w-5 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {query.trim().length >= 2 ? 'Mos joy topilmadi' : 'Yaqin joy topilmadi'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {query.trim().length >= 2
                      ? 'Boshqa nom bilan qidiring yoki xaritadan belgilang.'
                      : myCoords
                        ? 'Xaritadan kerakli joyni tanlashingiz mumkin.'
                        : 'Yaqin joylar uchun joylashuvga ruxsat bering.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
                  <ul className="divide-y divide-border/50">
                    {list.map((place) => {
                      const PlaceIcon = categoryIcon(place.categoryId);
                      return (
                        <li key={place.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectPlace(place)}
                            className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-muted/45"
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground transition group-hover:bg-blue-500/10 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                              <PlaceIcon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{place.name}</span>
                              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                {[place.categoryLabel, place.address].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                            {place.distanceM != null && (
                              <span className="shrink-0 rounded-full bg-muted/70 px-2 py-1 text-[10px] font-medium tabular-nums text-muted-foreground">
                                {formatDistance(place.distanceM)}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : mode === 'pin' ? (
          <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto px-3 py-4 sm:px-5">
            <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <MapPinned className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Aniq nuqtani belgilang</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Xaritada istalgan nuqtani bosing. Post yaqin joy nomiga emas, aynan siz tanlagan koordinataga bog‘lanadi.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto px-3 py-4 sm:px-5">
            <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Radio className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Jonli joylashuv</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Post yaratilgach, tanlangan muddat davomida qurilma koordinatasi yangilanib boradi.
                  </p>
                  {myCoords && (
                    <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
                      {myCoords.latitude.toFixed(5)}, {myCoords.longitude.toFixed(5)}
                      {accuracy ? ' · ±' + Math.round(accuracy) + ' m' : ''}
                    </p>
                  )}
                </div>
              </div>

              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Ulashish muddati
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {LIVE_DURATIONS.map((duration) => (
                  <button
                    key={duration.minutes}
                    type="button"
                    onClick={() => setLiveMinutes(duration.minutes)}
                    className={cn(
                      'rounded-xl border px-2 py-2.5 text-xs font-semibold transition',
                      liveMinutes === duration.minutes
                        ? 'border-blue-500/25 bg-blue-500/[0.08] text-blue-700 dark:text-blue-300'
                        : 'border-border/60 bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground',
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
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-semibold text-background shadow-sm transition hover:opacity-90 active:scale-[0.995] disabled:opacity-60"
              >
                {isLocating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Radio className="h-4 w-4" />
                )}
                {myCoords ? 'Jonli joylashuvni tanlash' : 'Joylashuvni aniqlash'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(picker, document.body);
}
