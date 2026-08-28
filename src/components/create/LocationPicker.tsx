import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Check,
  Crosshair,
  Loader2,
  MapPin,
  Navigation,
  Radio,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistance, reverseGeocode, type GeoPlace } from '@/lib/geocoding';
import { usePlaceSearch } from '@/hooks/usePlaceSearch';
import type { PostLocationInput } from '@/lib/postMeta';

interface LocationPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (location: PostLocationInput) => void;
  /** Boshlang'ich markaz (foydalanuvchi joylashuvi bo'lsa). */
  initialCenter?: { latitude: number; longitude: number } | null;
}

/** Leaflet ning standart marker rasmi Vite build da yo'qoladi — divIcon ishlatamiz. */
const PIN_ICON = L.divIcon({
  className: 'alsamos-map-pin',
  html: `<span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;transform:translate(-50%,-100%)">
    <svg viewBox="0 0 24 24" width="34" height="34" fill="#ef4444" stroke="#ffffff" stroke-width="1.5">
      <path d="M12 2c-3.9 0-7 3.1-7 7 0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z"/>
      <circle cx="12" cy="9" r="2.4" fill="#ffffff" stroke="none"/>
    </svg>
  </span>`,
  iconSize: [34, 34],
  iconAnchor: [0, 0],
});

const LIVE_DURATIONS = [
  { label: '15 daqiqa', minutes: 15 },
  { label: '1 soat', minutes: 60 },
  { label: '8 soat', minutes: 480 },
];

const DEFAULT_CENTER = { latitude: 41.2995, longitude: 69.2401 }; // Toshkent

function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (event) => onPick(event.latlng.lat, event.latlng.lng),
  });
  return null;
}

function MapCenterSync({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom() < 14 ? 15 : map.getZoom(), {
      animate: true,
    });
  }, [latitude, longitude, map]);
  return null;
}

/**
 * Joylashuv tanlash — ikki rejim:
 *  1) "Joy"        — xaritadan pin tanlash, qidiruv, atrofdagi joylar ro'yxati
 *  2) "Real vaqtli" — live location, belgilangan muddat davomida yangilanadi
 *
 * Telegramdagi joylashuv oynasi asos qilib olingan, lekin bizda joy sahifasi,
 * masofa, kategoriya va xaritada erkin pin surish ham bor.
 */
