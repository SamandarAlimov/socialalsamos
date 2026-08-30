import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ArrowDownUp,
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
import { categoryUi, clusterSvg, meDotSvg, pinSvg, stopSvg, vehicleSvg } from '@/lib/placeIcons';
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
  useTransitRealtimeStatus,
  useTransitVehicles,
} from '@/hooks/useMapPlaces';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import { distanceMeters } from '@/lib/geocoding';
import { formatDwell, usePlaceVisits, useVisitTracking } from '@/hooks/useVisitTracking';
import { PlaceCategoryBar } from '@/components/map/PlaceCategoryBar';
import { PlaceResultsList } from '@/components/map/PlaceResultsList';
import { PlaceDetailsCard } from '@/components/map/PlaceDetailsCard';
import { BusStopCard } from '@/components/map/BusStopCard';
import { BusStopResultsList } from '@/components/map/BusStopResultsList';
import { TaxiOffersCard } from '@/components/map/TaxiOffersCard';
import { MapLayerSwitcher } from '@/components/map/MapLayerSwitcher';
import { SendPlaceToChatDialog } from '@/components/map/SendPlaceToChatDialog';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { MapBottomSheet, type MapSheetSnap } from '@/components/map/MapBottomSheet';
import { MapOverviewPanel } from '@/components/map/MapOverviewPanel';
import { MapDataCredit } from '@/components/map/MapDataCredit';

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
  zoom: number;
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
        zoom: map.getZoom(),
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
    moveend: (event) => publish(event.target as L.Map, true),
    zoomend: (event) => publish(event.target as L.Map, true),
  });

  useEffect(() => {
    publish(map, false);
  }, [map, publish]);

  return null;
}

type PlaceMarkerGroup =
  | { type: 'place'; place: MapPlace }
  | {
      type: 'cluster';
      id: string;
      latitude: number;
      longitude: number;
      count: number;
    };

function clusterPlaces(
  places: MapPlace[],
  zoom: number,
  selectedId?: string | null,
): PlaceMarkerGroup[] {
  const unselected = places.filter((place) => place.id !== selectedId);
  if (zoom >= 16 || unselected.length < 8) {
    return unselected.map((place) => ({ type: 'place' as const, place }));
  }

  const cell =
    zoom <= 11 ? 0.06 :
    zoom === 12 ? 0.035 :
    zoom === 13 ? 0.018 :
    zoom === 14 ? 0.009 :
    0.0045;

  const buckets = new Map<string, MapPlace[]>();
  for (const place of unselected) {
    const key =
      Math.floor(place.latitude / cell) + ':' + Math.floor(place.longitude / cell);
    const list = buckets.get(key) ?? [];
    list.push(place);
    buckets.set(key, list);
  }

  const result: PlaceMarkerGroup[] = [];
  for (const [key, list] of buckets) {
    if (list.length === 1) {
      result.push({ type: 'place', place: list[0] });
      continue;
    }
    result.push({
      type: 'cluster',
      id: 'cluster:' + key,
      latitude: list.reduce((sum, item) => sum + item.latitude, 0) / list.length,
      longitude: list.reduce((sum, item) => sum + item.longitude, 0) / list.length,
      count: list.length,
    });
  }
  return result;
}

