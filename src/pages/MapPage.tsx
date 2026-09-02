import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Bike,
  Bookmark,
  Car,
  ChevronDown,
  Clock,
  Crosshair,
  GripVertical,
  History,
  Loader2,
  MapPin,
  MapPinned,
  Navigation,
  Plus,
  PersonStanding,
  Search,
  Sparkles,
  Bus,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from 'sonner';

import { getLayer, getOverlay, type MapLayerId } from '@/lib/mapLayers';
import {
  categoryUi,
  clusterSvg,
  meDotSvg,
  navigationArrowSvg,
  pinSvg,
  stopSvg,
  vehicleSvg,
} from '@/lib/placeIcons';
import {
  canonicalPlaceId,
  resolveMapClickPlace,
  type MapPlace,
} from '@/lib/mapPlaces';
import type { TransitRoute, TransitStop } from '@/lib/transit';
import {
  arrivalTime,
  fetchRoutesThrough,
  optimizeRouteWaypoints,
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
import { useTrafficProvider } from '@/hooks/useTrafficProvider';
import { useTrafficIncidents } from '@/hooks/useTrafficIncidents';
import { distanceMeters } from '@/lib/geocoding';
import { formatDwell, usePlaceVisits, useVisitTracking } from '@/hooks/useVisitTracking';
import { PlaceCategoryBar } from '@/components/map/PlaceCategoryBar';
import { PlaceResultsList } from '@/components/map/PlaceResultsList';
import { PlaceDetailsCard } from '@/components/map/PlaceDetailsCard';
import { BusStopCard } from '@/components/map/BusStopCard';
import { TrafficIncidentCard } from '@/components/map/TrafficIncidentCard';
import { BusStopResultsList } from '@/components/map/BusStopResultsList';
import { TaxiOffersCard } from '@/components/map/TaxiOffersCard';
import { MapLayerSwitcher } from '@/components/map/MapLayerSwitcher';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { MapBottomSheet, type MapSheetSnap } from '@/components/map/MapBottomSheet';
import { MapOverviewPanel } from '@/components/map/MapOverviewPanel';
import { MapSearchSuggestions } from '@/components/map/MapSearchSuggestions';
import { useMapSearchHistory } from '@/hooks/useMapSearchHistory';
import {
  useActiveNavigation,
  type NavigationPosition,
} from '@/hooks/useActiveNavigation';
import { useNavigationVoice } from '@/hooks/useNavigationVoice';
import { ActiveNavigationPanel } from '@/components/map/ActiveNavigationPanel';
import { LeafletMapSurface } from '@/components/map/engine/LeafletMapSurface';
import { VectorMapSurface } from '@/components/map/engine/VectorMapSurface';
import {
  readPreferredMapEngine,
  vectorStyleUrl,
  writePreferredMapEngine,
  type MapEngineController,
  type MapEngineId,
  type MapSceneLine,
  type MapSceneMarker,
  type VectorRenderedFeature,
} from '@/lib/mapEngine';
import {
  clearNavigationSession,
  readNavigationSession,
  writeNavigationSession,
} from '@/lib/navigationSession';
import {
  trafficIncidentColor,
  trafficIncidentLabel,
  type TrafficIncident,
} from '@/lib/traffic';

const DEFAULT_CENTER = { latitude: 41.311081, longitude: 69.240562 };

type PanelMode =
  | 'search'
  | 'place'
  | 'stop'
  | 'incident'
  | 'route'
  | 'history'
  | 'saved';
type RouteEditTarget =
  | 'origin'
  | 'destination'
  | 'append'
  | `waypoint:${number}`;

const MODES: { id: RouteMode; label: string; Icon: typeof Car }[] = [
  { id: 'car', label: 'Avtomobil', Icon: Car },
  { id: 'transit', label: 'Transport', Icon: Bus },
  { id: 'foot', label: 'Piyoda', Icon: PersonStanding },
  { id: 'bike', label: 'Velosiped', Icon: Bike },
];

function formatTransitFare(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    return text || null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Intl.NumberFormat('uz-UZ').format(value);
  }
  if (typeof value === 'object') {
    const fare = value as {
      amount?: unknown;
      currency?: unknown;
    };
    const amount = Number(fare.amount);
    if (!Number.isFinite(amount)) return null;
    const currency = String(fare.currency ?? '').toUpperCase();
    const formatted = new Intl.NumberFormat('uz-UZ').format(amount);
    if (currency === 'UZS') return formatted + ' so‘m';
    return currency ? formatted + ' ' + currency : formatted;
  }
  return null;
}