export function LocationPicker({
  open,
  onClose,
  onSelect,
  initialCenter,
}: LocationPickerProps) {
  const [mode, setMode] = useState<'place' | 'live'>('place');
  const [myCoords, setMyCoords] = useState<{ latitude: number; longitude: number } | null>(
    initialCenter ?? null,
  );
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pinPlace, setPinPlace] = useState<GeoPlace | null>(null);
  const [isResolvingPin, setIsResolvingPin] = useState(false);
  const [liveMinutes, setLiveMinutes] = useState(60);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const center = myCoords ?? initialCenter ?? DEFAULT_CENTER;
  const { query, setQuery, results, nearby, isSearching, isLoadingNearby, error } =
    usePlaceSearch(open ? (myCoords ?? initialCenter ?? null) : null);

  /** Qurilma joylashuvini aniqlash. */
  const locateMe = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocationError('Qurilma joylashuvni qo\u2018llab-quvvatlamaydi');
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
      (positionError) => {
        setIsLocating(false);
        setLocationError(
          positionError.code === positionError.PERMISSION_DENIED
            ? 'Joylashuvga ruxsat berilmadi. Brauzer sozlamalaridan yoqing.'
            : 'Joylashuvni aniqlab bo\u2018lmadi',
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, []);

  useEffect(() => {
    if (open && !myCoords) locateMe();
  }, [open, myCoords, locateMe]);

  /** Xaritadan nuqta tanlanganda manzilni aniqlaymiz. */
  const handlePin = useCallback(async (latitude: number, longitude: number) => {
    setPin({ latitude, longitude });
    setPinPlace(null);
    setIsResolvingPin(true);

    try {
      const place = await reverseGeocode(latitude, longitude);
      setPinPlace(place);
    } catch {
      setPinPlace(null);
    } finally {
      setIsResolvingPin(false);
    }
  }, []);

  const handleSelectPlace = useCallback(
    (place: GeoPlace) => {
      onSelect({
        mode: 'place',
        latitude: place.latitude,
        longitude: place.longitude,
        label: place.name,
        place: {
          name: place.name,
          address: place.address ?? null,
          category: place.category ?? null,
          externalSource: place.externalSource,
          externalId: place.externalId,
        },
      });
      onClose();
    },
    [onSelect, onClose],
  );

  const handleConfirmPin = useCallback(() => {
    if (!pin) return;

    onSelect({
      mode: 'place',
      latitude: pin.latitude,
      longitude: pin.longitude,
      label: pinPlace?.name ?? 'Xaritadagi nuqta',
      accuracyM: accuracy,
      place: pinPlace
        ? {
            name: pinPlace.name,
            address: pinPlace.address ?? null,
            category: pinPlace.category ?? null,
            externalSource: pinPlace.externalSource,
            externalId: pinPlace.externalId,
          }
        : null,
    });
    onClose();
  }, [pin, pinPlace, accuracy, onSelect, onClose]);

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
  }, [myCoords, accuracy, liveMinutes, onSelect, onClose, locateMe]);

  const list = useMemo(() => (query.trim().length >= 2 ? results : nearby), [query, results, nearby]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {/* Sarlavha */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
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

      {/* Rejim tanlash */}
      <div className="flex gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setMode('place')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition',
            mode === 'place'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border/60 text-muted-foreground hover:bg-muted',
          )}
        >
          <MapPin className="h-4 w-4" /> Joy
        </button>
        <button
          type="button"
          onClick={() => setMode('live')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition',
            mode === 'live'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border/60 text-muted-foreground hover:bg-muted',
          )}
        >
          <Radio className="h-4 w-4" /> Real vaqtli
        </button>
      </div>

      {/* Xarita */}
      <div className="relative h-56 shrink-0 overflow-hidden border-y border-border/60">
        <MapContainer
          center={[center.latitude, center.longitude]}
          zoom={15}
          scrollWheelZoom
          className="h-full w-full"
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <MapCenterSync latitude={center.latitude} longitude={center.longitude} />
          {mode === 'place' && <MapClickHandler onPick={handlePin} />}
          {pin && mode === 'place' && (
            <Marker position={[pin.latitude, pin.longitude]} icon={PIN_ICON} />
          )}
          {myCoords && mode === 'live' && (
            <Marker position={[myCoords.latitude, myCoords.longitude]} icon={PIN_ICON} />
          )}
        </MapContainer>

        <button
          type="button"
          onClick={locateMe}
          aria-label="Meni topish"
          className="absolute bottom-3 right-3 z-[500] flex h-10 w-10 items-center justify-center rounded-full bg-background/95 shadow-lg transition hover:bg-background"
        >
          {isLocating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Crosshair className="h-4 w-4" />
          )}
        </button>

        {mode === 'place' && (
          <p className="absolute left-3 top-3 z-[500] rounded-full bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground shadow">
            Xaritaga bosib nuqta tanlang
          </p>
        )}
      </div>

      {locationError && (
        <p className="px-4 pt-3 text-xs text-destructive">{locationError}</p>
      )}

      {/* Tanlangan pin */}
      {mode === 'place' && pin && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <MapPin className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {isResolvingPin
                ? 'Manzil aniqlanmoqda...'
                : (pinPlace?.name ?? 'Xaritadagi nuqta')}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {pinPlace?.address ??
                `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleConfirmPin}
            className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            <Check className="h-4 w-4" /> Tanlash
          </button>
        </div>
      )}

      {/* Rejimga qarab pastki qism */}
      {mode === 'place' ? (
        <>
          <div className="px-4 pt-3">
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
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Tozalash"
                  className="text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Ro'yxat — scroll ishlaydi */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 [-webkit-overflow-scrolling:touch]">
            {error && <p className="pb-2 text-xs text-destructive">{error}</p>}

            {query.trim().length < 2 && (
              <p className="pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Atrofdagi joylar
              </p>
            )}

            {isLoadingNearby && list.length === 0 && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}

            {!isLoadingNearby && list.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {query.trim().length >= 2
                  ? 'Hech narsa topilmadi'
                  : 'Atrofdagi joylar topilmadi. Xaritadan tanlang.'}
              </p>
            )}

            <ul className="space-y-1">
              {list.map((place) => (
                <li key={`${place.externalSource}-${place.externalId}`}>
                  <button
                    type="button"
                    onClick={() => handleSelectPlace(place)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-muted"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{place.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[place.category, place.address].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {place.distanceM !== undefined && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDistance(place.distanceM)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="rounded-2xl border border-border/60 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Navigation className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Real vaqtli joylashuv</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Belgilangan muddat davomida joylashuvingiz avtomatik yangilanadi.
                  Istalgan payt to\u2018xtatishingiz mumkin.
                </p>
                {myCoords && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {myCoords.latitude.toFixed(5)}, {myCoords.longitude.toFixed(5)}
                    {accuracy ? ` · ±${Math.round(accuracy)} m` : ''}
                  </p>
                )}
              </div>
            </div>

            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Muddat
            </p>
            <div className="mt-2 flex gap-2">
              {LIVE_DURATIONS.map((duration) => (
                <button
                  key={duration.minutes}
                  type="button"
                  onClick={() => setLiveMinutes(duration.minutes)}
                  className={cn(
                    'flex-1 rounded-xl border px-2 py-2 text-xs font-medium transition',
                    liveMinutes === duration.minutes
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border/60 text-muted-foreground hover:bg-muted',
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
              {myCoords ? 'Ulashishni boshlash' : 'Joylashuvni aniqlash'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