function clusterIcon(count: number) {
  const size = count > 20 ? 42 : count > 8 ? 38 : 34;
  return L.divIcon({
    html: clusterSvg(count),
    className: 'alsamos-cluster',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function liveVehicleIcon(ref: string, color?: string | null, bearing?: number | null) {
  return L.divIcon({
    html: vehicleSvg(ref, color, bearing),
    className: 'alsamos-live-vehicle',
    iconSize: [42, 38],
    iconAnchor: [21, 32],
  });
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
  const [routeOrigin, setRouteOrigin] = useState<{
    latitude: number;
    longitude: number;
    name: string;
  } | null>(null);

  const [shareTarget, setShareTarget] = useState<MapPlace | null>(null);
  const [sheetHeightPx, setSheetHeightPx] = useState(112);
  const [movedCenter, setMovedCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const layer = getLayer(layerId);
  const isBusStopFilter = category === 'bus_stop';
  const showStops = overlays.includes('stops') || isBusStopFilter;

  const search = usePlaceSearch(query, center);
  const categoryResults = usePlaceCategory(isBusStopFilter ? null : category, center);
  const nearbyStops = useNearbyStops(
    showStops || panel === 'stop' ? center : null,
    isBusStopFilter ? 5000 : 1500,
  );
  const stopRoutes = useStopRoutes(selectedStop);
  const transitStatus = useTransitRealtimeStatus();
  const saved = useSavedPlaces();
  useVisitTracking(true);
  const visits = usePlaceVisits(60);

  const places = query.trim() ? search.places : isBusStopFilter ? [] : categoryResults.places;
  const listLoading = isBusStopFilter
    ? nearbyStops.loading
    : query.trim()
      ? search.loading
      : categoryResults.loading;
  const listError = isBusStopFilter ? null : query.trim() ? search.error : categoryResults.error;

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

  const transitRoutingAvailable = Boolean(transitStatus.routing);

  const markerGroups = useMemo(
    () => clusterPlaces(visiblePlaces, viewport?.zoom ?? 14, selectedPlace?.id),
    [visiblePlaces, viewport?.zoom, selectedPlace?.id],
  );

  const liveTransitEnabled = Boolean(
    viewport &&
      transitStatus.vehicles &&
      (overlays.includes('transit') || showStops || routeMode === 'transit'),
  );
  const liveVehicles = useTransitVehicles(viewport, liveTransitEnabled);

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

  const centerOnMe = useCallback(() => {
    if (me) {
      setCenter({ ...me });
      setMovedCenter(null);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Joylashuv bu qurilmada mavjud emas.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setMe(point);
        setCenter(point);
        setMovedCenter(null);
      },
      () => toast.error('Joylashuvni aniqlab bo‘lmadi. Ruxsatni tekshiring.'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    );
  }, [me]);

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
    async (
      place: MapPlace,
      mode: RouteMode,
      fromOverride?: { latitude: number; longitude: number; name?: string } | null,
    ) => {
      const from = fromOverride ?? routeOrigin ?? me ?? center;
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
    [me, center, routeOrigin],
  );

  const openDirections = useCallback(
    (place: MapPlace) => {
      const origin = me
        ? { ...me, name: 'Joriy joylashuv' }
        : { ...center, name: 'Xarita markazi' };
      setRouteOrigin(origin);
      setDestination(place);
      setSelectedPlace(place);
      setPanel('route');
      setSnap('half');
      void buildRoute(place, routeMode, origin);
    },
    [buildRoute, routeMode, me, center],
  );

  const changeMode = (mode: RouteMode) => {
    setRouteMode(mode);
    if (destination) void buildRoute(destination, mode, routeOrigin);
  };

  const swapRouteEndpoints = useCallback(() => {
    if (!destination) return;
    const origin =
      routeOrigin ??
      (me
        ? { ...me, name: 'Joriy joylashuv' }
        : { ...center, name: 'Xarita markazi' });
    const nextOrigin = {
      latitude: destination.latitude,
      longitude: destination.longitude,
      name: destination.name,
    };
    const nextDestination = {
      id: 'route-origin:' + origin.latitude + ',' + origin.longitude,
      source: 'route',
      name: origin.name,
      categoryId: null,
      categoryLabel: 'Joy',
      latitude: origin.latitude,
      longitude: origin.longitude,
      address: null,
    } as unknown as MapPlace;

    setRouteOrigin(nextOrigin);
    setDestination(nextDestination);
    setSelectedPlace(nextDestination);
    void buildRoute(nextDestination, routeMode, nextOrigin);
  }, [destination, routeOrigin, me, center, buildRoute, routeMode]);

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
          realtimeConfigured={stopRoutes.realtimeConfigured}
          realtimeFresh={stopRoutes.realtimeFresh}
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
          <div className="border-b border-border/45 bg-background/35 px-3 pb-3 pt-2 backdrop-blur-xl">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex min-h-10 items-center gap-2 rounded-2xl border border-border/45 bg-background/55 px-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-primary bg-background" />
                  <span className="w-10 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    From
                  </span>
                  <span className="truncate text-sm font-medium">
                    {routeOrigin?.name || (me ? 'Joriy joylashuv' : 'Xarita markazi')}
                  </span>
                </div>
                <div className="flex min-h-10 items-center gap-2 rounded-2xl border border-border/45 bg-background/55 px-3">
                  <MapPin className="h-4 w-4 shrink-0 text-destructive" />
                  <span className="w-10 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    To
                  </span>
                  <span className="truncate text-sm font-semibold">
                    {destination?.name || 'Manzil tanlanmagan'}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-1.5">
                <button
                  type="button"
                  onClick={swapRouteEndpoints}
                  disabled={!destination}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/45 bg-background/60 text-foreground transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Boshlanish va manzilni almashtirish"
                >
                  <ArrowDownUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPanel(selectedPlace ? 'place' : 'search');
                    setRoutes([]);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/45 bg-background/60 text-muted-foreground transition hover:bg-background hover:text-foreground"
                  aria-label="Yopish"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-4 gap-1 rounded-2xl bg-muted/40 p-1">
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
                    'flex h-9 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition',
                    routeMode === mode.id
                      ? 'bg-background text-primary shadow-sm'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                    mode.id === 'transit' && !transitRoutingAvailable && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <mode.Icon className="h-4 w-4" />
                  <span className="hidden xl:inline">{mode.label}</span>
                </button>
              ))}
            </div>
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
                from={{
                  ...(me ?? center),
                  label: me ? 'Joriy joylashuv' : 'Boshlanish nuqtasi',
                }}
                to={{
                  latitude: destination.latitude,
                  longitude: destination.longitude,
                  label: destination.name,
                }}
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
            setSelectedPlace(null);
            setSelectedStop(null);
            if (id === 'bus_stop') {
              setOverlays((prev) => (prev.includes('stops') ? prev : [...prev, 'stops']));
            }
            setSnap(id ? 'half' : 'peek');
          }}
          loading={isBusStopFilter ? nearbyStops.loading : categoryResults.loading}
          counts={
            category
              ? {
                  [category]: isBusStopFilter
                    ? nearbyStops.stops.length
                    : categoryResults.places.length,
                }
              : undefined
          }
          className="border-b border-border/60 px-2"
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!query.trim() && !category ? (
            <MapOverviewPanel
              savedPlaces={saved.places}
              visits={visits.visits}
              hasLocation={Boolean(me)}
              onCenter={centerOnMe}
              onCategory={(id) => {
                setCategory(id);
                setQuery('');
                setPanel('search');
                setSnap('half');
              }}
              onSaved={() => {
                setPanel('saved');
                setSnap('half');
                void saved.reload();
              }}
              onHistory={() => {
                setPanel('history');
                setSnap('half');
                void visits.reload();
              }}
              onStops={() => {
                setCategory('bus_stop');
                setOverlays((prev) => (prev.includes('stops') ? prev : [...prev, 'stops']));
                setPanel('search');
                setSnap('half');
              }}
              onLayers={() => setLayerOpen(true)}
            />
          ) : isBusStopFilter ? (
            <BusStopResultsList
              stops={nearbyStops.stops}
              loading={nearbyStops.loading}
              activeId={selectedStop?.id}
              onSelect={(stop) => {
                setSelectedStop(stop);
                setSelectedPlace(null);
                setCenter({ latitude: stop.latitude, longitude: stop.longitude });
                setPanel('stop');
                setSnap('half');
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
            />
          ) : (
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
                setSelectedStop(null);
                setCenter({ latitude: place.latitude, longitude: place.longitude });
                setPanel('place');
                setSnap('half');
              }}
              onDirections={openDirections}
              onSendToChat={setShareTarget}
              onSave={toggleSave}
            />
          )}
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
    isBusStopFilter,
    nearbyStops.stops,
    nearbyStops.loading,
    visits.visits,
    visits.loading,
    saved.places,
    query,
    me,
    transitRoutingAvailable,
    centerOnMe,
    routeOrigin,
    destination,
    swapRouteEndpoints,
    stopRoutes.realtimeConfigured,
    stopRoutes.realtimeFresh,
  ]);

  return (
    <div className={cn('relative h-full min-h-0 w-full overflow-hidden', layer.dark && 'dark')}>
      <MapContainer
        ref={mapRef}
        center={[center.latitude, center.longitude]}
        zoom={14}
        zoomControl={false}
        attributionControl={false}
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

        {markerGroups.map((group) =>
          group.type === 'cluster' ? (
            <Marker
              key={group.id}
              position={[group.latitude, group.longitude]}
              icon={clusterIcon(group.count)}
              eventHandlers={{
                click: () => {
                  const map = mapRef.current;
                  if (!map) return;
                  map.setView(
                    [group.latitude, group.longitude],
                    Math.min(18, Math.max(map.getZoom() + 2, 15)),
                    { animate: true },
                  );
                },
              }}
            />
          ) : (
            <Marker
              key={group.place.id}
              position={[group.place.latitude, group.place.longitude]}
              icon={placeIcon(categoryUi(group.place.categoryId).color, false)}
              eventHandlers={{
                click: () => {
                  setSelectedPlace(group.place);
                  setPanel('place');
                  setSnap('half');
                },
              }}
            />
          ),
        )}

        {selectedPlace && (
          <Marker
            position={[selectedPlace.latitude, selectedPlace.longitude]}
            icon={placeIcon(categoryUi(selectedPlace.categoryId).color, true)}
          />
        )}

        {liveVehicles.realtime &&
          liveVehicles.vehicles.map((vehicle) => (
            <Marker
              key={'vehicle:' + vehicle.id}
              position={[vehicle.latitude, vehicle.longitude]}
              icon={liveVehicleIcon(vehicle.ref, vehicle.color, vehicle.bearing)}
              zIndexOffset={350}
            />
          ))}

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
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:left-[404px] md:pt-3">
        <div className="pointer-events-auto mx-auto flex max-w-xl items-center gap-2">
          <div className="flex h-11 flex-1 items-center gap-2 rounded-[18px] bg-background/84 px-3 shadow-xl ring-1 ring-border/45 backdrop-blur-2xl transition focus-within:bg-background/94 focus-within:ring-primary/25">
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
        <div className="pointer-events-none absolute inset-x-0 top-[72px] z-[1090] flex justify-center md:left-[404px]">
          <button
            type="button"
            onClick={() => {
              setCenter(movedCenter);
              setMovedCenter(null);
              setSelectedPlace(null);
              setSelectedStop(null);
              setPanel('search');
              if (category || query.trim()) setSnap('half');
            }}
            className="pointer-events-auto flex h-9 items-center gap-2 rounded-full border border-border/45 bg-background/82 px-3 text-xs font-semibold shadow-lg backdrop-blur-2xl transition hover:bg-background/95"
          >
            <Search className="h-3.5 w-3.5 text-primary" />
            Shu hududda qidirish
          </button>
        </div>
      )}

      {/* O'ng tomondagi tez amallar */}
      <div
        className="absolute right-3 z-[1100] flex flex-col gap-1.5 rounded-[18px] border border-border/35 bg-background/55 p-1.5 shadow-xl backdrop-blur-2xl transition-[bottom] duration-300 md:bottom-auto md:top-1/2 md:-translate-y-1/2"
        style={isMobile ? { bottom: sheetHeightPx + 16 } : undefined}
      >
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/68 text-foreground transition hover:bg-background/95 hover:shadow-sm"
          aria-label="Yaqinlashtirish"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/68 text-foreground transition hover:bg-background/95 hover:shadow-sm"
          aria-label="Uzoqlashtirish"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={centerOnMe}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/68 text-foreground transition hover:bg-background/95 hover:shadow-sm"
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
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/68 text-foreground transition hover:bg-background/95 hover:shadow-sm"
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
            'flex h-10 w-10 items-center justify-center rounded-xl transition',
            showStops
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-background/68 text-foreground hover:bg-background/95 hover:shadow-sm',
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
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/68 text-foreground transition hover:bg-background/95 hover:shadow-sm"
          aria-label="Saqlangan joylar"
        >
          <Bookmark className="h-5 w-5" />
        </button>
      </div>

      <MapDataCredit
        layerId={layerId}
        overlays={overlays}
        className="right-2 md:bottom-2"
        style={isMobile ? { bottom: sheetHeightPx + 4 } : undefined}
      />

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