function formatTransitClock(value?: string | null): string | null {
  if (!value) return null;
  const hhmm = String(value).match(/(?:T|^)(\d{2}):(\d{2})/);
  if (hhmm) return hhmm[1] + ':' + hhmm[2];
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString('uz-UZ', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return null;
}

function transitModeLabel(mode?: string): string {
  switch (mode) {
    case 'walk':
      return 'Piyoda';
    case 'bus':
      return 'Avtobus';
    case 'trolleybus':
      return 'Trolleybus';
    case 'minibus':
      return 'Marshrutka';
    case 'tram':
      return 'Tramvay';
    case 'subway':
      return 'Metro';
    case 'train':
      return 'Poyezd';
    default:
      return 'Transport';
  }
}

function placeIcon(color: string, active: boolean) {
  return L.divIcon({
    html: pinSvg(color, { size: active ? 40 : 30, active }),
    className: 'alsamos-pin',
    iconSize: [active ? 40 : 30, active ? 56 : 42],
    iconAnchor: [active ? 20 : 15, active ? 56 : 42],
  });
}

function routeLocationIcon(color = '#2F6FED', active = false) {
  const size = active ? 38 : 34;
  const height = Math.round(size * 1.4);
  return L.divIcon({
    html: pinSvg(color, { size, active }),
    className: 'alsamos-route-location',
    iconSize: [size, height],
    iconAnchor: [size / 2, height],
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

function MapClickObserver({
  onMapClick,
}: {
  onMapClick: (
    point: { latitude: number; longitude: number },
    zoom: number,
  ) => void | Promise<void>;
}) {
  useMapEvents({
    click: (event) => {
      void onMapClick(
        {
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        },
        (event.target as L.Map).getZoom(),
      );
    },
  });

  return null;
}

function NavigationInteractionObserver({
  onManualPan,
}: {
  onManualPan: () => void;
}) {
  useMapEvents({
    dragstart: () => onManualPan(),
  });
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

function navigationCameraTarget(
  position: NavigationPosition,
): { latitude: number; longitude: number } {
  if (position.heading == null || !Number.isFinite(position.heading)) {
    return {
      latitude: position.latitude,
      longitude: position.longitude,
    };
  }

  const speedMps = Math.max(0, position.speedMps ?? 0);
  const lookAheadM = Math.max(28, Math.min(135, 35 + speedMps * 4.5));
  const radiusM = 6_371_000;
  const bearing = (position.heading * Math.PI) / 180;
  const lat1 = (position.latitude * Math.PI) / 180;
  const lng1 = (position.longitude * Math.PI) / 180;
  const angular = lookAheadM / radiusM;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: (lng2 * 180) / Math.PI,
  };
}

function navigationArrowIcon(heading?: number | null) {
  return L.divIcon({
    html: navigationArrowSvg(heading),
    className: 'alsamos-navigation-arrow',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

export default function MapPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isMobile = useIsMobile();
  const mapRef = useRef<MapEngineController | null>(null);
  const [mapEngine, setMapEngine] = useState<MapEngineId>(() =>
    readPreferredMapEngine(params),
  );
  const hasDestinationParam = params.has('destLat') && params.has('destLng');
  const restoredNavigation = useRef(
    hasDestinationParam ? null : readNavigationSession(),
  ).current;

  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [me, setMe] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [layerId, setLayerId] = useState<MapLayerId>('map');
  const [overlays, setOverlays] = useState<string[]>([]);
  const [layerOpen, setLayerOpen] = useState(false);

  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null);
  const [selectedStop, setSelectedStop] = useState<TransitStop | null>(null);
  const [selectedTransitRoute, setSelectedTransitRoute] =
    useState<TransitRoute | null>(null);
  const [selectedIncident, setSelectedIncident] =
    useState<TrafficIncident | null>(null);
  const [panel, setPanel] = useState<PanelMode>('search');
  const [snap, setSnap] = useState<MapSheetSnap>('peek');

  const [routeMode, setRouteMode] = useState<RouteMode>(
    restoredNavigation?.mode ?? 'car',
  );
  const [routes, setRoutes] = useState<RouteResult[]>(
    restoredNavigation?.routes ?? [],
  );
  const [routeIndex, setRouteIndex] = useState(
    restoredNavigation?.routeIndex ?? 0,
  );
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeOptimizing, setRouteOptimizing] = useState(false);
  const [destination, setDestination] = useState<MapPlace | null>(
    restoredNavigation?.destination ?? null,
  );
  const [routeWaypoints, setRouteWaypoints] = useState<MapPlace[]>(
    restoredNavigation?.routeWaypoints ?? [],
  );
  const [routeOrigin, setRouteOrigin] = useState<{
    latitude: number;
    longitude: number;
    name: string;
  } | null>(restoredNavigation?.routeOrigin ?? null);
  const [routeEditField, setRouteEditField] =
    useState<RouteEditTarget | null>(null);
  const [routeEditQuery, setRouteEditQuery] = useState('');
  const [routeMapPickTarget, setRouteMapPickTarget] =
    useState<RouteEditTarget | null>(null);
  const [draggedRouteStopIndex, setDraggedRouteStopIndex] =
    useState<number | null>(null);
  const [navigationActive, setNavigationActive] = useState(
    restoredNavigation?.active ?? false,
  );
  const [navigationFollowing, setNavigationFollowing] = useState(
    restoredNavigation?.following ?? true,
  );
  const [pendingNavigationStart, setPendingNavigationStart] = useState<{
    point: { latitude: number; longitude: number };
    originDistanceM: number;
  } | null>(null);
  const [reachedNavigationStop, setReachedNavigationStop] = useState<{
    index: number;
    name: string;
  } | null>(null);

  const [sheetHeightPx, setSheetHeightPx] = useState(112);
  const [movedCenter, setMovedCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mapClickAbortRef = useRef<AbortController | null>(null);
  const [mapClickLoading, setMapClickLoading] = useState(false);

  useEffect(() => {
    setPendingNavigationStart(null);
  }, [
    routeMode,
    routeOrigin?.latitude,
    routeOrigin?.longitude,
    destination?.id,
    routeWaypoints,
  ]); // custom-start choice only belongs to the current itinerary

  const layer = getLayer(layerId);
  const imageryLayer = layerId === 'satellite' || layerId === 'hybrid';
  const contrastLayer = imageryLayer || layerId === 'night';
  const isBusStopFilter = category === 'bus_stop';
  const showStops = overlays.includes('stops') || isBusStopFilter;

  const mapQueryCenter = movedCenter ?? center;
  const search = usePlaceSearch(query, mapQueryCenter, 180);
  const routeSearchCenter = useMemo(() => {
    if (routeEditField === 'origin') return routeOrigin ?? center;
    if (routeEditField === 'destination') return destination ?? center;
    if (routeEditField?.startsWith('waypoint:')) {
      const index = Number(routeEditField.split(':')[1]);
      return routeWaypoints[index] ?? center;
    }
    return center;
  }, [routeEditField, routeOrigin, destination, routeWaypoints, center]);
  const routeEndpointSearch = usePlaceSearch(
    routeEditField ? routeEditQuery : '',
    routeSearchCenter,
    240,
  );
  const categoryResults = usePlaceCategory(
    isBusStopFilter ? null : (category as never),
    mapQueryCenter,
  );
  const nearbyStops = useNearbyStops(
    showStops || panel === 'stop' ? mapQueryCenter : null,
    isBusStopFilter ? 5000 : 1500,
  );
  const stopRoutes = useStopRoutes(selectedStop);

  useEffect(() => {
    setSelectedTransitRoute(null);
  }, [selectedStop?.id]);

  const transitStatus = useTransitRealtimeStatus();
  const trafficProvider = useTrafficProvider();
  const trafficIncidents = useTrafficIncidents(
    viewport,
    Boolean(
      overlays.includes('traffic') &&
        trafficProvider.status.incidents,
    ),
    trafficProvider.status.refreshSeconds,
  );
  const saved = useSavedPlaces();
  const searchHistory = useMapSearchHistory();
  useVisitTracking(true);
  const visits = usePlaceVisits(60);

  const withUserDistance = useCallback(
    (place: MapPlace): MapPlace => ({
      ...place,
      distanceM: me
        ? distanceMeters(
            me.latitude,
            me.longitude,
            place.latitude,
            place.longitude,
          )
        : undefined,
    }),
    [me],
  );

  const searchPlacesForDisplay = useMemo(
    () => search.places.map(withUserDistance),
    [search.places, withUserDistance],
  );
  const categoryPlacesForDisplay = useMemo(
    () => categoryResults.places.map(withUserDistance),
    [categoryResults.places, withUserDistance],
  );

  const places = query.trim()
    ? searchPlacesForDisplay
    : isBusStopFilter
      ? []
      : categoryPlacesForDisplay;
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

  useEffect(() => {
    if (trafficProvider.loading) return;
    if (trafficProvider.status.configured) return;
    setOverlays((current) =>
      current.includes('traffic')
        ? current.filter((item) => item !== 'traffic')
        : current,
    );
  }, [
    trafficProvider.loading,
    trafficProvider.status.configured,
  ]);

  const liveTransitEnabled = Boolean(
    viewport &&
      transitStatus.vehicles &&
      (overlays.includes('transit') || showStops || routeMode === 'transit'),
  );
  const liveVehicles = useTransitVehicles(viewport, liveTransitEnabled);

  const focusMapOnPoint = useCallback(
    (point: { latitude: number; longitude: number }, zoom = 16) => {
      setCenter({ ...point });
      setMovedCenter(null);

      // Route fitBounds yoki tanlangan POI markazi faol bo'lsa ham current-location
      // tugmasi darhol ishlashi kerak. Shu sabab xaritani state effektini kutmasdan
      // Leaflet instance orqali bevosita markazlaymiz.
      const map = mapRef.current;
      if (map) {
        const targetZoom = Math.max(map.getZoom(), zoom);
        map.flyTo([point.latitude, point.longitude], targetZoom, {
          animate: true,
          duration: 0.65,
        });
      }
    },
    [],
  );

  // Restored active route/navigation session: refresh qilinganda navigator
  // yo'qolmaydi. GPS watch qayta boshlanadi va route state sessionStorage'dan keladi.
  useEffect(() => {
    if (!restoredNavigation) return;
    setPanel('route');
    setSnap(restoredNavigation.active ? 'peek' : 'half');
    if (restoredNavigation.destination) {
      setSelectedPlace(restoredNavigation.destination);
      setCenter({
        latitude: restoredNavigation.destination.latitude,
        longitude: restoredNavigation.destination.longitude,
      });
    }
  }, [restoredNavigation]);

  // Sahifa ochilganda joylashuvni bir marta yumshoq aniqlaymiz.
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
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, []);

  useEffect(() => {
    if (!me) return;
    setSelectedPlace((current) => (current ? withUserDistance(current) : current));
  }, [me?.latitude, me?.longitude, withUserDistance]);

  // Distance badge har doim real user joylashuviga nisbatan; xarita markazi
  // faqat qidiruv bias/viewport uchun ishlatiladi.

  const centerOnMe = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Joylashuv bu qurilmada mavjud emas.');
      return;
    }

    // Oldingi aniq koordinata bo'lsa, foydalanuvchi bosgan zahoti feedback beramiz.
    if (me) focusMapOnPoint(me, 16);

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setMe(point);
        focusMapOnPoint(point, 16);
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        if (me) {
          // Eski koordinata bilan markazlash allaqachon bajarilgan.
          if (error.code === error.PERMISSION_DENIED) {
            toast.error('Aniq joylashuv uchun brauzer ruxsatini yoqing.');
          }
          return;
        }

        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Joylashuvga ruxsat berilmagan. Brauzer sozlamasidan ruxsatni yoqing.'
            : error.code === error.TIMEOUT
              ? 'Joylashuvni aniqlash vaqti tugadi. Qayta urinib ko‘ring.'
              : 'Joylashuvni aniqlab bo‘lmadi.';
        toast.error(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 5000,
      },
    );
  }, [me, focusMapOnPoint]);

  // Boshqa sahifadan kelgan manzil.
  // Canonical format: /map?destLat=..&destLng=..&destName=..
  // Legacy format (/map?lat=..&lng=..&label=..) ham qo'llab-quvvatlanadi.
  useEffect(() => {
    const rawLat = params.get('destLat') ?? params.get('lat');
    const rawLng = params.get('destLng') ?? params.get('lng');
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (!lat && !lng)) return;

    const name =
      params.get('destName') ??
      params.get('label') ??
      'Belgilangan joy';
    const address =
      params.get('destAddress') ??
      params.get('address') ??
      null;

    const provisional: MapPlace = {
      id: 'param:' + lat + ',' + lng,
      source: 'param',
      name,
      categoryId: null,
      categoryLabel: 'Joy',
      latitude: lat,
      longitude: lng,
      address,
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

    setSelectedPlace(provisional);
    setCenter({ latitude: lat, longitude: lng });
    setPanel('place');
    setSnap('half');

    // Deep-link kartasi faqat query'dagi minimal ma'lumot bilan qolmasin:
    // real OSM POI topilsa, tanlangan joyni boyitamiz, lekin postdagi nomni
    // generic provider nomi bilan yomonlashtirmaymiz.
    const controller = new AbortController();
    void resolveMapClickPlace({ latitude: lat, longitude: lng }, 18, controller.signal)
      .then((resolved) => {
        if (!resolved || controller.signal.aborted) return;
        const deepLinkHasSpecificName =
          Boolean(name) &&
          !['Belgilangan joy', 'Joriy joylashuv', 'Joylashuv', 'Current location'].includes(name);

        setSelectedPlace({
          ...resolved,
          // Postdagi tanlangan joy nomi authoritative: deep-link bosilganda
          // aynan o'sha joy ochilishi kerak. OSM faqat metadata boyitadi.
          name: deepLinkHasSpecificName ? name : resolved.name || name,
          address: resolved.address ?? address,
        });
      })
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') {
          console.warn('Deep-link joylashuvini boyitib bo‘lmadi:', error);
        }
      });

    return () => controller.abort();
  }, [params]);

  const handleMapClick = useCallback(
    async (
      point: { latitude: number; longitude: number },
      zoom: number,
    ) => {
      mapClickAbortRef.current?.abort();
      const controller = new AbortController();
      mapClickAbortRef.current = controller;

      setSearchFocused(false);
      setLayerOpen(false);
      setSelectedStop(null);
      setMovedCenter(null);
      setCenter({ latitude: point.latitude, longitude: point.longitude });

      // UX: provider javobini kutib turmaymiz. Foydalanuvchi bosgan nuqta
      // darhol marker + karta sifatida ko'rinadi, keyin real OSM ma'lumoti bilan
      // shu karta joyida boyitiladi.
      const provisional = withUserDistance({
        id: 'click:' + point.latitude.toFixed(6) + ',' + point.longitude.toFixed(6),
        source: 'nominatim',
        name: 'Tanlangan joy',
        categoryLabel: 'Joy',
        latitude: point.latitude,
        longitude: point.longitude,
        address: null,
        tags: {},
      } as MapPlace);

      setSelectedPlace(provisional);
      setPanel('place');
      setSnap('half');
      setMapClickLoading(true);

      const map = mapRef.current;
      if (map) {
        map.panTo([point.latitude, point.longitude], { animate: true });
      }

      try {
        const resolved = await resolveMapClickPlace(point, zoom, controller.signal);
        if (controller.signal.aborted || !resolved) return;

        const place = withUserDistance(resolved);
        setSelectedPlace(place);
        setCenter({ latitude: place.latitude, longitude: place.longitude });

        if (mapRef.current) {
          mapRef.current.panTo([place.latitude, place.longitude], { animate: true });
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          // Provisional marker/card qoladi; provider xatosi clickni "yo'q" qilmaydi.
          toast.error('Joy tafsilotlarini yuklab bo‘lmadi, koordinata saqlandi.');
        }
      } finally {
        if (mapClickAbortRef.current === controller) {
          setMapClickLoading(false);
        }
      }
    },
    [withUserDistance],
  );

  const handleVectorFeatureClick = useCallback(
    async (feature: VectorRenderedFeature, zoom: number) => {
      const point = {
        latitude: feature.latitude,
        longitude: feature.longitude,
      };

      mapClickAbortRef.current?.abort();
      const controller = new AbortController();
      mapClickAbortRef.current = controller;

      setSearchFocused(false);
      setLayerOpen(false);
      setSelectedStop(null);
      setMovedCenter(null);
      setCenter(point);

      const featureTags = Object.fromEntries(
        Object.entries(feature.properties)
          .filter(([, value]) =>
            ['string', 'number', 'boolean'].includes(typeof value),
          )
          .map(([key, value]) => [key, String(value)]),
      );

      const provisional = withUserDistance({
        id:
          'vector:' +
          (feature.sourceLayer || feature.layerId || 'feature') +
          ':' +
          String(
            feature.featureId ??
              point.latitude.toFixed(6) + ',' + point.longitude.toFixed(6),
          ),
        source: 'vector',
        canonicalId: feature.canonicalId ?? undefined,
        name: feature.name || 'Tanlangan joy',
        categoryLabel:
          feature.sourceLayer === 'building'
            ? 'Bino'
            : feature.sourceLayer || 'Joy',
        latitude: point.latitude,
        longitude: point.longitude,
        address: null,
        tags: featureTags,
      } as MapPlace);

      setSelectedPlace(provisional);
      setPanel('place');
      setSnap('half');
      setMapClickLoading(true);
      mapRef.current?.panTo(
        [point.latitude, point.longitude],
        { animate: true },
      );

      try {
        const resolved = await resolveMapClickPlace(
          point,
          zoom,
          controller.signal,
        );
        if (controller.signal.aborted || !resolved) return;

        const enriched = withUserDistance({
          ...resolved,
          canonicalId:
            feature.canonicalId ??
            resolved.canonicalId,
          name:
            feature.name && feature.name !== 'Nomsiz joy'
              ? feature.name
              : resolved.name,
          tags: {
            ...featureTags,
            ...(resolved.tags ?? {}),
          },
        });
        setSelectedPlace(enriched);
        setCenter({
          latitude: enriched.latitude,
          longitude: enriched.longitude,
        });
        mapRef.current?.panTo(
          [enriched.latitude, enriched.longitude],
          { animate: true },
        );
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          toast.error(
            'Joy tafsilotlarini boyitib bo‘lmadi, vector feature saqlandi.',
          );
        }
      } finally {
        if (mapClickAbortRef.current === controller) {
          setMapClickLoading(false);
        }
      }
    },
    [withUserDistance],
  );

  const buildRoute = useCallback(
    async (
      place: MapPlace,
      mode: RouteMode,
      fromOverride?: { latitude: number; longitude: number; name?: string } | null,
      waypointsOverride?: MapPlace[],
    ) => {
      const from = fromOverride ?? routeOrigin ?? me ?? center;
      const waypoints = waypointsOverride ?? routeWaypoints;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setRouteLoading(true);
      try {
        const result = await fetchRoutesThrough(
          mode,
          [from, ...waypoints, place],
          controller.signal,
        );
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
    [me, center, routeOrigin, routeWaypoints],
  );

  const selectSearchPlace = useCallback(
    (place: MapPlace) => {
      const selected = withUserDistance(place);
      searchHistory.addRecent(query.trim() || selected.name);
      setSelectedPlace(selected);
      setSelectedStop(null);
      setMovedCenter(null);
      setCenter({ latitude: selected.latitude, longitude: selected.longitude });
      setPanel('place');
      setSnap('half');
      setSearchFocused(false);
    },
    [query, searchHistory, withUserDistance],
  );

  const openDirections = useCallback(
    (place: MapPlace) => {
      const origin = me
        ? { ...me, name: 'Joriy joylashuv' }
        : { ...center, name: 'Xarita markazi' };
      setRouteOrigin(origin);
      setRouteWaypoints([]);
      setDestination(place);
      setSelectedTransitRoute(null);
      setSelectedIncident(null);
      setSelectedStop(null);
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
    const nextWaypoints = [...routeWaypoints].reverse();

    setRouteOrigin(nextOrigin);
    setRouteWaypoints(nextWaypoints);
    setDestination(nextDestination);
    setSelectedPlace(nextDestination);
    void buildRoute(
      nextDestination,
      routeMode,
      nextOrigin,
      nextWaypoints,
    );
  }, [
    destination,
    routeOrigin,
    routeWaypoints,
    me,
    center,
    buildRoute,
    routeMode,
  ]);

  const applyRouteEndpoint = useCallback(
    (place: MapPlace, target: RouteEditTarget) => {
      if (target === 'origin') {
        const nextOrigin = {
          latitude: place.latitude,
          longitude: place.longitude,
          name: place.name,
        };
        setRouteOrigin(nextOrigin);
        if (destination) {
          void buildRoute(
            destination,
            routeMode,
            nextOrigin,
            routeWaypoints,
          );
        }
      } else if (target === 'destination') {
        setDestination(place);
        setSelectedPlace(place);
        void buildRoute(
          place,
          routeMode,
          routeOrigin,
          routeWaypoints,
        );
      } else if (target === 'append') {
        const nextWaypoints = destination
          ? [...routeWaypoints, destination]
          : routeWaypoints;
        setRouteWaypoints(nextWaypoints);
        setDestination(place);
        setSelectedPlace(place);
        void buildRoute(
          place,
          routeMode,
          routeOrigin,
          nextWaypoints,
        );
      } else if (target.startsWith('waypoint:')) {
        const index = Number(target.split(':')[1]);
        if (!Number.isInteger(index) || index < 0) return;
        const nextWaypoints = routeWaypoints.map((item, itemIndex) =>
          itemIndex === index ? place : item,
        );
        setRouteWaypoints(nextWaypoints);
        if (destination) {
          void buildRoute(
            destination,
            routeMode,
            routeOrigin,
            nextWaypoints,
          );
        }
      }

      setRouteEditField(null);
      setRouteEditQuery('');
      setRouteMapPickTarget(null);
    },
    [
      destination,
      routeMode,
      routeOrigin,
      routeWaypoints,
      buildRoute,
    ],
  );

  const selectRouteEndpoint = useCallback(
    (place: MapPlace) => {
      if (!routeEditField) return;
      applyRouteEndpoint(place, routeEditField);
    },
    [routeEditField, applyRouteEndpoint],
  );

  const removeRouteWaypoint = useCallback(
    (index: number) => {
      const nextWaypoints = routeWaypoints.filter(
        (_, itemIndex) => itemIndex !== index,
      );
      setRouteWaypoints(nextWaypoints);
      if (destination) {
        void buildRoute(
          destination,
          routeMode,
          routeOrigin,
          nextWaypoints,
        );
      }
    },
    [
      routeWaypoints,
      destination,
      routeMode,
      routeOrigin,
      buildRoute,
    ],
  );

  const reorderRouteStop = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!destination) return;

      const stops = [...routeWaypoints, destination];
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= stops.length ||
        toIndex >= stops.length ||
        fromIndex === toIndex
      ) {
        return;
      }

      const nextStops = [...stops];
      const [moved] = nextStops.splice(fromIndex, 1);
      nextStops.splice(toIndex, 0, moved);

      const nextDestination = nextStops[nextStops.length - 1];
      const nextWaypoints = nextStops.slice(0, -1);

      setRouteWaypoints(nextWaypoints);
      setDestination(nextDestination);
      setSelectedPlace(nextDestination);
      void buildRoute(
        nextDestination,
        routeMode,
        routeOrigin,
        nextWaypoints,
      );
    },
    [
      destination,
      routeWaypoints,
      routeMode,
      routeOrigin,
      buildRoute,
    ],
  );

  const optimizeStops = useCallback(async () => {
    if (!destination || routeWaypoints.length < 2) return;

    const origin =
      routeOrigin ??
      (me
        ? { ...me, name: 'Joriy joylashuv' }
        : { ...center, name: 'Xarita markazi' });

    setRouteOptimizing(true);
    try {
      const optimized = await optimizeRouteWaypoints(
        routeMode,
        origin,
        routeWaypoints,
        destination,
      );
      const changed = optimized.some(
        (place, index) => place.id !== routeWaypoints[index]?.id,
      );

      if (!changed) {
        toast('Manzillar tartibi allaqachon qulay.');
        return;
      }

      setRouteWaypoints(optimized);
      await buildRoute(
        destination,
        routeMode,
        origin,
        optimized,
      );
      toast.success('Oraliq manzillar tartibi optimallashtirildi.');
    } finally {
      setRouteOptimizing(false);
    }
  }, [
    destination,
    routeWaypoints,
    routeOrigin,
    me,
    center,
    routeMode,
    buildRoute,
  ]);

  const removeFinalDestination = useCallback(() => {
    if (routeWaypoints.length) {
      const nextWaypoints = routeWaypoints.slice(0, -1);
      const nextDestination =
        routeWaypoints[routeWaypoints.length - 1];
      setRouteWaypoints(nextWaypoints);
      setDestination(nextDestination);
      setSelectedPlace(nextDestination);
      void buildRoute(
        nextDestination,
        routeMode,
        routeOrigin,
        nextWaypoints,
      );
      return;
    }

    clearNavigationSession();
    setDestination(null);
    setRouteWaypoints([]);
    setRouteOrigin(null);
    setRoutes([]);
    setRouteIndex(0);
    setSelectedPlace(null);
    setPendingNavigationStart(null);
  }, [routeWaypoints, routeMode, routeOrigin, buildRoute]);

  const dismissRoute = useCallback(() => {
    clearNavigationSession();
    setNavigationActive(false);
    setNavigationFollowing(true);
    setPendingNavigationStart(null);
    setReachedNavigationStop(null);
    setRoutes([]);
    setRouteIndex(0);
    setRouteOrigin(null);
    setRouteWaypoints([]);
    setDestination(null);
    setRouteEditField(null);
    setRouteEditQuery('');
    setRouteMapPickTarget(null);
    setSelectedPlace(null);
    setPanel('search');
    setSnap('peek');
  }, []);

  const useCurrentLocationAsOrigin = useCallback(() => {
    if (!me) {
      centerOnMe();
      return;
    }
    const nextOrigin = { ...me, name: 'Joriy joylashuv' };
    setRouteOrigin(nextOrigin);
    setRouteEditField(null);
    setRouteEditQuery('');
    setRouteMapPickTarget(null);
    if (destination) {
      void buildRoute(
        destination,
        routeMode,
        nextOrigin,
        routeWaypoints,
      );
    }
  }, [
    me,
    destination,
    routeMode,
    routeWaypoints,
    buildRoute,
    centerOnMe,
  ]);

  const beginMapEndpointPick = useCallback(
    (target: RouteEditTarget) => {
      setRouteEditField(null);
      setRouteEditQuery('');
      setRouteMapPickTarget(target);
      setSearchFocused(false);
      setLayerOpen(false);
      toast('Xaritada kerakli nuqtani bosing.');
    },
    [],
  );

  const handleRouteMapPick = useCallback(
    async (
      point: { latitude: number; longitude: number },
      zoom: number,
    ) => {
      if (!routeMapPickTarget) return;

      const target = routeMapPickTarget;
      const provisional = {
        id:
          'route-map:' +
          point.latitude.toFixed(6) +
          ',' +
          point.longitude.toFixed(6),
        source: 'route',
        name: 'Xaritadan tanlangan nuqta',
        categoryLabel: 'Joy',
        latitude: point.latitude,
        longitude: point.longitude,
        address: null,
        tags: {},
      } as unknown as MapPlace;

      applyRouteEndpoint(provisional, target);

      try {
        const resolved = await resolveMapClickPlace(point, zoom);
        if (resolved) {
          // Xaritadan tanlashda user bosgan koordinata authoritative bo'ladi.
          // Reverse/POI resolver faqat nom, manzil va metadata bilan boyitadi.
          applyRouteEndpoint(
            withUserDistance({
              ...resolved,
              latitude: point.latitude,
              longitude: point.longitude,
            }),
            target,
          );
        }
      } catch {
        // Provisional coordinate marshrut uchun yetarli.
      }
    },
    [
      routeMapPickTarget,
      applyRouteEndpoint,
      withUserDistance,
    ],
  );


  const buildPlaceUrl = useCallback((place: MapPlace) => {
    const url = new URL('/map', window.location.origin);
    url.searchParams.set('destLat', String(place.latitude));
    url.searchParams.set('destLng', String(place.longitude));
    url.searchParams.set('destName', place.name);
    url.searchParams.set('placeId', canonicalPlaceId(place));
    return url.toString();
  }, []);

  const copyTextFallback = useCallback(async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Legacy fallback below.
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }, []);

  const sendPlaceToChat = useCallback(
    (place: MapPlace) => {
      const params = new URLSearchParams({
        share: 'location',
        lat: String(place.latitude),
        lng: String(place.longitude),
        label: place.address ? place.name + ', ' + place.address : place.name,
        name: place.name,
        placeId: canonicalPlaceId(place),
      });
      navigate('/messages?' + params.toString());
    },
    [navigate],
  );

  const sharePlace = useCallback(
    async (place: MapPlace) => {
      const url = buildPlaceUrl(place);
      const text = place.address ? place.name + ' · ' + place.address : place.name;
      const data = { title: place.name, text, url };

      if (typeof navigator.share === 'function') {
        try {
          if (!navigator.canShare || navigator.canShare(data)) {
            await navigator.share(data);
            return;
          }
        } catch (error) {
          if ((error as DOMException)?.name === 'AbortError') return;
          // Native share xato bersa clipboard fallback ishlaydi.
        }
      }

      const copied = await copyTextFallback(url);
      if (copied) {
        toast.success('Joy havolasi nusxalandi');
      } else {
        toast.error('Ulashib bo‘lmadi. Havolani qo‘lda nusxalab ko‘ring.');
      }
    },
    [buildPlaceUrl, copyTextFallback],
  );

  const toggleSave = async (place: MapPlace) => {
    const added = await saved.toggleSave({
      name: place.name,
      address: place.address,
      category: place.categoryId,
      latitude: place.latitude,
      longitude: place.longitude,
      externalId: canonicalPlaceId(place),
      externalSource: 'alsamos',
    });
    toast.success(added ? 'Saqlangan joylarga qo\u2019shildi' : 'Saqlangan joylardan olindi');
  };

  const rerouteNavigation = useCallback(
    async (
      from: { latitude: number; longitude: number },
      context: { nearestRouteIndex: number },
    ) => {
      if (!destination || routeMode === 'transit') return;

      const currentRoute = routes[routeIndex];
      const checkpoints = currentRoute?.checkpointIndices ?? [];
      const remainingWaypoints = routeWaypoints.filter((_, index) => {
        const checkpointIndex = checkpoints[index + 1];
        return (
          checkpointIndex == null ||
          checkpointIndex > context.nearestRouteIndex + 3
        );
      });

      try {
        const result = await fetchRoutesThrough(
          routeMode,
          [from, ...remainingWaypoints, destination],
        );
        if (!result.length) return;
        setRouteOrigin({ ...from, name: 'Joriy joylashuv' });
        setRouteWaypoints(remainingWaypoints);
        setReachedNavigationStop(null);
        setRoutes(result);
        setRouteIndex(0);
      } catch {
        toast.error('Yangi marshrutni hisoblab bo‘lmadi.');
      }
    },
    [destination, routeMode, routeWaypoints, routes, routeIndex],
  );

  const handleNavigationPosition = useCallback(
    (position: NavigationPosition) => {
      const point = {
        latitude: position.latitude,
        longitude: position.longitude,
      };
      setMe(point);

      if (!navigationFollowing) return;

      // Vanilla Leaflet raster xaritani barqaror aylantirmaydi. Shu sabab hozir
      // "heading-up" hissini camera look-ahead bilan beramiz: marker ekran
      // markazidan biroz pastroqda qoladi va oldindagi yo'l ko'proq ko'rinadi.
      const camera = navigationCameraTarget(position);
      setCenter(camera);
      setMovedCenter(null);

      const map = mapRef.current;
      if (map) {
        map.setView(
          [camera.latitude, camera.longitude],
          Math.max(17, map.getZoom()),
          { animate: true },
        );
      }
    },
    [navigationFollowing],
  );

  const stopNavigation = useCallback(() => {
    clearNavigationSession();
    setNavigationActive(false);
    setNavigationFollowing(true);
    setPendingNavigationStart(null);
    setReachedNavigationStop(null);
    setPanel('route');
    setSnap('half');
  }, []);

  useEffect(() => {
    if (!navigationActive) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      stopNavigation();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigationActive, stopNavigation]); // Escape ham navigationdan chiqadi

  const handleNavigationCheckpoint = useCallback(
    (index: number, checkpoint: { name?: string }) => {
      const name =
        checkpoint.name ||
        routeWaypoints[index]?.name ||
        'Oraliq manzil';
      setReachedNavigationStop({ index, name });
      toast.success(name + ' manziliga yetib keldingiz.');
    },
    [routeWaypoints],
  );

  const handleNavigationArrive = useCallback(() => {
    setReachedNavigationStop(null);
    toast.success('Manzilga yetib keldingiz.');
  }, []);

  const activateNavigationAt = useCallback(
    (point: { latitude: number; longitude: number }) => {
      setPendingNavigationStart(null);
      setReachedNavigationStop(null);
      setMe(point);
      setCenter(point);
      setNavigationFollowing(true);
      setNavigationActive(true);
      setSearchFocused(false);
      setLayerOpen(false);
      setSnap('peek');

      const map = mapRef.current;
      if (map) {
        map.setView([point.latitude, point.longitude], 17, { animate: true });
      }
    },
    [],
  );

  const rebuildAndActivateNavigation = useCallback(
    async (
      point: { latitude: number; longitude: number },
      strategy: 'current' | 'via-origin',
    ) => {
      if (!destination) return;

      let nextWaypoints = routeWaypoints;
      if (strategy === 'via-origin' && routeOrigin) {
        const originalOrigin = {
          id:
            'route-origin-stop:' +
            routeOrigin.latitude.toFixed(6) +
            ',' +
            routeOrigin.longitude.toFixed(6),
          source: 'route',
          name: routeOrigin.name || 'Boshlanish nuqtasi',
          categoryLabel: 'Joy',
          latitude: routeOrigin.latitude,
          longitude: routeOrigin.longitude,
          address: null,
          tags: {},
        } as unknown as MapPlace;
        nextWaypoints = [originalOrigin, ...routeWaypoints];
      }

      setRouteLoading(true);
      try {
        const result = await fetchRoutesThrough(
          routeMode,
          [point, ...nextWaypoints, destination],
        );
        if (!result.length) {
          toast.error('Marshrut topilmadi.');
          return;
        }

        setRouteOrigin({ ...point, name: 'Joriy joylashuv' });
        setRouteWaypoints(nextWaypoints);
        setRoutes(result);
        setRouteIndex(0);
        activateNavigationAt(point);
      } catch {
        toast.error('Navigatsiya uchun marshrutni qayta hisoblab bo‘lmadi.');
      } finally {
        setRouteLoading(false);
      }
    },
    [
      destination,
      routeWaypoints,
      routeOrigin,
      routeMode,
      activateNavigationAt,
    ],
  );

  const confirmNavigationStart = useCallback(
    async (strategy: 'current' | 'via-origin') => {
      const pending = pendingNavigationStart;
      if (!pending) return;
      await rebuildAndActivateNavigation(pending.point, strategy);
    },
    [pendingNavigationStart, rebuildAndActivateNavigation],
  );

  const startNavigation = useCallback(async () => {
    if (!destination || !routes[routeIndex]) {
      toast.error('Avval marshrutni tanlang.');
      return;
    }
    if (routeMode === 'transit') {
      toast.error(
        'Active navigation hozircha avtomobil, piyoda va velosiped uchun.',
      );
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Navigatsiya uchun joylashuv xizmati kerak.');
      return;
    }

    const begin = async (point: {
      latitude: number;
      longitude: number;
    }) => {
      const originDistance = routeOrigin
        ? distanceMeters(
            point.latitude,
            point.longitude,
            routeOrigin.latitude,
            routeOrigin.longitude,
          )
        : 0;

      if (routeOrigin && originDistance > 150) {
        setPendingNavigationStart({
          point,
          originDistanceM: originDistance,
        });
        setPanel('route');
        setSnap('half');
        return;
      }

      activateNavigationAt(point);
    };

    if (me) {
      await begin(me);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        void begin({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        setLocating(false);
        toast.error(
          error.code === error.PERMISSION_DENIED
            ? 'Navigatsiya uchun joylashuv ruxsatini yoqing.'
            : 'Joriy joylashuvni aniqlab bo‘lmadi.',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 2_000 },
    );
  }, [
    destination,
    routes,
    routeIndex,
    routeMode,
    routeOrigin,
    me,
    activateNavigationAt,
  ]);



  useEffect(() => {
    if (!navigationActive || !destination || !routes.length) {
      if (!navigationActive) clearNavigationSession();
      return;
    }
    writeNavigationSession({
      active: navigationActive,
      following: navigationFollowing,
      mode: routeMode,
      routeIndex,
      routeOrigin,
      destination,
      routeWaypoints,
      routes,
    });
  }, [
    navigationActive,
    navigationFollowing,
    routeMode,
    routeIndex,
    routeOrigin,
    destination,
    routeWaypoints,
    routes,
  ]);

  useEffect(() => {
    if (!navigationActive || !destination || !routes.length) return;

    // Uzoq safarda session TTL eskirib ketmasligi uchun aktiv navigatsiya
    // holatini davriy yangilab turamiz.
    const timer = window.setInterval(() => {
      writeNavigationSession({
        active: true,
        following: navigationFollowing,
        mode: routeMode,
        routeIndex,
        routeOrigin,
        destination,
        routeWaypoints,
        routes,
      });
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [
    navigationActive,
    navigationFollowing,
    routeMode,
    routeIndex,
    routeOrigin,
    destination,
    routeWaypoints,
    routes,
  ]); // navigation-session heartbeat

  const activeRoute = routes[routeIndex] ?? null;
  const navigationCheckpoints = useMemo(
    () =>
      destination
        ? [
            ...routeWaypoints.map((place) => ({
              latitude: place.latitude,
              longitude: place.longitude,
              name: place.name,
            })),
            {
              latitude: destination.latitude,
              longitude: destination.longitude,
              name: destination.name,
            },
          ]
        : [],
    [routeWaypoints, destination],
  );
  const navigation = useActiveNavigation({
    active: navigationActive,
    route: activeRoute,
    mode: routeMode,
    destination: destination
      ? { latitude: destination.latitude, longitude: destination.longitude }
      : null,
    checkpoints: navigationCheckpoints,
    onPosition: handleNavigationPosition,
    onReroute: rerouteNavigation,
    onCheckpoint: handleNavigationCheckpoint,
    onArrive: handleNavigationArrive,
  });
  const navigationVoice = useNavigationVoice({
    active: navigationActive,
    snapshot: navigation.snapshot,
  });

  const nextNavigationStop = useMemo(() => {
    const index = navigation.snapshot.nextCheckpointIndex;
    if (index == null) return null;

    if (index < routeWaypoints.length) {
      return {
        name: routeWaypoints[index]?.name ?? 'Oraliq manzil',
        intermediate: true,
      };
    }

    return destination
      ? { name: destination.name, intermediate: false }
      : null;
  }, [
    navigation.snapshot.nextCheckpointIndex,
    routeWaypoints,
    destination,
  ]);

  const skipNextNavigationStop = useCallback(async () => {
    if (!destination || !navigation.position) return;

    const nextIndex = navigation.snapshot.nextCheckpointIndex;
    if (
      nextIndex == null ||
      nextIndex < 0 ||
      nextIndex >= routeWaypoints.length
    ) {
      return;
    }

    const nextWaypoints = routeWaypoints.slice(nextIndex + 1);
    const point = {
      latitude: navigation.position.latitude,
      longitude: navigation.position.longitude,
    };

    setRouteLoading(true);
    try {
      const result = await fetchRoutesThrough(
        routeMode,
        [point, ...nextWaypoints, destination],
      );
      if (!result.length) return;

      setRouteOrigin({ ...point, name: 'Joriy joylashuv' });
      setRouteWaypoints(nextWaypoints);
      setRoutes(result);
      setRouteIndex(0);
      setReachedNavigationStop(null);
      toast.success('Oraliq manzil o‘tkazib yuborildi.');
    } catch {
      toast.error('Keyingi marshrutni hisoblab bo‘lmadi.');
    } finally {
      setRouteLoading(false);
    }
  }, [
    destination,
    navigation.position,
    navigation.snapshot.nextCheckpointIndex,
    routeWaypoints,
    routeMode,
  ]);

  const fitTo =
    navigationActive || !activeRoute?.coordinates?.length
      ? null
      : activeRoute.coordinates;

  const navigationRemainingCoordinates = useMemo(() => {
    if (!navigationActive || !activeRoute?.coordinates?.length) {
      return activeRoute?.coordinates ?? [];
    }
    const start = Math.max(
      0,
      Math.min(
        navigation.snapshot.nearestRouteIndex,
        activeRoute.coordinates.length - 1,
      ),
    );
    const remaining = activeRoute.coordinates.slice(start);
    if (navigation.position) {
      return [
        [navigation.position.latitude, navigation.position.longitude] as [number, number],
        ...remaining,
      ];
    }
    return remaining;
  }, [
    navigationActive,
    activeRoute,
    navigation.snapshot.nearestRouteIndex,
    navigation.position,
  ]);

  const navigationTravelledCoordinates = useMemo(() => {
    if (!navigationActive || !activeRoute?.coordinates?.length) return [];
    const end = Math.max(
      0,
      Math.min(
        navigation.snapshot.nearestRouteIndex + 1,
        activeRoute.coordinates.length,
      ),
    );
    return activeRoute.coordinates.slice(0, end);
  }, [navigationActive, activeRoute, navigation.snapshot.nearestRouteIndex]);

  const vectorLayerCompatible =
    layerId === 'map' || layerId === 'night';
  const effectiveMapEngine: MapEngineId =
    mapEngine === 'vector' && vectorLayerCompatible ? 'vector' : 'raster';

  useEffect(() => {
    writePreferredMapEngine(mapEngine);
  }, [mapEngine]);

  const rasterSceneMarkers = useMemo<MapSceneMarker[]>(() => {
    const markers: MapSceneMarker[] = [];

    if (me && !navigationActive) {
      markers.push({
        id: 'me',
        kind: 'me',
        latitude: me.latitude,
        longitude: me.longitude,
        label: 'Joriy joylashuv',
      });
    }

    if (navigationActive && navigation.position) {
      markers.push({
        id: 'navigation',
        kind: 'navigation',
        latitude: navigation.position.latitude,
        longitude: navigation.position.longitude,
        bearing: navigation.position.heading,
        label: 'Joriy joylashuv',
      });
    }

    if (!navigationActive) {
      for (const group of markerGroups) {
        if (group.type === 'cluster') {
          markers.push({
            id: 'cluster|' + group.id,
            kind: 'cluster',
            latitude: group.latitude,
            longitude: group.longitude,
            count: group.count,
            label: group.count + ' ta joy',
          });
        } else {
          markers.push({
            id: 'place|' + group.place.id,
            kind: 'place',
            latitude: group.place.latitude,
            longitude: group.place.longitude,
            color: categoryUi(group.place.categoryId).color,
            label: group.place.name,
          });
        }
      }

      if (panel === 'route' && routeOrigin) {
        markers.push({
          id: 'route-origin',
          kind: 'route-origin',
          latitude: routeOrigin.latitude,
          longitude: routeOrigin.longitude,
          color: '#2F6FED',
          label: 'From · ' + routeOrigin.name,
        });
      }

      if (panel === 'route') {
        routeWaypoints.forEach((waypoint, index) => {
          markers.push({
            id: 'route-stop|' + index,
            kind: 'route-stop',
            latitude: waypoint.latitude,
            longitude: waypoint.longitude,
            color: '#2F6FED',
            label: waypoint.name,
          });
        });
      }

      if (panel === 'route' && destination) {
        markers.push({
          id: 'route-destination',
          kind: 'route-destination',
          latitude: destination.latitude,
          longitude: destination.longitude,
          color: '#ef4444',
          active: true,
          label: destination.name,
        });
      }

      if (selectedPlace && panel !== 'route') {
        markers.push({
          id: 'selected|' + selectedPlace.id,
          kind: 'selected',
          latitude: selectedPlace.latitude,
          longitude: selectedPlace.longitude,
          color: categoryUi(selectedPlace.categoryId).color,
          active: true,
          label: selectedPlace.name,
        });
      }

      if (liveVehicles.realtime) {
        liveVehicles.vehicles.forEach((vehicle) => {
          markers.push({
            id: 'vehicle|' + vehicle.id,
            kind: 'vehicle',
            latitude: vehicle.latitude,
            longitude: vehicle.longitude,
            color: vehicle.color,
            bearing: vehicle.bearing,
            label: vehicle.ref,
          });
        });
      }

      if (showStops) {
        visibleStops.forEach((stop) => {
          markers.push({
            id: 'stop|' + stop.id,
            kind: 'stop',
            latitude: stop.latitude,
            longitude: stop.longitude,
            label: stop.name || 'Bekat',
          });
        });
      }
    }

    if (overlays.includes('traffic')) {
      trafficIncidents.incidents.forEach((incident) => {
        markers.push({
          id: 'incident|' + incident.id,
          kind: 'incident',
          latitude: incident.latitude,
          longitude: incident.longitude,
          color: trafficIncidentColor(incident.category),
          label:
            incident.description ||
            trafficIncidentLabel(incident),
          variant: incident.category,
          active: selectedIncident?.id === incident.id,
        });
      });
    }

    return markers;
  }, [
    me,
    navigationActive,
    navigation.position,
    markerGroups,
    panel,
    routeOrigin,
    routeWaypoints,
    destination,
    selectedPlace,
    liveVehicles.realtime,
    liveVehicles.vehicles,
    showStops,
    visibleStops,
    overlays,
    trafficIncidents.incidents,
    selectedIncident?.id,
    selectedTransitRoute,
  ]);

  const vectorSceneMarkers = useMemo<MapSceneMarker[]>(() => {
    const markers: MapSceneMarker[] = [];

    if (me && !navigationActive) {
      markers.push({
        id: 'me',
        kind: 'me',
        latitude: me.latitude,
        longitude: me.longitude,
        label: 'Joriy joylashuv',
      });
    }

    if (navigationActive && navigation.position) {
      markers.push({
        id: 'navigation',
        kind: 'navigation',
        latitude: navigation.position.latitude,
        longitude: navigation.position.longitude,
        bearing: navigation.position.heading,
        label: 'Joriy joylashuv',
      });
    }

    if (!navigationActive) {
      // Vector renderer clusteringni GPU/source darajasida o'zi qiladi.
      // Shu sabab unga oldindan clusterlangan markerGroups emas, raw viewport
      // POIlar beriladi. Raster Leaflet esa eski markerGroups'ni ishlatishda davom etadi.
      for (const place of visiblePlaces) {
        markers.push({
          id: 'place|' + place.id,
          kind: 'place',
          latitude: place.latitude,
          longitude: place.longitude,
          color: categoryUi(place.categoryId).color,
          label: place.name,
        });
      }

      if (panel === 'route' && routeOrigin) {
        markers.push({
          id: 'route-origin',
          kind: 'route-origin',
          latitude: routeOrigin.latitude,
          longitude: routeOrigin.longitude,
          color: '#2F6FED',
          label: 'From · ' + routeOrigin.name,
        });
      }

      if (panel === 'route') {
        routeWaypoints.forEach((waypoint, index) => {
          markers.push({
            id: 'route-stop|' + index,
            kind: 'route-stop',
            latitude: waypoint.latitude,
            longitude: waypoint.longitude,
            color: '#2F6FED',
            label: waypoint.name,
          });
        });
      }

      if (panel === 'route' && destination) {
        markers.push({
          id: 'route-destination',
          kind: 'route-destination',
          latitude: destination.latitude,
          longitude: destination.longitude,
          color: '#ef4444',
          active: true,
          label: destination.name,
        });
      }

      if (selectedPlace && panel !== 'route') {
        markers.push({
          id: 'selected|' + selectedPlace.id,
          kind: 'selected',
          latitude: selectedPlace.latitude,
          longitude: selectedPlace.longitude,
          color: categoryUi(selectedPlace.categoryId).color,
          active: true,
          label: selectedPlace.name,
        });
      }

      if (liveVehicles.realtime) {
        liveVehicles.vehicles.forEach((vehicle) => {
          markers.push({
            id: 'vehicle|' + vehicle.id,
            kind: 'vehicle',
            latitude: vehicle.latitude,
            longitude: vehicle.longitude,
            color: vehicle.color,
            bearing: vehicle.bearing,
            label: vehicle.ref,
          });
        });
      }

      if (showStops) {
        visibleStops.forEach((stop) => {
          markers.push({
            id: 'stop|' + stop.id,
            kind: 'stop',
            latitude: stop.latitude,
            longitude: stop.longitude,
            label: stop.name || 'Bekat',
          });
        });
      }
    }

    if (overlays.includes('traffic')) {
      trafficIncidents.incidents.forEach((incident) => {
        markers.push({
          id: 'incident|' + incident.id,
          kind: 'incident',
          latitude: incident.latitude,
          longitude: incident.longitude,
          color: trafficIncidentColor(incident.category),
          label:
            incident.description ||
            trafficIncidentLabel(incident),
          variant: incident.category,
          active: selectedIncident?.id === incident.id,
        });
      });
    }

    return markers;
  }, [
    me,
    navigationActive,
    navigation.position,
    visiblePlaces,
    panel,
    routeOrigin,
    routeWaypoints,
    destination,
    selectedPlace,
    liveVehicles.realtime,
    liveVehicles.vehicles,
    showStops,
    visibleStops,
    overlays,
    trafficIncidents.incidents,
    selectedIncident?.id,
  ]);

  const vectorSceneLines = useMemo<MapSceneLine[]>(() => {
    const lines: MapSceneLine[] = [];

    if (
      selectedTransitRoute?.shapeCoordinates &&
      selectedTransitRoute.shapeCoordinates.length > 1
    ) {
      lines.push({
        id: 'selected-transit-route:' + selectedTransitRoute.id,
        coordinates: selectedTransitRoute.shapeCoordinates,
        color: selectedTransitRoute.colour || '#1E7BC4',
        width: 6,
        opacity: 0.94,
      });
    }

    if (overlays.includes('traffic')) {
      trafficIncidents.incidents.forEach((incident) => {
        if (
          incident.geometry?.type !== 'LineString' ||
          !Array.isArray(incident.geometry.coordinates)
        ) {
          return;
        }

        const coordinates = incident.geometry.coordinates
          .map((point) => {
            if (
              !Array.isArray(point) ||
              point.length < 2 ||
              !Number.isFinite(Number(point[0])) ||
              !Number.isFinite(Number(point[1]))
            ) {
              return null;
            }
            return [
              Number(point[1]),
              Number(point[0]),
            ] as [number, number];
          })
          .filter(
            (point): point is [number, number] => point !== null,
          );

        if (coordinates.length < 2) return;
        lines.push({
          id: 'traffic-incident-line:' + incident.id,
          coordinates,
          color: trafficIncidentColor(incident.category),
          width: selectedIncident?.id === incident.id ? 8 : 6,
          opacity: selectedIncident?.id === incident.id ? 1 : 0.82,
        });
      });
    }

    if (!activeRoute || activeRoute.coordinates.length < 2) {
      return lines;
    }

    const currentCoordinates = navigationActive
      ? navigationRemainingCoordinates
      : activeRoute.coordinates;

    if (
      navigationActive &&
      navigationTravelledCoordinates.length > 1
    ) {
      lines.push({
        id: 'travelled',
        coordinates: navigationTravelledCoordinates,
        color: '#7B8494',
        width: 5,
        opacity: 0.55,
      });
    }

    if (currentCoordinates.length > 1) {
      lines.push({
        id: 'route-outline',
        coordinates: currentCoordinates,
        color: '#ffffff',
        width: 9,
        opacity: 0.9,
      });
      lines.push({
        id: 'route-active',
        coordinates: currentCoordinates,
        color: '#2F6FED',
        width: 5,
        opacity: 1,
      });

      if (
        !navigationActive &&
        activeRoute.trafficSections?.length
      ) {
        activeRoute.trafficSections.forEach((section, index) => {
          const start = Math.max(
            0,
            Math.min(
              activeRoute.coordinates.length - 1,
              section.startIndex,
            ),
          );
          const end = Math.max(
            start,
            Math.min(
              activeRoute.coordinates.length - 1,
              section.endIndex,
            ),
          );
          const coordinates =
            activeRoute.coordinates.slice(start, end + 1);
          if (coordinates.length < 2) return;

          const category = String(section.category).toLowerCase();
          const color =
            category.includes('closure')
              ? '#DC2626'
              : category.includes('work')
                ? '#F97316'
                : category.includes('jam')
                  ? section.magnitude >= 3
                    ? '#E11D48'
                    : section.magnitude >= 2
                      ? '#F97316'
                      : '#F59E0B'
                  : '#F59E0B';

          lines.push({
            id: 'traffic-section:' + index,
            coordinates,
            color,
            width: 7,
            opacity: 0.94,
          });
        });
      }
    }

    return lines;
  }, [
    activeRoute,
    navigationActive,
    navigationRemainingCoordinates,
    navigationTravelledCoordinates,
    overlays,
    trafficIncidents.incidents,
    selectedIncident?.id,
    selectedTransitRoute,
  ]);

  const handleVectorMarkerClick = useCallback(
    (markerId: string) => {
      if (markerId.startsWith('cluster|')) {
        const rawId = markerId.slice('cluster|'.length);
        const group = markerGroups.find(
          (item) => item.type === 'cluster' && item.id === rawId,
        );
        if (!group || group.type !== 'cluster') return;
        const map = mapRef.current;
        if (!map) return;
        map.setView(
          [group.latitude, group.longitude],
          Math.min(18, Math.max(map.getZoom() + 2, 15)),
          { animate: true },
        );
        return;
      }

      if (markerId.startsWith('place|')) {
        const placeId = markerId.slice('place|'.length);
        const place = visiblePlaces.find((item) => item.id === placeId);
        if (!place) return;
        const selected = withUserDistance(place);
        setSelectedPlace(selected);
        setSelectedStop(null);
        setSelectedIncident(null);
        setMovedCenter(null);
        setCenter({
          latitude: selected.latitude,
          longitude: selected.longitude,
        });
        setPanel('place');
        setSnap('half');
        return;
      }

      if (markerId.startsWith('stop|')) {
        const stopId = markerId.slice('stop|'.length);
        const stop = visibleStops.find((item) => item.id === stopId);
        if (!stop) return;
        setSelectedStop(stop);
        setSelectedPlace(null);
        setSelectedIncident(null);
        setCenter({
          latitude: stop.latitude,
          longitude: stop.longitude,
        });
        setPanel('stop');
        setSnap('half');
        return;
      }

      if (markerId.startsWith('incident|')) {
        const incidentId = markerId.slice('incident|'.length);
        const incident = trafficIncidents.incidents.find(
          (item) => item.id === incidentId,
        );
        if (!incident) return;
        setSelectedIncident(incident);
        setSelectedPlace(null);
        setSelectedStop(null);
        setMovedCenter(null);
        setCenter({
          latitude: incident.latitude,
          longitude: incident.longitude,
        });
        setPanel('incident');
        setSnap('half');
      }
    },
    [
      markerGroups,
      visiblePlaces,
      visibleStops,
      trafficIncidents.incidents,
      withUserDistance,
    ],
  );

  const handleVectorEngineError = useCallback((error: Error) => {
    console.error('[map/vector] renderer failed, reverting to raster', error);
    setMapEngine('raster');
    writePreferredMapEngine('raster');
    toast.error(
      'Vector xarita ishga tushmadi. Oddiy xaritaga xavfsiz qaytildi.',
    );
  }, []);

  const panelBody = useMemo(() => {
    if (panel === 'place' && selectedPlace) {
      return (
        <PlaceDetailsCard
          place={selectedPlace}
          saved={saved.isSaved(selectedPlace.latitude, selectedPlace.longitude)}
          highContrast={contrastLayer}
          onClose={() => {
            setSelectedPlace(null);
            setPanel('search');
            setSnap('peek');
          }}
          onDirections={openDirections}
          onSendToChat={sendPlaceToChat}
          onToggleSave={toggleSave}
          onShare={sharePlace}
          onCreatePost={(place) =>
            navigate(
              '/create?placeName=' +
                encodeURIComponent(place.name) +
                '&lat=' +
                place.latitude +
                '&lng=' +
                place.longitude +
                '&placeId=' +
                encodeURIComponent(canonicalPlaceId(place)),
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
          providerName={transitStatus.providerName}
          authoritative={Boolean(transitStatus.authoritative)}
          staticGtfsAvailable={Boolean(transitStatus.staticGtfs)}
          alerts={stopRoutes.alerts}
          selectedRouteId={selectedTransitRoute?.id ?? null}
          highContrast={contrastLayer}
          onReload={stopRoutes.reload}
          onRouteSelect={(route) => {
            const next =
              selectedTransitRoute?.id === route.id
                ? null
                : route;
            setSelectedTransitRoute(next);
            if (next?.shapeCoordinates?.length) {
              mapRef.current?.fitBounds(
                next.shapeCoordinates,
                {
                  padding: [52, 52],
                  animate: true,
                },
              );
            }
          }}
          onClose={() => {
            setSelectedStop(null);
            setSelectedTransitRoute(null);
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

    if (panel === 'incident' && selectedIncident) {
      return (
        <TrafficIncidentCard
          incident={selectedIncident}
          highContrast={contrastLayer}
          onClose={() => {
            setSelectedIncident(null);
            setPanel('search');
            setSnap('peek');
          }}
          onDirections={(incident) =>
            openDirections({
              id: 'traffic:' + incident.id,
              source: 'traffic',
              name: trafficIncidentLabel(incident),
              latitude: incident.latitude,
              longitude: incident.longitude,
              categoryLabel: 'Yo‘ldagi hodisa',
            } as unknown as MapPlace)
          }
          className="h-full"
        />
      );
    }

    if (panel === 'route') {
      return (
        <div className={cn('flex h-full flex-col', contrastLayer && 'map-imagery-card')}>
          <div
            className={cn(
              'shrink-0 border-b px-3 pb-3 pt-2 backdrop-blur-xl',
              contrastLayer ? 'border-white/[0.10] bg-black/[0.10]' : 'border-border/[0.45] bg-background/[0.35]',
            )}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex min-h-10 items-center gap-2 rounded-2xl border border-border/[0.45] bg-background/[0.55] px-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-success bg-background" />
                  <span className="w-10 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    From
                  </span>
                  {routeEditField === 'origin' ? (
                    <input
                      autoFocus
                      value={routeEditQuery}
                      onChange={(event) => setRouteEditQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setRouteEditField(null);
                          setRouteEditQuery('');
                        }
                      }}
                      placeholder="Boshlanish joyini qidiring"
                      className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setRouteEditField('origin');
                        setRouteEditQuery('');
                      }}
                      className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                    >
                      {routeOrigin?.name || (me ? 'Joriy joylashuv' : 'Xarita markazi')}
                    </button>
                  )}
                </div>
                {routeWaypoints.map((waypoint, index) => {
                  const target = `waypoint:${index}` as RouteEditTarget;
                  const leg = activeRoute?.legs?.[index];
                  return (
                    <div
                      key={'route-waypoint:' + waypoint.id + ':' + index}
                      draggable={!routeEditField}
                      onDragStart={() => setDraggedRouteStopIndex(index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggedRouteStopIndex != null) {
                          reorderRouteStop(draggedRouteStopIndex, index);
                        }
                        setDraggedRouteStopIndex(null);
                      }}
                      onDragEnd={() => setDraggedRouteStopIndex(null)}
                      className={cn(
                        'flex min-h-12 items-center gap-1.5 rounded-2xl border border-border/[0.45] bg-background/[0.55] px-2 transition',
                        draggedRouteStopIndex === index &&
                          'opacity-55 ring-1 ring-border',
                      )}
                    >
                      <span
                        className="hidden cursor-grab touch-none text-muted-foreground md:flex"
                        title="Sudrab tartiblang"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-extrabold text-foreground">
                        {index + 1}
                      </span>
                      <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        To
                      </span>
                      {routeEditField === target ? (
                        <input
                          autoFocus
                          value={routeEditQuery}
                          onChange={(event) =>
                            setRouteEditQuery(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              setRouteEditField(null);
                              setRouteEditQuery('');
                            }
                          }}
                          placeholder="Oraliq manzilni qidiring"
                          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setRouteEditField(target);
                            setRouteEditQuery('');
                          }}
                          className="min-w-0 flex-1 py-1.5 text-left"
                        >
                          <span className="block truncate text-sm font-medium">
                            {waypoint.name}
                          </span>
                          {leg && (
                            <span className="mt-0.5 block text-[10px] text-muted-foreground">
                              {formatMinutes(leg.durationS)} · {formatKm(leg.distanceM)}
                            </span>
                          )}
                        </button>
                      )}
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => reorderRouteStop(index, index - 1)}
                          disabled={index === 0}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-25"
                          aria-label="Manzilni yuqoriga surish"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => reorderRouteStop(index, index + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          aria-label="Manzilni pastga surish"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRouteWaypoint(index)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-destructive"
                          aria-label="Oraliq manzilni olib tashlash"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div
                  draggable={Boolean(destination && !routeEditField)}
                  onDragStart={() =>
                    setDraggedRouteStopIndex(routeWaypoints.length)
                  }
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedRouteStopIndex != null) {
                      reorderRouteStop(
                        draggedRouteStopIndex,
                        routeWaypoints.length,
                      );
                    }
                    setDraggedRouteStopIndex(null);
                  }}
                  onDragEnd={() => setDraggedRouteStopIndex(null)}
                  className={cn(
                    'flex min-h-12 items-center gap-1.5 rounded-2xl border border-border/[0.45] bg-background/[0.55] px-2 transition',
                    draggedRouteStopIndex === routeWaypoints.length &&
                      'opacity-55 ring-1 ring-border',
                  )}
                >
                  {destination && (
                    <span
                      className="hidden cursor-grab touch-none text-muted-foreground md:flex"
                      title="Sudrab tartiblang"
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                  )}
                  <MapPin className="h-4 w-4 shrink-0 text-destructive" />
                  <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    To
                  </span>
                  {routeEditField === 'destination' ? (
                    <input
                      autoFocus
                      value={routeEditQuery}
                      onChange={(event) => setRouteEditQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setRouteEditField(null);
                          setRouteEditQuery('');
                        }
                      }}
                      placeholder="Manzilni qidiring"
                      className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setRouteEditField('destination');
                        setRouteEditQuery('');
                      }}
                      className="min-w-0 flex-1 py-1.5 text-left"
                    >
                      <span className="block truncate text-sm font-semibold">
                        {destination?.name || 'Manzil tanlanmagan'}
                      </span>
                      {destination &&
                        activeRoute?.legs?.[routeWaypoints.length] && (
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {formatMinutes(
                              activeRoute.legs[routeWaypoints.length].durationS,
                            )}{' '}
                            ·{' '}
                            {formatKm(
                              activeRoute.legs[routeWaypoints.length].distanceM,
                            )}
                          </span>
                        )}
                    </button>
                  )}
                  {destination && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      {routeWaypoints.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            reorderRouteStop(
                              routeWaypoints.length,
                              routeWaypoints.length - 1,
                            )
                          }
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          aria-label="Oxirgi manzilni yuqoriga surish"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={removeFinalDestination}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-destructive"
                        aria-label="Oxirgi manzilni olib tashlash"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {routeEditField === 'append' ? (
                  <div className="flex min-h-10 items-center gap-2 rounded-2xl border border-border/[0.45] bg-background/[0.55] px-3">
                    <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="w-10 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      To
                    </span>
                    <input
                      autoFocus
                      value={routeEditQuery}
                      onChange={(event) => setRouteEditQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setRouteEditField(null);
                          setRouteEditQuery('');
                        }
                      }}
                      placeholder="Keyingi manzilni qidiring"
                      className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                ) : (
                  destination &&
                  routeWaypoints.length < 7 && (
                    <button
                      type="button"
                      onClick={() => {
                        setRouteEditField('append');
                        setRouteEditQuery('');
                      }}
                      className="flex min-h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-bold text-foreground transition hover:bg-muted/[0.50]"
                    >
                      <Plus className="h-4 w-4" />
                      Yana manzil qo‘shish
                    </button>
                  )
                )}

                {destination &&
                  routeWaypoints.length >= 2 &&
                  routeMode !== 'transit' && (
                    <button
                      type="button"
                      onClick={() => void optimizeStops()}
                      disabled={routeOptimizing || routeLoading}
                      className="flex min-h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-bold text-muted-foreground transition hover:bg-muted/[0.50] hover:text-foreground disabled:cursor-wait disabled:opacity-50"
                    >
                      {routeOptimizing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      Eng qulay tartib
                    </button>
                  )}
              </div>

              <div className="flex shrink-0 flex-col gap-1.5">
                <button
                  type="button"
                  onClick={swapRouteEndpoints}
                  disabled={!destination}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/[0.45] bg-background/[0.60] text-foreground transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Boshlanish va manzilni almashtirish"
                >
                  <ArrowDownUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={dismissRoute}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/[0.45] bg-background/[0.60] text-muted-foreground transition hover:bg-background hover:text-foreground"
                  aria-label="Yopish"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {routeEditField && (
              <div className="mt-2 overflow-hidden rounded-2xl border border-border/[0.45] bg-background/[0.88] shadow-xl backdrop-blur-2xl">
                {routeEditField === 'origin' && (
                  <button
                    type="button"
                    onClick={useCurrentLocationAsOrigin}
                    className="flex w-full items-center gap-2.5 border-b border-border/[0.40] px-3 py-2.5 text-left text-sm hover:bg-muted/[0.50]"
                  >
                    <Crosshair className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Joriy joylashuv</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => beginMapEndpointPick(routeEditField)}
                  className="flex w-full items-center gap-2.5 border-b border-border/[0.40] px-3 py-2.5 text-left text-sm hover:bg-muted/[0.50]"
                >
                  <MapPinned className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Xaritadan tanlash</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    Nuqtani bosing
                  </span>
                </button>

                {routeEndpointSearch.loading && (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Qidirilmoqda...
                  </div>
                )}

                {!routeEndpointSearch.loading &&
                  routeEditQuery.trim().length >= 2 &&
                  routeEndpointSearch.places.slice(0, 5).map((place) => (
                    <button
                      key={'route-search:' + place.id}
                      type="button"
                      onClick={() => selectRouteEndpoint(place)}
                      className="flex w-full items-start gap-2.5 border-b border-border/[0.35] px-3 py-2.5 text-left last:border-0 hover:bg-muted/[0.50]"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{place.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {place.address || place.categoryLabel || 'Joy'}
                        </span>
                      </span>
                    </button>
                  ))}

                {!routeEndpointSearch.loading &&
                  routeEditQuery.trim().length >= 2 &&
                  routeEndpointSearch.places.length === 0 && (
                    <div className="px-3 py-3 text-xs text-muted-foreground">
                      Joy topilmadi. Boshqacha yozib ko‘ring.
                    </div>
                  )}
              </div>
            )}

            <div className="mt-2.5 grid grid-cols-4 gap-1 rounded-2xl bg-muted/[0.40] p-1">
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
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-background/[0.60] hover:text-foreground',
                    mode.id === 'transit' && !transitRoutingAvailable && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <mode.Icon className="h-4 w-4" />
                  <span className="hidden xl:inline">{mode.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto map-panel-scrollbar px-3 py-3">
            {routeLoading && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Marshrut hisoblanmoqda...
              </div>
            )}

            <div className="space-y-2">
              {routes.map((route, index) => {
                const selected = index === routeIndex;
                return (
                  <button
                    key={route.label + index}
                    type="button"
                    onClick={() => setRouteIndex(index)}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all',
                      selected
                        ? 'border-border bg-muted/[0.60] shadow-sm ring-1 ring-border'
                        : contrastLayer
                          ? 'border-white/[0.10] bg-white/[0.045] hover:bg-white/[0.075]'
                          : 'border-border/[0.50] bg-background/[0.55] hover:border-border hover:bg-muted/[0.45]',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition',
                        selected
                          ? 'bg-foreground text-background'
                          : contrastLayer
                            ? 'bg-white/[0.07] text-white/[0.65]'
                            : 'bg-muted text-muted-foreground group-hover:text-foreground',
                      )}
                    >
                      <Navigation className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="text-base font-extrabold tracking-tight">
                          {formatMinutes(route.durationS)}
                        </p>
                        <span className="text-xs font-medium text-muted-foreground">
                          {formatKm(route.distanceM)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {route.label}
                      </p>
                      {route.trafficProvider && (
                        <p
                          className={cn(
                            'mt-1 text-[10px] font-semibold',
                            route.trafficDelayS
                              ? 'text-orange-500'
                              : 'text-emerald-600 dark:text-emerald-400',
                          )}
                        >
                          {route.trafficDelayS
                            ? '+' +
                              formatMinutes(route.trafficDelayS) +
                              ' tirbandlik' +
                              (route.trafficLengthM
                                ? ' · ' +
                                  formatKm(route.trafficLengthM) +
                                  ' ta’sirlangan'
                                : '')
                            : 'Jonli traffic bo‘yicha'}
                        </p>
                      )}
                      {route.mode === 'transit' && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {(route.transitLegs ?? [])
                            .filter((leg) => leg.mode !== 'walk')
                            .slice(0, 4)
                            .map((leg, legIndex) => (
                              <span
                                key={
                                  (leg.routeId ||
                                    leg.routeRef ||
                                    leg.mode) +
                                  ':' +
                                  legIndex
                                }
                                className="inline-flex h-5 items-center rounded-md px-1.5 text-[10px] font-extrabold text-white"
                                style={{
                                  backgroundColor:
                                    leg.color || '#1E7BC4',
                                }}
                              >
                                {leg.routeRef ||
                                  transitModeLabel(leg.mode)}
                              </span>
                            ))}
                          {route.transitTransfers ? (
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {route.transitTransfers} ta almashish
                            </span>
                          ) : null}
                          {route.transitWalkingDistanceM ? (
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              Piyoda{' '}
                              {formatKm(
                                route.transitWalkingDistanceM,
                              )}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold">{arrivalTime(route.durationS)}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">yetib borish</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {activeRoute?.mode === 'transit' &&
              activeRoute.transitLegs?.length ? (
              <div
                className={cn(
                  'mt-3 overflow-hidden rounded-2xl border',
                  contrastLayer
                    ? 'border-white/[0.10] bg-white/[0.035]'
                    : 'border-border/[0.50] bg-background/[0.55]',
                )}
              >
                <div className="flex items-center justify-between border-b border-border/[0.40] px-3.5 py-3">
                  <div>
                    <p className="text-xs font-extrabold">
                      Safar tafsiloti
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {[
                        formatTransitClock(
                          activeRoute.transitDepartureTime,
                        ),
                        formatTransitClock(
                          activeRoute.transitArrivalTime,
                        ),
                      ]
                        .filter(Boolean)
                        .join(' → ') ||
                        formatMinutes(activeRoute.durationS)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {formatTransitFare(
                      activeRoute.transitFare,
                    ) && (
                      <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold">
                        {formatTransitFare(
                          activeRoute.transitFare,
                        )}
                      </span>
                    )}
                    {activeRoute.transitRealtime && (
                      <span className="rounded-full bg-emerald-500/[0.12] px-2 py-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        real vaqt
                      </span>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-border/[0.35]">
                  {activeRoute.transitLegs.map(
                    (leg, legIndex) => {
                      const isWalk = leg.mode === 'walk';
                      return (
                        <div
                          key={
                            (leg.routeId ||
                              leg.routeRef ||
                              leg.mode) +
                            ':' +
                            legIndex
                          }
                          className="flex items-start gap-3 px-3.5 py-3"
                        >
                          <span
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                              isWalk
                                ? 'bg-muted text-muted-foreground'
                                : 'text-white',
                            )}
                            style={
                              isWalk
                                ? undefined
                                : {
                                    backgroundColor:
                                      leg.color || '#1E7BC4',
                                  }
                            }
                          >
                            {isWalk ? (
                              <PersonStanding className="h-4 w-4" />
                            ) : (
                              <Bus className="h-4 w-4" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-sm font-bold">
                                {isWalk
                                  ? 'Piyoda'
                                  : leg.routeRef ||
                                    transitModeLabel(leg.mode)}
                              </p>
                              {leg.headsign && !isWalk && (
                                <span className="truncate text-[11px] text-muted-foreground">
                                  → {leg.headsign}
                                </span>
                              )}
                            </div>
                            {(leg.from || leg.to) && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {[leg.from, leg.to]
                                  .filter(Boolean)
                                  .join(' → ')}
                              </p>
                            )}
                            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-medium text-muted-foreground">
                              {leg.durationS > 0 && (
                                <span>
                                  {formatMinutes(leg.durationS)}
                                </span>
                              )}
                              {leg.distanceM > 0 && (
                                <span>
                                  {formatKm(leg.distanceM)}
                                </span>
                              )}
                              {leg.waitTimeS ? (
                                <span>
                                  kutish{' '}
                                  {formatMinutes(leg.waitTimeS)}
                                </span>
                              ) : null}
                              {leg.stops ? (
                                <span>{leg.stops} bekat</span>
                              ) : null}
                              {formatTransitClock(
                                leg.departureTime,
                              ) &&
                                formatTransitClock(
                                  leg.arrivalTime,
                                ) && (
                                  <span>
                                    {formatTransitClock(
                                      leg.departureTime,
                                    )}{' '}
                                    →{' '}
                                    {formatTransitClock(
                                      leg.arrivalTime,
                                    )}
                                  </span>
                                )}
                            </div>
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            ) : null}

            {pendingNavigationStart && routeOrigin && (
              <div
                className={cn(
                  'mt-3 rounded-2xl border p-3',
                  contrastLayer
                    ? 'border-amber-300/[0.16] bg-amber-300/[0.07]'
                    : 'border-amber-500/[0.18] bg-amber-500/[0.06]',
                )}
              >
                <p className="text-sm font-extrabold">
                  Siz From nuqtasida emassiz
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {routeOrigin.name} sizdan {formatKm(
                    pendingNavigationStart.originDistanceM,
                  )} uzoqda. Qanday boshlashni tanlang.
                </p>
                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    onClick={() => void confirmNavigationStart('current')}
                    className="flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-extrabold text-primary-foreground"
                  >
                    <Crosshair className="h-4 w-4" />
                    Joriy joylashuvdan boshlash
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmNavigationStart('via-origin')}
                    className={cn(
                      'flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold',
                      contrastLayer
                        ? 'border-white/[0.12] bg-white/[0.04] text-white/[0.78]'
                        : 'border-border/[0.55] bg-background text-foreground',
                    )}
                  >
                    <MapPin className="h-4 w-4" />
                    Avval From nuqtasiga borish
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingNavigationStart(null)}
                    className="h-8 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Faqat marshrutni ko‘rish
                  </button>
                </div>
              </div>
            )}

            {activeRoute &&
              destination &&
              routeMode !== 'transit' &&
              !pendingNavigationStart && (
              <button
                type="button"
                onClick={() => void startNavigation()}
                disabled={locating || navigationActive}
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-70"
              >
                {locating ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Navigation className="h-5 w-5" />
                )}
                Boshlash
                <span className="ml-1 text-xs font-semibold opacity-80">
                  {formatMinutes(activeRoute.durationS)} · {formatKm(activeRoute.distanceM)}
                </span>
              </button>
            )}

            {activeRoute &&
              destination &&
              routeMode === 'car' &&
              routeWaypoints.length === 0 && (
              <TaxiOffersCard
                className="mt-3"
                from={{
                  ...(routeOrigin ?? me ?? center),
                  label:
                    routeOrigin?.name ||
                    (me ? 'Joriy joylashuv' : 'Boshlanish nuqtasi'),
                }}
                to={{
                  latitude: destination.latitude,
                  longitude: destination.longitude,
                  label: destination.name,
                }}
                distanceKm={activeRoute.distanceM / 1000}
                durationMin={activeRoute.durationS / 60}
                highContrast={contrastLayer}
              />
            )}

            {activeRoute && activeRoute.steps.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  Yo‘l bo‘yicha
                </p>
                <div className="space-y-1.5">
                  {activeRoute.steps.map((step, index) => (
                    <div
                      key={index}
                      className={cn(
                        'flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm',
                        contrastLayer ? 'bg-white/[0.035]' : 'bg-muted/[0.30]',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                          contrastLayer
                            ? 'bg-white/[0.07] text-white/[0.60]'
                            : 'bg-background text-muted-foreground',
                        )}
                      >
                        <Navigation className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="leading-snug">{step.instruction}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatKm(step.distanceM)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      );
    }

    if (panel === 'saved') {
      return (
        <div className={cn('flex h-full flex-col', contrastLayer && 'map-imagery-card')}>
          <div
            className={cn(
              'flex shrink-0 items-center gap-2 border-b px-4 py-3',
              contrastLayer ? 'border-white/[0.10] bg-black/[0.10]' : 'border-border/[0.60]',
            )}
          >
            <Bookmark className="h-4 w-4 text-muted-foreground" />
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

          <div className="flex-1 overflow-y-auto map-panel-scrollbar">
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

            <div className="space-y-2 p-3">
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
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition',
                      contrastLayer
                        ? 'border-white/[0.10] bg-white/[0.045] hover:bg-white/[0.075]'
                        : 'border-border/[0.45] bg-background/[0.55] hover:border-border hover:bg-muted/[0.45]',
                    )}
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
        <div className={cn('flex h-full flex-col', contrastLayer && 'map-imagery-card')}>
          <div
            className={cn(
              'flex shrink-0 items-center gap-2 border-b px-4 py-3',
              contrastLayer ? 'border-white/[0.10] bg-black/[0.10]' : 'border-border/[0.60]',
            )}
          >
            <History className="h-4 w-4 text-muted-foreground" />
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

          <div className="flex-1 overflow-y-auto map-panel-scrollbar">
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

            <div className="space-y-2 p-3">
              {visits.visits.map((visit) => {
                const ui = categoryUi(visit.category);
                return (
                  <div
                    key={visit.id}
                    className={cn(
                      'flex items-start gap-3 rounded-2xl border px-3 py-3 transition',
                      contrastLayer
                        ? 'border-white/[0.10] bg-white/[0.045] hover:bg-white/[0.075]'
                        : 'border-border/[0.45] bg-background/[0.55] hover:border-border hover:bg-muted/[0.45]',
                    )}
                  >
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
          className="border-b border-border/[0.60] px-2"
        />
        <div className="min-h-0 flex-1 overflow-y-auto map-panel-scrollbar">
          {!query.trim() && !category ? (
            <MapOverviewPanel
              savedPlaces={saved.places}
              visits={visits.visits}
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
              highContrast={contrastLayer}
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
                  : category
                    ? "Bu hududda mos joy topilmadi. Xaritani surib boshqa hududda tekshirib ko'ring."
                    : 'Kategoriya tanlang yoki qidiruvdan foydalaning.'
              }
              onSelect={selectSearchPlace}
              onDirections={openDirections}
              onSendToChat={sendPlaceToChat}
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
    selectedTransitRoute,
    selectedIncident,
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
    routeWaypoints,
    destination,
    swapRouteEndpoints,
    removeRouteWaypoint,
    removeFinalDestination,
    dismissRoute,
    reorderRouteStop,
    optimizeStops,
    routeOptimizing,
    draggedRouteStopIndex,
    beginMapEndpointPick,
    stopRoutes.realtimeConfigured,
    stopRoutes.realtimeFresh,
    trafficIncidents.incidents,
    routeEditField,
    routeEditQuery,
    routeEndpointSearch.loading,
    routeEndpointSearch.places,
    selectRouteEndpoint,
    useCurrentLocationAsOrigin,
    selectSearchPlace,
    contrastLayer,
    sendPlaceToChat,
    sharePlace,
    startNavigation,
    pendingNavigationStart,
    confirmNavigationStart,
    navigationActive,
    locating,
  ]);

  return (
    <div className={cn('relative h-full min-h-0 w-full overflow-hidden', layer.dark && 'dark')}>
      {effectiveMapEngine === 'vector' ? (
        <VectorMapSurface
          controllerRef={mapRef}
          center={center}
          zoom={navigationActive ? 17 : selectedPlace ? 16 : 14}
          fitTo={fitTo}
          styleUrl={vectorStyleUrl(layerId === 'night')}
          markers={vectorSceneMarkers}
          lines={vectorSceneLines}
          navigationActive={navigationActive}
          navigationBearing={navigation.position?.heading ?? null}
          navigationPitch={48}
          buildings3d
          traffic={trafficProvider.status}
          trafficEnabled={overlays.includes('traffic')}
          trafficStyle={layerId === 'night' ? 'dark' : 'light'}
          trafficRevision={trafficProvider.revision}
          pickMode={Boolean(routeMapPickTarget)}
          referenceCenter={center}
          onViewport={setViewport}
          onMovedCenter={setMovedCenter}
          onMapClick={
            routeMapPickTarget ? handleRouteMapPick : handleMapClick
          }
          onFeatureClick={handleVectorFeatureClick}
          onMarkerClick={handleVectorMarkerClick}
          onManualPan={() => {
            if (navigationActive) setNavigationFollowing(false);
          }}
          onError={handleVectorEngineError}
        />
      ) : (
        <LeafletMapSurface
          controllerRef={mapRef}
          center={center}
          zoom={navigationActive ? 17 : selectedPlace ? 16 : 14}
          fitTo={fitTo}
          layerId={layerId}
          overlays={overlays}
          markers={rasterSceneMarkers}
          lines={vectorSceneLines}
          navigationActive={navigationActive}
          pickMode={Boolean(routeMapPickTarget)}
          referenceCenter={center}
          highContrast={contrastLayer}
          traffic={trafficProvider.status}
          trafficRevision={trafficProvider.revision}
          onViewport={setViewport}
          onMovedCenter={setMovedCenter}
          onMapClick={
            routeMapPickTarget ? handleRouteMapPick : handleMapClick
          }
          onMarkerClick={handleVectorMarkerClick}
          onManualPan={() => {
            if (navigationActive) setNavigationFollowing(false);
          }}
        />
      )}

      {/* Yuqoridagi qidiruv qatori */}
      {!navigationActive && !routeMapPickTarget && (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:left-[404px] md:pt-3">
        <div className="pointer-events-auto mx-auto flex max-w-xl items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <div
              className={cn(
                'flex h-11 w-full items-center gap-2 rounded-[18px] px-3 shadow-xl ring-1 backdrop-blur-2xl transition focus-within:ring-ring/40',
                contrastLayer
                  ? 'map-imagery-search ring-white/[0.15]'
                  : 'bg-background/[0.84] ring-border/[0.45] focus-within:bg-background/[0.94]',
              )}
            >
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onFocus={() => {
                  setSearchFocused(true);
                  setLayerOpen(false);
                }}
                onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCategory(null);
                  setPanel('search');
                  setSearchFocused(true);
                  if (event.target.value.trim()) setSnap('half');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setSearchFocused(false);
                    event.currentTarget.blur();
                  }
                }}
                placeholder="Joy, manzil yoki tashkilot nomi"
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              {query && (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setQuery('');
                    setCategory(null);
                    setPanel('search');
                    setSearchFocused(true);
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                  aria-label="Tozalash"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {search.loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
            </div>

            <MapSearchSuggestions
              query={query}
              places={searchPlacesForDisplay}
              loading={search.loading}
              error={search.error}
              recent={searchHistory.recent}
              visible={searchFocused}
              highContrast={contrastLayer}
              onSelectPlace={selectSearchPlace}
              onSelectCategory={(suggestedCategory) => {
                setCategory(suggestedCategory.id);
                setQuery('');
                setSelectedPlace(null);
                setSelectedStop(null);
                setPanel('search');
                setSnap('half');
                setSearchFocused(false);
                if (suggestedCategory.id === 'bus_stop') {
                  setOverlays((prev) =>
                    prev.includes('stops') ? prev : [...prev, 'stops'],
                  );
                }
              }}
              onSelectRecent={(value) => {
                setQuery(value);
                setCategory(null);
                setPanel('search');
                setSnap('half');
                setSearchFocused(true);
              }}
              onClearRecent={searchHistory.clearRecent}
            />
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
            highContrast={contrastLayer}
            overlayMeta={{
              traffic: {
                available: trafficProvider.status.configured,
                loading: trafficProvider.loading,
                detail: trafficProvider.loading
                  ? 'Tekshirilmoqda…'
                  : trafficProvider.status.configured
                    ? (trafficProvider.status.label || 'Real traffic') +
                      (trafficProvider.status.incidents
                        ? ' · hodisalar'
                        : '')
                    : 'Real traffic provider ulanmagan',
              },
              transit: {
                available: true,
                detail: transitStatus.configured
                  ? transitStatus.authoritative
                    ? (transitStatus.providerName
                        ? transitStatus.providerName + ' · '
                        : '') +
                      (transitStatus.arrivals || transitStatus.vehicles
                        ? 'rasmiy GTFS/GTFS-RT'
                        : 'rasmiy GTFS schedule')
                    : (transitStatus.providerName
                        ? transitStatus.providerName + ' · '
                        : '') +
                      'GTFS manbasi tasdiqlanmagan'
                  : 'OSM transport · GTFS ulanmagan',
              },
            }}
            onToggleOverlay={(id) =>
              setOverlays((prev) =>
                prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
              )
            }
          />
        </div>
      </div>
      )}

      {routeMapPickTarget && !navigationActive && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1300] px-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:left-[404px] md:pt-3">
          <div
            className={cn(
              'pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-[18px] border px-3 py-2.5 shadow-2xl backdrop-blur-2xl',
              contrastLayer
                ? 'border-white/[0.15] bg-slate-950/[0.92] text-white'
                : 'border-border/[0.45] bg-background/[0.94] text-foreground',
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <MapPinned className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">
                {routeMapPickTarget === 'origin'
                  ? 'From nuqtasini tanlang'
                  : 'To nuqtasini tanlang'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Xaritadagi bino, joy yoki istalgan nuqtani bosing
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRouteMapPickTarget(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Xaritadan tanlashni bekor qilish"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {mapClickLoading && !navigationActive && (
        <div className="pointer-events-none absolute inset-x-0 top-[72px] z-[1095] flex justify-center md:left-[404px]">
          <div
            className={cn(
              'flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold shadow-lg backdrop-blur-2xl',
              contrastLayer
                ? 'border-white/[0.14] bg-slate-950/[0.88] text-white'
                : 'border-border/[0.45] bg-background/[0.90] text-foreground',
            )}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            Joy aniqlanmoqda...
          </div>
        </div>
      )}

      {movedCenter && !navigationActive && (
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
            className="pointer-events-auto flex h-9 items-center gap-2 rounded-full border border-border/[0.45] bg-background/[0.82] px-3 text-xs font-semibold shadow-lg backdrop-blur-2xl transition hover:bg-background/[0.95]"
          >
            <Search className="h-3.5 w-3.5 text-foreground" />
            Shu hududda qidirish
          </button>
        </div>
      )}

      {/* O'ng tomondagi tez amallar */}
      {!navigationActive && (
      <div
        className={cn(
          'absolute right-3 z-[1100] flex flex-col gap-1.5 rounded-[18px] border p-1.5 text-foreground shadow-xl backdrop-blur-2xl transition-[bottom] duration-300 md:bottom-auto md:top-1/2 md:-translate-y-1/2',
          contrastLayer
            ? 'map-imagery-controls border-white/[0.15]'
            : 'border-border/[0.35] bg-background/[0.55]',
        )}
        style={isMobile ? { bottom: sheetHeightPx + 16 } : undefined}
      >
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/[0.68] text-foreground transition hover:bg-background/[0.95] hover:shadow-sm"
          aria-label="Yaqinlashtirish"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/[0.68] text-foreground transition hover:bg-background/[0.95] hover:shadow-sm"
          aria-label="Uzoqlashtirish"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={centerOnMe}
          disabled={locating}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl bg-background/[0.68] text-foreground transition hover:bg-background/[0.95] hover:shadow-sm disabled:cursor-wait',
            locating && 'bg-muted text-foreground',
          )}
          aria-label={locating ? 'Joylashuv aniqlanmoqda' : 'Mening joylashuvim'}
        >
          {locating ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Crosshair className="h-5 w-5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setPanel('history');
            setSnap('half');
            void visits.reload();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/[0.68] text-foreground transition hover:bg-background/[0.95] hover:shadow-sm"
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
              ? 'bg-foreground text-background shadow-sm'
              : 'bg-background/[0.68] text-foreground hover:bg-background/[0.95] hover:shadow-sm',
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
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/[0.68] text-foreground transition hover:bg-background/[0.95] hover:shadow-sm"
          aria-label="Saqlangan joylar"
        >
          <Bookmark className="h-5 w-5" />
        </button>
      </div>
      )}

      {navigationActive && destination && (
        <ActiveNavigationPanel
          snapshot={navigation.snapshot}
          position={navigation.position}
          destinationName={destination.name}
          mode={routeMode}
          error={navigation.error}
          highContrast={contrastLayer}
          voiceEnabled={navigationVoice.enabled}
          voiceSupported={navigationVoice.supported}
          onToggleVoice={navigationVoice.toggle}
          following={navigationFollowing}
          nextStopName={nextNavigationStop?.name ?? null}
          nextStopDistanceM={navigation.snapshot.distanceToCheckpointM}
          canSkipNextStop={Boolean(nextNavigationStop?.intermediate)}
          reachedStopName={reachedNavigationStop?.name ?? null}
          onContinueAfterStop={() => setReachedNavigationStop(null)}
          onSkipNextStop={() => void skipNextNavigationStop()}
          onRecenter={() => {
            if (!navigation.position || !mapRef.current) return;
            setNavigationFollowing(true);
            const point = {
              latitude: navigation.position.latitude,
              longitude: navigation.position.longitude,
            };
            setCenter(point);
            mapRef.current.setView(
              [point.latitude, point.longitude],
              Math.max(17, mapRef.current.getZoom()),
              { animate: true },
            );
          }}
          onStop={stopNavigation}
        />
      )}

      {/* Pastdagi suzuvchi panel */}
      {!navigationActive && (
      <MapBottomSheet
        snap={snap}
        onSnapChange={setSnap}
        onHeightChange={setSheetHeightPx}
        className={contrastLayer ? 'map-imagery-panel md:ring-black/[0.10]' : undefined}
      >
        {snap === 'peek' && panel === 'search' ? (
          <button
            type="button"
            onClick={() => setSnap('half')}
            className="flex flex-1 items-center gap-3 px-4 pb-3 text-left md:hidden"
          >
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">Yaqin atrofdagi joylar</span>
            <ChevronDown className="h-4 w-4 rotate-180 text-muted-foreground" />
          </button>
        ) : null}

        <div
          className={cn(
            'h-full min-h-0 flex-1 overflow-hidden',
            snap === 'peek' && panel === 'search' ? 'hidden md:block' : 'block',
          )}
        >
          {panelBody}
        </div>
      </MapBottomSheet>
      )}

    </div>
  );
}
