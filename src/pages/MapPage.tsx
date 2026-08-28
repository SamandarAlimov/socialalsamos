import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Bike,
  Bookmark,
  Car,
  ChevronDown,
  Clock,
  Crosshair,
  History,
  Loader2,
  MapPin,
  Navigation,
  PersonStanding,
  Search,
  Bus,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { getLayer, getOverlay, type MapLayerId } from '@/lib/mapLayers';
import { categoryUi, meDotSvg, pinSvg, stopSvg } from '@/lib/placeIcons';
import type { MapPlace } from '@/lib/mapPlaces';
import type { TransitStop } from '@/lib/transit';
import {
  arrivalTime,
  fetchRoutes,
  formatKm,
  formatMinutes,
  type RouteMode,
  type RouteResult,
} from '@/lib/routing';
import {
  useNearbyStops,
  usePlaceCategory,
  usePlaceSearch,
  useStopRoutes,
} from '@/hooks/useMapPlaces';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import { formatDwell, usePlaceVisits, useVisitTracking } from '@/hooks/useVisitTracking';
import { PlaceCategoryBar } from '@/components/map/PlaceCategoryBar';
import { PlaceResultsList } from '@/components/map/PlaceResultsList';
import { PlaceDetailsCard } from '@/components/map/PlaceDetailsCard';
import { BusStopCard } from '@/components/map/BusStopCard';
import { TaxiOffersCard } from '@/components/map/TaxiOffersCard';
import { MapLayerSwitcher } from '@/components/map/MapLayerSwitcher';
import { SendPlaceToChatDialog } from '@/components/map/SendPlaceToChatDialog';
import { cn } from '@/lib/utils';

const DEFAULT_CENTER = { latitude: 41.311081, longitude: 69.240562 };

type Snap = 'peek' | 'half' | 'full';
type PanelMode = 'search' | 'place' | 'stop' | 'route' | 'history';

const MODES: { id: RouteMode; label: string; Icon: typeof Car }[] = [
  { id: 'car', label: 'Avtomobil', Icon: Car },
  { id: 'transit', label: 'Transport', Icon: Bus },
  { id: 'foot', label: 'Piyoda', Icon: PersonStanding },
  { id: 'bike', label: 'Velosiped', Icon: Bike },
];

function placeIcon(color: string, active: boolean) {
  return L.divIcon({
    html: pinSvg(color, { size: active ? 40 : 30, active }),
    className: 'alsamos-pin',
    iconSize: [active ? 40 : 30, active ? 56 : 42],
    iconAnchor: [active ? 20 : 15, active ? 56 : 42],
  });
}

