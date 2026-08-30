import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
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
  ZoomIn,
  ZoomOut,
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
  hasTransitRoutingProvider,
} from '@/lib/routing';
import {
  useNearbyStops,
  usePlaceCategory,
  usePlaceSearch,
  useStopRoutes,
} from '@/hooks/useMapPlaces';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import { distanceMeters } from '@/lib/geocoding';
import { formatDwell, usePlaceVisits, useVisitTracking } from '@/hooks/useVisitTracking';
import { PlaceCategoryBar } from '@/components/map/PlaceCategoryBar';
import { PlaceResultsList } from '@/components/map/PlaceResultsList';
import { PlaceDetailsCard } from '@/components/map/PlaceDetailsCard';
import { BusStopCard } from '@/components/map/BusStopCard';
import { TaxiOffersCard } from '@/components/map/TaxiOffersCard';
import { MapLayerSwitcher } from '@/components/map/MapLayerSwitcher';
import { SendPlaceToChatDialog } from '@/components/map/SendPlaceToChatDialog';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { MapBottomSheet, type MapSheetSnap } from '@/components/map/MapBottomSheet';

const DEFAULT_CENTER = { latitude: 41.311081, longitude: 69.240562 };

type PanelMode = 'search' | 'place' | 'stop' | 'route' | 'history' | 'saved';

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

interface MapViewport {
  south: number;
  west: number;
  north: number;
  east: number;
}

function MapViewportObserver({
  referenceCenter,
  onViewport,
  onMovedCenter,
}: {
  referenceCenter: { latitude: number; longitude: number };
  onViewport: (viewport: MapViewport) => void;
  onMovedCenter: (center: { latitude: number; longitude: number } | null) => void;
}) {
  const publish = useCallback(
    (map: L.Map, moved: boolean) => {
      const bounds = map.getBounds();
      onViewport({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      });
      if (!moved) return;
      const mapCenter = map.getCenter();
      const candidate = { latitude: mapCenter.lat, longitude: mapCenter.lng };
      onMovedCenter(
        distanceMeters(
          referenceCenter.latitude,
          referenceCenter.longitude,
          candidate.latitude,
          candidate.longitude,
        ) > 250
          ? candidate
          : null,
      );
    },
    [referenceCenter.latitude, referenceCenter.longitude, onViewport, onMovedCenter],
  );

  const map = useMapEvents({
    moveend: () => publish(map, true),
    zoomend: () => publish(map, true),
  });

  useEffect(() => {
    publish(map, false);
  }, [map, publish]);

  return null;
}