const ME_ICON = L.divIcon({
  html: meDotSvg(),
  className: 'alsamos-me',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const STOP_ICON = L.divIcon({
  html: stopSvg(),
  className: 'alsamos-stop',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function MapController({
  center,
  zoom,
  fitTo,
}: {
  center: { latitude: number; longitude: number } | null;
  zoom?: number;
  fitTo?: [number, number][] | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (fitTo && fitTo.length > 1) {
      map.fitBounds(L.latLngBounds(fitTo), { padding: [48, 48] });
    }
  }, [fitTo, map]);

  useEffect(() => {
    if (center && !fitTo) {
      map.setView([center.latitude, center.longitude], zoom ?? map.getZoom(), {
        animate: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.latitude, center?.longitude, zoom]);

  return null;
}

export default function MapPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [me, setMe] = useState<{ latitude: number; longitude: number } | null>(null);
  const [layerId, setLayerId] = useState<MapLayerId>('map');
  const [overlays, setOverlays] = useState<string[]>([]);
  const [layerOpen, setLayerOpen] = useState(false);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null);
  const [selectedStop, setSelectedStop] = useState<TransitStop | null>(null);
  const [panel, setPanel] = useState<PanelMode>('search');
  const [snap, setSnap] = useState<Snap>('peek');

  const [routeMode, setRouteMode] = useState<RouteMode>('car');
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [routeIndex, setRouteIndex] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const [destination, setDestination] = useState<MapPlace | null>(null);

  const [shareTarget, setShareTarget] = useState<MapPlace | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const layer = getLayer(layerId);
  const showStops = overlays.includes('stops');

  const search = usePlaceSearch(query, center);
  const categoryResults = usePlaceCategory(category, center);
  const nearbyStops = useNearbyStops(showStops || panel === 'stop' ? center : null);
  const stopRoutes = useStopRoutes(selectedStop?.id ?? null);
  const saved = useSavedPlaces();
  useVisitTracking(true);
  const visits = usePlaceVisits(60);

  const places = query.trim() ? search.places : categoryResults.places;
  const listLoading = query.trim() ? search.loading : categoryResults.loading;
  const listError = query.trim() ? search.error : categoryResults.error;

  // Joylashuvni aniqlash
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setMe(point);
        setCenter(point);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }, []);

  // Boshqa sahifadan kelgan manzil: /map?destLat=..&destLng=..&destName=..
  useEffect(() => {
    const lat = Number(params.get('destLat'));
    const lng = Number(params.get('destLng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (!lat && !lng)) return;
    const place: MapPlace = {
      id: 'param:' + lat + ',' + lng,
      source: 'param',
      name: params.get('destName') || 'Belgilangan joy',
      categoryId: null,
      categoryLabel: 'Joy',
      latitude: lat,
      longitude: lng,
      address: null,
      phone: null,
      website: null,
      openingHours: null,
      brand: null,
      cuisine: null,
      wheelchair: null,
      distanceM: null,
      tags: {},
      score: 1,
    } as unknown as MapPlace;
    setSelectedPlace(place);
    setCenter({ latitude: lat, longitude: lng });
    setPanel('place');
    setSnap('half');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildRoute = useCallback(
    async (place: MapPlace, mode: RouteMode) => {
      const from = me ?? center;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setRouteLoading(true);
      try {
        const result = await fetchRoutes(mode, from, place, controller.signal);
        setRoutes(result);
        setRouteIndex(0);
        if (!result.length) toast.error('Marshrut topilmadi.');
      } catch {
        toast.error("Marshrut hisoblanmadi. Internetni tekshirib ko'ring.");
      } finally {
        setRouteLoading(false);
      }
    },
    [me, center],
  );

  const openDirections = useCallback(
    (place: MapPlace) => {
      setDestination(place);
      setSelectedPlace(place);
      setPanel('route');
      setSnap('half');
      void buildRoute(place, routeMode);
    },
    [buildRoute, routeMode],
  );

  const changeMode = (mode: RouteMode) => {
    setRouteMode(mode);
    if (destination) void buildRoute(destination, mode);
  };

  const sharePlace = async (place: MapPlace) => {
    const url =
      window.location.origin +
      '/map?destLat=' +
      place.latitude +
      '&destLng=' +
      place.longitude +
      '&destName=' +
      encodeURIComponent(place.name);
    try {
      if (navigator.share) {
        await navigator.share({ title: place.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Havola nusxalandi');
      }
    } catch {
      // foydalanuvchi bekor qildi
    }
  };

  const toggleSave = async (place: MapPlace) => {
    const added = await saved.toggleSave({
      name: place.name,
      address: place.address,
      category: place.categoryId,
      latitude: place.latitude,
      longitude: place.longitude,
      externalId: place.id,
      externalSource: place.source,
    });
    toast.success(added ? 'Saqlangan joylarga qo\u2019shildi' : 'Saqlangan joylardan olindi');
  };

  const activeRoute = routes[routeIndex] ?? null;
  const fitTo = activeRoute?.coordinates?.length ? activeRoute.coordinates : null;

  const sheetHeight = snap === 'peek' ? 'h-[108px]' : snap === 'half' ? 'h-[54vh]' : 'h-[88vh]';

  const panelBody = useMemo(() => {
    if (panel === 'place' && selectedPlace) {
      return (
        <PlaceDetailsCard
          place={selectedPlace}
          saved={saved.isSaved(selectedPlace.latitude, selectedPlace.longitude)}
          onClose={() => {
            setSelectedPlace(null);
            setPanel('search');
            setSnap('peek');
          }}
          onDirections={openDirections}
          onSendToChat={setShareTarget}
          onToggleSave={toggleSave}
          onShare={sharePlace}
          onCreatePost={(place) =>
            navigate(
              '/create?placeName=' +
                encodeURIComponent(place.name) +
                '&lat=' +
                place.latitude +
                '&lng=' +
                place.longitude,
            )
          }
          className="h-full"
        />
      );
    }

    if (panel === 'stop' && selectedStop) {
      return (
        <BusStopCard
          stop={selectedStop}
          routes={stopRoutes.routes}
          loading={stopRoutes.loading}
          error={stopRoutes.error}
          onReload={stopRoutes.reload}
          onClose={() => {
            setSelectedStop(null);
            setPanel('search');
            setSnap('peek');
          }}
          onDirections={(stop) =>
            openDirections({
              id: stop.id,
              source: 'transit',
              name: stop.name || 'Bekat',
              latitude: stop.latitude,
              longitude: stop.longitude,
            } as unknown as MapPlace)
          }
          className="h-full"
        />
      );
    }

    if (panel === 'route') {
      return (
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => changeMode(mode.id)}
                className={cn(
                  'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-medium',
                  routeMode === mode.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <mode.Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{mode.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setPanel(selectedPlace ? 'place' : 'search');
                setRoutes([]);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
              aria-label="Yopish"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {routeLoading && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Marshrut hisoblanmoqda...
              </div>
            )}

            <div className="space-y-2">
              {routes.map((route, index) => (
                <button
                  key={route.label + index}
                  type="button"
                  onClick={() => setRouteIndex(index)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left',
                    index === routeIndex ? 'border-primary bg-primary/5' : 'border-border/60',
                  )}
                >
                  <Navigation className="h-4 w-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {formatMinutes(route.durationS)} \u00b7 {formatKm(route.distanceM)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {route.label} \u00b7 {arrivalTime(route.durationS)} da yetib borasiz
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {activeRoute && destination && routeMode === 'car' && (
              <TaxiOffersCard
                className="mt-3"
                from={me ?? center}
                to={{ latitude: destination.latitude, longitude: destination.longitude }}
                distanceKm={activeRoute.distanceM / 1000}
                durationMin={activeRoute.durationS / 60}
              />
            )}

            {activeRoute && (
              <div className="mt-3 divide-y divide-border/50">
                {activeRoute.steps.map((step, index) => (
                  <div key={index} className="flex items-start gap-3 py-2 text-sm">
                    <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p>{step.instruction}</p>
                      <p className="text-xs text-muted-foreground">{formatKm(step.distanceM)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (panel === 'history') {
      return (
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <History className="h-4 w-4 text-primary" />
            <p className="flex-1 text-sm font-semibold">Tashriflar tarixi</p>
            <button
              type="button"
              onClick={() => setPanel('search')}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
              aria-label="Yopish"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {visits.loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Yuklanmoqda...
              </div>
            )}

            {!visits.loading && !visits.visits.length && (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                Hozircha yozuv yo'q. Joylashuvga ruxsat bersangiz, borgan joylaringiz soati va
                qancha turganingiz bilan avtomatik saqlanadi.
              </p>
            )}

            <div className="divide-y divide-border/50">
              {visits.visits.map((visit) => {
                const ui = categoryUi(visit.category);
                return (
                  <div key={visit.id} className="flex items-start gap-3 px-4 py-3">
                    <span
                      className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl"
                      style={{ backgroundColor: ui.color + '1f' }}
                    >
                      <ui.Icon className="h-4 w-4" style={{ color: ui.color }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {visit.name || 'Nomsiz joy'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {visit.address || visit.latitude.toFixed(4) + ', ' + visit.longitude.toFixed(4)}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(visit.arrived_at).toLocaleString('uz-UZ', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' \u00b7 '}
                        {formatDwell(visit.dwell_seconds)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void visits.removeVisit(visit.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                      aria-label="O'chirish"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col">
        <PlaceCategoryBar
          active={category}
          onSelect={(id) => {
            setCategory(id);
            setQuery('');
            setSnap(id ? 'half' : 'peek');
          }}
          loading={categoryResults.loading}
          counts={category ? { [category]: categoryResults.places.length } : undefined}
          className="border-b border-border/60 px-2"
        />
        <div className="flex-1 overflow-y-auto">
          <PlaceResultsList
            places={places}
            loading={listLoading}
            error={listError}
            activeId={selectedPlace?.id}
            emptyText={
              query.trim()
                ? "Hech narsa topilmadi. Nomni boshqacha yozib ko'ring."
                : 'Kategoriya tanlang yoki qidiruvdan foydalaning.'
            }
            onSelect={(place) => {
              setSelectedPlace(place);
              setCenter({ latitude: place.latitude, longitude: place.longitude });
              setPanel('place');
              setSnap('half');
            }}
            onDirections={openDirections}
            onSendToChat={setShareTarget}
            onSave={toggleSave}
          />
        </div>
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    panel,
    selectedPlace,
    selectedStop,
    stopRoutes.routes,
    stopRoutes.loading,
    stopRoutes.error,
    routes,
    routeIndex,
    routeLoading,
    routeMode,
    places,
    listLoading,
    listError,
    category,
    categoryResults.loading,
    categoryResults.places.length,
    visits.visits,
    visits.loading,
    saved.places,
    query,
    me,
  ]);

  return (
    <div className={cn('relative h-[calc(100vh-4rem)] w-full overflow-hidden', layer.dark && 'dark')}>
      <MapContainer
        center={[center.latitude, center.longitude]}
        zoom={14}
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer url={layer.url} attribution={layer.attribution} maxZoom={layer.maxZoom} />
        {layer.labelsUrl && <TileLayer url={layer.labelsUrl} attribution={layer.attribution} />}

        {overlays
          .filter((id) => id !== 'stops')
          .map((id) => {
            const overlay = getOverlay(id);
            if (!overlay?.url) return null;
            return (
              <TileLayer
                key={overlay.id}
                url={overlay.url}
                attribution={overlay.attribution}
                opacity={overlay.opacity ?? 0.85}
              />
            );
          })}

        <MapController center={center} zoom={selectedPlace ? 16 : undefined} fitTo={fitTo} />

        {me && <Marker position={[me.latitude, me.longitude]} icon={ME_ICON} />}

        {places.map((place) => (
          <Marker
            key={place.id}
            position={[place.latitude, place.longitude]}
            icon={placeIcon(categoryUi(place.categoryId).color, selectedPlace?.id === place.id)}
            eventHandlers={{
              click: () => {
                setSelectedPlace(place);
                setPanel('place');
                setSnap('half');
              },
            }}
          />
        ))}

        {selectedPlace && !places.some((place) => place.id === selectedPlace.id) && (
          <Marker
            position={[selectedPlace.latitude, selectedPlace.longitude]}
            icon={placeIcon(categoryUi(selectedPlace.categoryId).color, true)}
          />
        )}

        {showStops &&
          nearbyStops.stops.map((stop) => (
            <Marker
              key={stop.id}
              position={[stop.latitude, stop.longitude]}
              icon={STOP_ICON}
              eventHandlers={{
                click: () => {
                  setSelectedStop(stop);
                  setPanel('stop');
                  setSnap('half');
                },
              }}
            />
          ))}

        {activeRoute && activeRoute.coordinates.length > 1 && (
          <>
            <Polyline positions={activeRoute.coordinates} color="#ffffff" weight={9} opacity={0.9} />
            <Polyline positions={activeRoute.coordinates} color="#2F6FED" weight={5} />
          </>
        )}
      </MapContainer>

      {/* Yuqoridagi qidiruv qatori */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] p-3">
        <div className="pointer-events-auto mx-auto flex max-w-xl items-center gap-2">
          <div className="flex h-11 flex-1 items-center gap-2 rounded-2xl bg-background/95 px-3 shadow-lg ring-1 ring-border/60 backdrop-blur">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCategory(null);
                setPanel('search');
                if (event.target.value.trim()) setSnap('half');
              }}
              placeholder="Joy, manzil yoki tashkilot nomi"
              className="h-full flex-1 bg-transparent text-sm outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Tozalash"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {search.loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          <MapLayerSwitcher
            open={layerOpen}
            onOpenChange={setLayerOpen}
            layerId={layerId}
            onLayerChange={(id) => {
              setLayerId(id);
              setLayerOpen(false);
            }}
            overlays={overlays}
            onToggleOverlay={(id) =>
              setOverlays((prev) =>
                prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
              )
            }
          />
        </div>
      </div>

      {/* O'ng tomondagi tez amallar */}
      <div className="absolute right-3 top-1/2 z-[1100] flex -translate-y-1/2 flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            if (me) setCenter({ ...me });
            else toast.error('Joylashuv aniqlanmadi.');
          }}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/95 text-foreground shadow-md ring-1 ring-border/60 backdrop-blur"
          aria-label="Mening joylashuvim"
        >
          <Crosshair className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setPanel('history');
            setSnap('half');
            void visits.reload();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/95 text-foreground shadow-md ring-1 ring-border/60 backdrop-blur"
          aria-label="Tashriflar tarixi"
        >
          <History className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() =>
            setOverlays((prev) =>
              prev.includes('stops') ? prev.filter((id) => id !== 'stops') : [...prev, 'stops'],
            )
          }
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl shadow-md ring-1 ring-border/60 backdrop-blur',
            showStops ? 'bg-primary text-primary-foreground' : 'bg-background/95 text-foreground',
          )}
          aria-label="Bekatlar"
        >
          <Bus className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setPanel('search');
            setCategory(null);
            setSnap('full');
          }}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/95 text-foreground shadow-md ring-1 ring-border/60 backdrop-blur"
          aria-label="Saqlangan joylar"
        >
          <Bookmark className="h-5 w-5" />
        </button>
      </div>

      {/* Pastdagi suzuvchi panel */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-[1150] flex flex-col overflow-hidden rounded-t-3xl border-t border-border/60 bg-background shadow-2xl transition-[height] duration-300 md:inset-y-0 md:left-0 md:right-auto md:h-full md:w-[400px] md:rounded-none md:border-r md:border-t-0',
          sheetHeight,
          'md:h-full',
        )}
      >
        <button
          type="button"
          onClick={() => setSnap(snap === 'full' ? 'half' : snap === 'half' ? 'peek' : 'full')}
          className="flex h-6 w-full items-center justify-center md:hidden"
          aria-label="Panelni o'zgartirish"
        >
          <span className="h-1.5 w-10 rounded-full bg-muted-foreground/40" />
        </button>

        {snap === 'peek' && panel === 'search' ? (
          <button
            type="button"
            onClick={() => setSnap('half')}
            className="flex flex-1 items-center gap-3 px-4 pb-3 text-left md:hidden"
          >
            <MapPin className="h-5 w-5 text-primary" />
            <span className="flex-1 text-sm font-medium">Yaqin atrofdagi joylar</span>
            <ChevronDown className="h-4 w-4 rotate-180 text-muted-foreground" />
          </button>
        ) : null}

        <div
          className={cn(
            'min-h-0 flex-1',
            snap === 'peek' && panel === 'search' ? 'hidden md:block' : 'block',
          )}
        >
          {panelBody}
        </div>
      </div>

      <SendPlaceToChatDialog
        open={Boolean(shareTarget)}
        onOpenChange={(open) => !open && setShareTarget(null)}
        place={
          shareTarget
            ? {
                name: shareTarget.name,
                address: shareTarget.address,
                latitude: shareTarget.latitude,
                longitude: shareTarget.longitude,
              }
            : null
        }
      />
    </div>
  );
}