export default function MapPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isMobile = useIsMobile();
  const mapRef = useRef<L.Map | null>(null);

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
  const [snap, setSnap] = useState<MapSheetSnap>('peek');

  const [routeMode, setRouteMode] = useState<RouteMode>('car');
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [routeIndex, setRouteIndex] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const [destination, setDestination] = useState<MapPlace | null>(null);

  const [shareTarget, setShareTarget] = useState<MapPlace | null>(null);
  const [sheetHeightPx, setSheetHeightPx] = useState(112);
  const [movedCenter, setMovedCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
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

  const visiblePlaces = useMemo(() => {
    if (!viewport) return places.slice(0, 80);
    const latPad = (viewport.north - viewport.south) * 0.2;
    const lngPad = (viewport.east - viewport.west) * 0.2;
    return places
      .filter(
        (place) =>
          place.latitude >= viewport.south - latPad &&
          place.latitude <= viewport.north + latPad &&
          place.longitude >= viewport.west - lngPad &&
          place.longitude <= viewport.east + lngPad,
      )
      .slice(0, 80);
  }, [places, viewport]);

  const visibleStops = useMemo(() => {
    if (!viewport) return nearbyStops.stops.slice(0, 100);
    const latPad = (viewport.north - viewport.south) * 0.15;
    const lngPad = (viewport.east - viewport.west) * 0.15;
    return nearbyStops.stops
      .filter(
        (stop) =>
          stop.latitude >= viewport.south - latPad &&
          stop.latitude <= viewport.north + latPad &&
          stop.longitude >= viewport.west - lngPad &&
          stop.longitude <= viewport.east + lngPad,
      )
      .slice(0, 100);
  }, [nearbyStops.stops, viewport]);

  const transitRoutingAvailable = hasTransitRoutingProvider();

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
        if (!result.length) {
          toast.error(
            mode === 'transit'
              ? "Jamoat transporti marshruti uchun real provayder hali ulanmagan."
              : 'Marshrut topilmadi.',
          );
        }
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
                disabled={mode.id === 'transit' && !transitRoutingAvailable}
                title={
                  mode.id === 'transit' && !transitRoutingAvailable
                    ? 'Real jamoat transporti routeri ulanmagan'
                    : undefined
                }
                className={cn(
                  'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-medium',
                  routeMode === mode.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                  mode.id === 'transit' && !transitRoutingAvailable && 'cursor-not-allowed opacity-40',
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

    if (panel === 'saved') {
      return (
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <Bookmark className="h-4 w-4 text-primary" />
            <p className="flex-1 text-sm font-semibold">Saqlangan joylar</p>
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
            {saved.loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Yuklanmoqda...
              </div>
            )}

            {!saved.loading && !saved.places.length && (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                Hozircha saqlangan joy yo'q. Joy kartasidagi saqlash tugmasi orqali sevimli manzillaringizni qo'shing.
              </p>
            )}

            <div className="divide-y divide-border/50">
              {saved.places.map((place) => {
                const ui = categoryUi(place.category);
                return (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => {
                      const mapPlace = {
                        id: 'saved:' + place.id,
                        source: 'saved',
                        name: place.name,
                        categoryId: place.category ?? undefined,
                        categoryLabel: ui.label,
                        latitude: place.latitude,
                        longitude: place.longitude,
                        address: place.address,
                      } as unknown as MapPlace;
                      setSelectedPlace(mapPlace);
                      setCenter({ latitude: place.latitude, longitude: place.longitude });
                      setPanel('place');
                      setSnap('half');
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: ui.color + '1f' }}
                    >
                      <ui.Icon className="h-4 w-4" style={{ color: ui.color }} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{place.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {place.address || place.latitude.toFixed(4) + ', ' + place.longitude.toFixed(4)}
                      </span>
                    </span>
                    <Navigation className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
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
    transitRoutingAvailable,
  ]);

  return (
    <div className={cn('relative h-[100dvh] w-full overflow-hidden md:h-screen', layer.dark && 'dark')}>
      <MapContainer
        ref={mapRef}
        center={[center.latitude, center.longitude]}
        zoom={14}
        zoomControl={false}
        preferCanvas
        className="h-full w-full"
      >
        <TileLayer
          url={layer.url}
          attribution={layer.attribution}
          maxZoom={layer.maxZoom}
          updateWhenIdle
          keepBuffer={3}
        />
        {layer.labelsUrl && (
          <TileLayer
            url={layer.labelsUrl}
            attribution={layer.attribution}
            updateWhenIdle
            keepBuffer={2}
          />
        )}

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
        <MapViewportObserver
          referenceCenter={center}
          onViewport={setViewport}
          onMovedCenter={setMovedCenter}
        />

        {me && <Marker position={[me.latitude, me.longitude]} icon={ME_ICON} />}

        {visiblePlaces.map((place) => (
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
          visibleStops.map((stop) => (
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
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:left-[400px] md:pt-3">
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

      {movedCenter && (
        <div className="pointer-events-none absolute inset-x-0 top-[72px] z-[1090] flex justify-center md:left-[400px]">
          <button
            type="button"
            onClick={() => {
              setCenter(movedCenter);
              setMovedCenter(null);
            }}
            className="pointer-events-auto flex h-9 items-center gap-2 rounded-full border border-border/60 bg-background/95 px-3 text-xs font-semibold shadow-lg backdrop-blur"
          >
            <Search className="h-3.5 w-3.5 text-primary" />
            Shu hududda qidirish
          </button>
        </div>
      )}

      {/* O'ng tomondagi tez amallar */}
      <div
        className="absolute right-3 z-[1100] flex flex-col gap-2 transition-[bottom] duration-300 md:bottom-auto md:top-1/2 md:-translate-y-1/2"
        style={isMobile ? { bottom: sheetHeightPx + 16 } : undefined}
      >
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/95 text-foreground shadow-md ring-1 ring-border/60 backdrop-blur"
          aria-label="Yaqinlashtirish"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/95 text-foreground shadow-md ring-1 ring-border/60 backdrop-blur"
          aria-label="Uzoqlashtirish"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (me) {
              setCenter({ ...me });
              setMovedCenter(null);
            } else toast.error('Joylashuv aniqlanmadi.');
          }
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
            setPanel('saved');
            setCategory(null);
            setQuery('');
            setSnap('half');
            void saved.reload();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/95 text-foreground shadow-md ring-1 ring-border/60 backdrop-blur"
          aria-label="Saqlangan joylar"
        >
          <Bookmark className="h-5 w-5" />
        </button>
      </div>

      {/* Pastdagi suzuvchi panel */}
      <MapBottomSheet snap={snap} onSnapChange={setSnap} onHeightChange={setSheetHeightPx}>
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
      </MapBottomSheet>

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
