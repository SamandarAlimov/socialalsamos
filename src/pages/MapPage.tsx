/**
 * XARITA - premium, professional versiya.
 *
 * Nima o'zgardi (eski versiyadagi muammolar):
 *  - Ustma-ust tushgan IKKITA transport rejimi paneli olib tashlandi; endi
 *    bitta rejim qatori bor.
 *  - Yuqorida qidiruv + kategoriya filtrlari (haqiqiy POI qidiruvi bilan).
 *  - Mobil: Yandex Mapsdagidek bottom-sheet (peek / yarim / to'liq).
 *  - Desktop: chapda suzuvchi panel, o'ngda qatlam almashtirgich va FABlar.
 *  - Joy kartasi: rasm, ish vaqti, manzil, telefon, tablar va amallar.
 *  - Bekatga bosilganda: qaysi avtobuslar, qachon keladi.
 *  - Yo'nalishda: mavjud taksi parklariga buyurtma kartasi.
 *  - Messages / Bozor / Post bilan bog'lanish.
 *  - Tashriflar tarixi avtomatik yoziladi (Blink uslubi).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { toast } from 'sonner';
import {
  Bike,
  Bus,
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  Crosshair,
  Footprints,
  History,
  Loader2,
  Minus,
  Navigation,
  Plus,
  Route as RouteIcon,
  Search,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { reverseGeocode, formatDistance } from '@/lib/geocoding';
import { type MapPlace, type PlaceCategoryId } from '@/lib/mapPlaces';
import { MAP_LAYERS, MAP_OVERLAYS, getLayer, type MapLayerDef, type MapOverlayDef } from '@/lib/mapLayers';
import {
  arrivalTime,
  fetchRoutes,
  formatKm,
  formatMinutes,
  type RouteMode,
  type RouteResult,
} from '@/lib/routing';
import {
  usePlaceCategory,
  usePlaceSearch,
  useNearbyStops,
  useStopRoutes,
} from '@/hooks/useMapPlaces';
import {
  formatDwell,
  isVisitTrackingEnabled,
  setVisitTrackingEnabled,
  usePlaceVisits,
  useVisitTracking,
} from '@/hooks/useVisitTracking';
import { PlaceCategoryBar } from '@/components/map/PlaceCategoryBar';
import { PlaceResultsList } from '@/components/map/PlaceResultsList';
import { PlaceDetailsCard } from '@/components/map/PlaceDetailsCard';
import { BusStopCard } from '@/components/map/BusStopCard';
import { TaxiOffersCard } from '@/components/map/TaxiOffersCard';
import { MapLayerSwitcher } from '@/components/map/MapLayerSwitcher';
import type { TransitStop } from '@/lib/transit';

const DEFAULT_CENTER: [number, number] = [41.311081, 69.240562]; // Toshkent
const DEFAULT_ZOOM = 14;

const MODES: Array<{ id: RouteMode; label: string; icon: typeof Car }> = [
  { id: 'car', label: 'Mashina', icon: Car },
  { id: 'foot', label: 'Piyoda', icon: Footprints },
  { id: 'bike', label: 'Velosiped', icon: Bike },
  { id: 'transit', label: 'Transport', icon: Bus },
];

type SheetState = 'peek' | 'half' | 'full';
type PanelView = 'search' | 'place' | 'route' | 'stop' | 'history';

interface LatLng {
  latitude: number;
  longitude: number;
}

/* ---------------------------------------------------------------- Leaflet */

function pinIcon(emoji: string, active?: boolean): L.DivIcon {
  return L.divIcon({
    className: 'alsamos-pin',
    html:
      '<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center">' +
      '<div style="width:' +
      (active ? '38px' : '30px') +
      ';height:' +
      (active ? '38px' : '30px') +
      ';border-radius:50%;background:' +
      (active ? '#2563eb' : '#ffffff') +
      ';box-shadow:0 3px 10px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;font-size:' +
      (active ? '19px' : '15px') +
      '">' +
      emoji +
      '</div>' +
      '<div style="width:2px;height:8px;background:' +
      (active ? '#2563eb' : 'rgba(0,0,0,.35)') +
      '"></div></div>',
    iconSize: [0, 0],
  });
}

const USER_ICON = L.divIcon({
  className: 'alsamos-user',
  html:
    '<div style="transform:translate(-50%,-50%)">' +
    '<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.22)"></div>' +
    '</div>',
  iconSize: [0, 0],
});

function MapBridge({
  target,
  onMapReady,
  onMapClick,
  onMove,
}: {
  target: { center: [number, number]; zoom?: number } | null;
  onMapReady: (map: L.Map) => void;
  onMapClick: (latlng: LatLng) => void;
  onMove: (center: LatLng) => void;
}) {
  const map = useMap();

  useEffect(() => {
    onMapReady(map);
  }, [map, onMapReady]);

  useEffect(() => {
    if (!target) return;
    map.flyTo(target.center, target.zoom ?? map.getZoom(), { duration: 0.7 });
  }, [map, target]);

  useMapEvents({
    click: (event) => onMapClick({ latitude: event.latlng.lat, longitude: event.latlng.lng }),
    moveend: () => {
      const center = map.getCenter();
      onMove({ latitude: center.lat, longitude: center.lng });
    },
  });

  return null;
}

/* ------------------------------------------------------------------- Page */

export default function MapPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const mapRef = useRef<L.Map | null>(null);
  const [target, setTarget] = useState<{ center: [number, number]; zoom?: number } | null>(null);

  const [userPosition, setUserPosition] = useState<LatLng | null>(null);
  const [center, setCenter] = useState<LatLng>({
    latitude: DEFAULT_CENTER[0],
    longitude: DEFAULT_CENTER[1],
  });

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<PlaceCategoryId | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null);
  const [selectedStop, setSelectedStop] = useState<TransitStop | null>(null);
  const [view, setView] = useState<PanelView>('search');
  const [sheet, setSheet] = useState<SheetState>('peek');

  const [layerId, setLayerId] = useState<MapLayerDef['id']>('map');
  const [layersOpen, setLayersOpen] = useState(false);
  const [overlays, setOverlays] = useState<Record<MapOverlayDef['id'], boolean>>({
    transit: false,
    cycle: false,
    stops: false,
  });

  const [mode, setMode] = useState<RouteMode>('car');
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [routeIndex, setRouteIndex] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const [destination, setDestination] = useState<(LatLng & { name: string }) | null>(null);

  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [trackingOn, setTrackingOn] = useState(isVisitTrackingEnabled());

  const layer = getLayer(layerId);

  /* ---------------------------------------------------- Ma'lumot manbalari */

  const search = usePlaceSearch(query, center);
  const categoryResult = usePlaceCategory(activeCategory, center);
  const showSearchResults = query.trim().length >= 2;
  const results = showSearchResults ? search.places : categoryResult.places;
  const resultsLoading = showSearchResults ? search.loading : categoryResult.loading;
  const resultsError = showSearchResults ? search.error : categoryResult.error;

  const stopsEnabled = overlays.stops || activeCategory === 'bus_stop';
  const { stops } = useNearbyStops(stopsEnabled ? center : null, 2000);
  const stopRoutes = useStopRoutes(selectedStop?.id ?? null);

  useVisitTracking(trackingOn);
  const { visits, loading: visitsLoading, reload: reloadVisits } = usePlaceVisits(60);

  /* ----------------------------------------------------------- Joylashuv */

  const locate = useCallback(
    (fly = true) => {
      if (!navigator.geolocation) {
        toast.error('Brauzer joylashuvni qo\u2018llab-quvvatlamaydi');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const next = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setUserPosition(next);
          setCenter(next);
          if (fly) setTarget({ center: [next.latitude, next.longitude], zoom: 15 });
        },
        () => toast.error('Joylashuvni aniqlash uchun ruxsat bering'),
        { enableHighAccuracy: true, timeout: 15000 },
      );
    },
    [],
  );

  useEffect(() => {
    locate(true);
  }, [locate]);

  /* ------------------------------------------ Saqlangan joylarni yuklash */

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from('saved_places')
        .select('external_id, latitude, longitude')
        .limit(500);
      const ids = new Set<string>();
      for (const row of data ?? []) {
        if (row.external_id) ids.add(row.external_id as string);
      }
      setSavedIds(ids);
    })();
  }, [user]);

  /* --------------------------------- Yo'nalish qurish (URL params bilan) */

  const buildRoute = useCallback(
    async (to: LatLng & { name: string }, routeMode: RouteMode) => {
      const from = userPosition ?? center;
      setRouteLoading(true);
      setDestination(to);
      setView('route');
      setSheet('half');
      try {
        const found = await fetchRoutes(routeMode, from, to);
        setRoutes(found);
        setRouteIndex(0);
        const coords = found[0]?.coordinates ?? [];
        if (coords.length > 1 && mapRef.current) {
          mapRef.current.fitBounds(L.latLngBounds(coords), {
            paddingTopLeft: [40, 120],
            paddingBottomRight: [40, 260],
          });
        }
      } catch {
        setRoutes([]);
        toast.error('Yo\u2018nalish qurilmadi. Keyinroq urinib ko\u2018ring.');
      } finally {
        setRouteLoading(false);
      }
    },
    [userPosition, center],
  );

  useEffect(() => {
    const lat = Number(searchParams.get('destLat'));
    const lng = Number(searchParams.get('destLng'));
    const name = searchParams.get('destName') ?? 'Belgilangan joy';
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (!lat && !lng)) return;
    void buildRoute({ latitude: lat, longitude: lng, name }, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Rejim o'zgarsa - marshrut qayta hisoblanadi (bitta rejim qatori!).
  const changeMode = (nextMode: RouteMode) => {
    setMode(nextMode);
    if (destination) void buildRoute(destination, nextMode);
  };

  /* ------------------------------------------------------------- Amallar */

  const selectPlace = (place: MapPlace) => {
    setSelectedPlace(place);
    setSelectedStop(null);
    setView('place');
    setSheet('half');
    setTarget({ center: [place.latitude, place.longitude], zoom: 16 });
  };

  const selectStop = (stop: TransitStop) => {
    setSelectedStop(stop);
    setSelectedPlace(null);
    setView('stop');
    setSheet('half');
    setTarget({ center: [stop.latitude, stop.longitude], zoom: 16 });
  };

  const handleMapClick = async (latlng: LatLng) => {
    if (layersOpen) {
      setLayersOpen(false);
      return;
    }
    const place = await reverseGeocode(latlng.latitude, latlng.longitude);
    selectPlace({
      id: 'point/' + latlng.latitude.toFixed(5) + ',' + latlng.longitude.toFixed(5),
      source: 'nominatim',
      name: place?.name ?? 'Tanlangan nuqta',
      address: place?.address ?? null,
      latitude: latlng.latitude,
      longitude: latlng.longitude,
      categoryLabel: place?.category ?? null,
    });
  };

  const sendToChat = (place: MapPlace) => {
    const payload =
      '\ud83d\udccd LOCATION:' +
      place.latitude +
      ',' +
      place.longitude +
      '|' +
      (place.name + (place.address ? ', ' + place.address : ''));
    navigate('/messages?share=' + encodeURIComponent(payload));
  };

  const openNearbyListings = (place: MapPlace) => {
    navigate(
      '/marketplace?lat=' +
        place.latitude +
        '&lng=' +
        place.longitude +
        '&near=' +
        encodeURIComponent(place.name),
    );
  };

  const createPostHere = (place: MapPlace) => {
    navigate(
      '/create?placeName=' +
        encodeURIComponent(place.name) +
        '&lat=' +
        place.latitude +
        '&lng=' +
        place.longitude,
    );
  };

  const sharePlace = async (place: MapPlace) => {
    const link =
      window.location.origin +
      '/map?destLat=' +
      place.latitude +
      '&destLng=' +
      place.longitude +
      '&destName=' +
      encodeURIComponent(place.name);
    try {
      if (navigator.share) {
        await navigator.share({ title: place.name, url: link });
      } else {
        await navigator.clipboard.writeText(link);
        toast.success('Havola nusxalandi');
      }
    } catch {
      // foydalanuvchi bekor qildi
    }
  };

  const toggleSave = async (place: MapPlace) => {
    if (!user) {
      toast.error('Saqlash uchun tizimga kiring');
      return;
    }
    if (savedIds.has(place.id)) {
      await supabase.from('saved_places').delete().eq('external_id', place.id);
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(place.id);
        return next;
      });
      toast.success('Saqlanganlardan olindi');
      return;
    }
    const { error } = await supabase.from('saved_places').insert({
      user_id: user.id,
      name: place.name,
      address: place.address ?? null,
      category: place.categoryLabel ?? null,
      latitude: place.latitude,
      longitude: place.longitude,
      external_id: place.id,
      external_source: place.source,
    });
    if (error) {
      toast.error('Saqlanmadi');
      return;
    }
    setSavedIds((prev) => new Set(prev).add(place.id));
    toast.success('Joy saqlandi');
  };

  const clearAll = () => {
    setSelectedPlace(null);
    setSelectedStop(null);
    setDestination(null);
    setRoutes([]);
    setView('search');
    setSheet('peek');
    if (searchParams.get('destLat')) setSearchParams({}, { replace: true });
  };

  const activeRoute = routes[routeIndex] ?? null;

  /* ------------------------------------------------------ Panel tarkibi */

  const panelContent = useMemo(() => {
    if (view === 'history') {
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[15px] font-bold">Tashriflar tarixi</p>
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <input
                type="checkbox"
                checked={trackingOn}
                onChange={(event) => {
                  setTrackingOn(event.target.checked);
                  setVisitTrackingEnabled(event.target.checked);
                }}
                className="h-4 w-4 accent-primary"
              />
              Avtomatik yozish
            </label>
          </div>

          {visitsLoading && visits.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Yuklanmoqda...</span>
            </div>
          ) : visits.length === 0 ? (
            <p className="px-1 py-6 text-center text-[13px] text-muted-foreground">
              Hozircha yozuv yo\u2018q. Joylashuvga ruxsat bersangiz, borgan joylaringiz
              soati va qancha turganingiz bilan avtomatik saqlanadi.
            </p>
          ) : (
            visits.map((visit) => (
              <button
                key={visit.id}
                type="button"
                onClick={() =>
                  setTarget({ center: [visit.latitude, visit.longitude], zoom: 16 })
                }
                className="w-full rounded-2xl bg-card p-3 text-left ring-1 ring-border transition-shadow hover:shadow-md"
              >
                <p className="truncate text-[14px] font-semibold">
                  {visit.name ?? 'Nomsiz joy'}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(visit.arrived_at).toLocaleString('uz-UZ', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="font-medium text-foreground/70">
                    {formatDwell(visit.dwell_seconds)}
                  </span>
                </p>
                {visit.address && (
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{visit.address}</p>
                )}
              </button>
            ))
          )}
        </div>
      );
    }

    if (view === 'stop' && selectedStop) {
      return (
        <BusStopCard
          stop={selectedStop}
          routes={stopRoutes.routes}
          loading={stopRoutes.loading}
          error={stopRoutes.error}
          onReload={stopRoutes.reload}
          onDirections={(stop) =>
            void buildRoute(
              { latitude: stop.latitude, longitude: stop.longitude, name: stop.name },
              'foot',
            )
          }
          onClose={clearAll}
        />
      );
    }

    if (view === 'route' && destination) {
      const from = userPosition ?? center;
      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 px-1">
            <RouteIcon className="mt-0.5 h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold">{destination.name}</p>
              <p className="text-[12px] text-muted-foreground">
                {userPosition ? 'Joriy joylashuvdan' : 'Xarita markazidan'}
              </p>
            </div>
            <button
              type="button"
              onClick={clearAll}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              aria-label="Yopish"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {routeLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Marshrut hisoblanmoqda...</span>
            </div>
          ) : !activeRoute ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              Bu rejim uchun marshrut topilmadi.
            </p>
          ) : (
            <>
              {routes.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide px-1">
                  {routes.map((route, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setRouteIndex(index)}
                      className={cn(
                        'shrink-0 rounded-2xl px-3 py-2 text-left ring-1 transition-colors',
                        index === routeIndex
                          ? 'bg-primary/10 ring-2 ring-primary'
                          : 'bg-muted/40 ring-border hover:bg-muted',
                      )}
                    >
                      <span className="block text-[13px] font-bold">
                        {formatMinutes(route.durationS)}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {formatKm(route.distanceM)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="rounded-2xl bg-primary/10 p-3">
                <p className="text-[17px] font-extrabold text-foreground">
                  {formatMinutes(activeRoute.durationS)}
                  <span className="ml-2 text-[13px] font-medium text-muted-foreground">
                    {formatKm(activeRoute.distanceM)}
                  </span>
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {arrivalTime(activeRoute.durationS)} da yetib borasiz
                </p>
              </div>

              {(mode === 'car' || mode === 'transit') && (
                <TaxiOffersCard
                  from={{ latitude: from.latitude, longitude: from.longitude }}
                  to={{ latitude: destination.latitude, longitude: destination.longitude }}
                  distanceKm={activeRoute.distanceM / 1000}
                  durationMin={activeRoute.durationS / 60}
                />
              )}

              <div className="flex flex-col gap-1.5">
                <p className="px-1 text-[13px] font-bold">
                  Yo\u2018l ko\u2018rsatmalari ({activeRoute.steps.length})
                </p>
                {activeRoute.steps.map((step, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 rounded-2xl bg-muted/40 p-2.5 ring-1 ring-border/60"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background text-[12px] font-bold ring-1 ring-border">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-foreground">{step.instruction}</p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {formatKm(step.distanceM)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      );
    }

    if (view === 'place' && selectedPlace) {
      return (
        <PlaceDetailsCard
          place={selectedPlace}
          saved={savedIds.has(selectedPlace.id)}
          onClose={clearAll}
          onDirections={(place) =>
            void buildRoute(
              { latitude: place.latitude, longitude: place.longitude, name: place.name },
              mode,
            )
          }
          onSendToChat={sendToChat}
          onToggleSave={(place) => void toggleSave(place)}
          onShare={(place) => void sharePlace(place)}
          onNearbyListings={openNearbyListings}
          onCreatePost={createPostHere}
        />
      );
    }

    return (
      <div className="flex flex-col gap-2">
        {stopsEnabled && stops.length > 0 && (
          <div className="mb-1 flex flex-col gap-2">
            <p className="px-1 text-[13px] font-bold">Yaqin bekatlar</p>
            {stops.slice(0, 6).map((stop) => (
              <button
                key={stop.id}
                type="button"
                onClick={() => selectStop(stop)}
                className="flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left ring-1 ring-border transition-shadow hover:shadow-md"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <Bus className="h-4 w-4 text-primary" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{stop.name}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {formatDistance(stop.distanceM)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <PlaceResultsList
          places={results}
          loading={resultsLoading}
          error={resultsError}
          activeId={selectedPlace?.id ?? null}
          emptyText={
            showSearchResults
              ? 'Hech narsa topilmadi. Boshqa yozuv bilan urinib ko\u2018ring.'
              : 'Yuqoridan kategoriya tanlang yoki joy nomini yozing.'
          }
          onSelect={selectPlace}
          onDirections={(place) =>
            void buildRoute(
              { latitude: place.latitude, longitude: place.longitude, name: place.name },
              mode,
            )
          }
          onSendToChat={sendToChat}
          onSave={(place) => void toggleSave(place)}
        />
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    view,
    selectedPlace,
    selectedStop,
    stopRoutes.routes,
    stopRoutes.loading,
    stopRoutes.error,
    destination,
    routes,
    routeIndex,
    routeLoading,
    results,
    resultsLoading,
    resultsError,
    savedIds,
    visits,
    visitsLoading,
    trackingOn,
    stops,
    stopsEnabled,
    mode,
  ]);

  /* ------------------------------------------------------------- Render */

  const sheetHeight =
    sheet === 'peek' ? 'h-[104px]' : sheet === 'half' ? 'h-[52vh]' : 'h-[88vh]';

  return (
    <div className="relative h-[calc(100vh-56px)] w-full overflow-hidden bg-muted md:h-[calc(100vh-0px)]">
      {/* ------------------------------------------------------- Xarita */}
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        zoomControl={false}
        attributionControl={false}
        className="absolute inset-0 z-0 h-full w-full"
      >
        <TileLayer url={layer.url} maxZoom={layer.maxZoom} attribution={layer.attribution} />
        {layer.labelsUrl && <TileLayer url={layer.labelsUrl} maxZoom={layer.maxZoom} />}
        {overlays.transit && MAP_OVERLAYS[0].url && (
          <TileLayer url={MAP_OVERLAYS[0].url} opacity={0.85} />
        )}
        {overlays.cycle && MAP_OVERLAYS[1].url && (
          <TileLayer url={MAP_OVERLAYS[1].url} opacity={0.7} />
        )}

        <MapBridge
          target={target}
          onMapReady={(map) => {
            mapRef.current = map;
          }}
          onMapClick={(latlng) => void handleMapClick(latlng)}
          onMove={setCenter}
        />

        {userPosition && (
          <Marker position={[userPosition.latitude, userPosition.longitude]} icon={USER_ICON} />
        )}

        {results.slice(0, 60).map((place) => (
          <Marker
            key={place.id}
            position={[place.latitude, place.longitude]}
            icon={pinIcon(
              place.categoryId ? categoryEmoji(place.categoryId) : '\ud83d\udccd',
              selectedPlace?.id === place.id,
            )}
            eventHandlers={{ click: () => selectPlace(place) }}
          />
        ))}

        {stopsEnabled &&
          stops.map((stop) => (
            <Marker
              key={stop.id}
              position={[stop.latitude, stop.longitude]}
              icon={pinIcon('\ud83d\ude8f', selectedStop?.id === stop.id)}
              eventHandlers={{ click: () => selectStop(stop) }}
            />
          ))}

        {selectedPlace && !results.some((place) => place.id === selectedPlace.id) && (
          <Marker
            position={[selectedPlace.latitude, selectedPlace.longitude]}
            icon={pinIcon('\ud83d\udccd', true)}
          />
        )}

        {activeRoute && activeRoute.coordinates.length > 1 && (
          <>
            <Polyline positions={activeRoute.coordinates} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9 }} />
            <Polyline positions={activeRoute.coordinates} pathOptions={{ color: '#2563eb', weight: 5 }} />
          </>
        )}
      </MapContainer>

      {/* --------------------------------------- Yuqori: qidiruv + filtr */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-[1000] p-3">
        <div className="pointer-events-auto mx-auto flex max-w-[560px] flex-col gap-2 md:ml-0 md:mr-auto md:max-w-[400px]">
          <div className="flex items-center gap-2 rounded-2xl bg-background/97 px-3 py-2.5 shadow-lg ring-1 ring-border backdrop-blur">
            <Search className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setView('search');
                if (event.target.value.trim().length >= 2) setSheet('half');
              }}
              placeholder="Joy, manzil yoki tashkilot nomi..."
              className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
            />
            {(query || activeCategory) && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setActiveCategory(null);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                aria-label="Tozalash"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <PlaceCategoryBar
            active={activeCategory}
            onSelect={(id) => {
              setActiveCategory(id);
              setQuery('');
              setView('search');
              setSheet(id ? 'half' : 'peek');
            }}
            loading={categoryResult.loading}
            counts={
              activeCategory
                ? ({ [activeCategory]: categoryResult.places.length } as Record<PlaceCategoryId, number>)
                : undefined
            }
          />

          {/* BITTA transport rejimi qatori - endi ustma-ust tushmaydi */}
          {(destination || view === 'route') && (
            <div className="flex items-center gap-1.5 rounded-2xl bg-background/97 p-1.5 shadow-lg ring-1 ring-border backdrop-blur">
              {MODES.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => changeMode(item.id)}
                    className={cn(
                      'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[12.5px] font-semibold transition-colors',
                      mode === item.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------- O'ng: qatlamlar va FABlar */}
      <div className="absolute right-3 top-3 z-[1100] flex flex-col items-end gap-2">
        <MapLayerSwitcher
          open={layersOpen}
          onOpenChange={setLayersOpen}
          layerId={layerId}
          onLayerChange={setLayerId}
          overlays={overlays}
          onToggleOverlay={(id) =>
            setOverlays((prev) => ({ ...prev, [id]: !prev[id] }))
          }
        />
        <button
          type="button"
          onClick={() => {
            setView('history');
            setSheet('half');
            void reloadVisits();
          }}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background/95 text-foreground shadow-lg ring-1 ring-border backdrop-blur transition-colors hover:bg-muted"
          aria-label="Tashriflar tarixi"
        >
          <History className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => locate(true)}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background/95 text-primary shadow-lg ring-1 ring-border backdrop-blur transition-colors hover:bg-muted"
          aria-label="Mening joylashuvim"
        >
          <Crosshair className="h-5 w-5" />
        </button>
        <div className="hidden flex-col overflow-hidden rounded-2xl bg-background/95 shadow-lg ring-1 ring-border backdrop-blur md:flex">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            className="flex h-10 w-11 items-center justify-center transition-colors hover:bg-muted"
            aria-label="Kattalashtirish"
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="h-px bg-border" />
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            className="flex h-10 w-11 items-center justify-center transition-colors hover:bg-muted"
            aria-label="Kichiklashtirish"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ------------------------------------------ Desktop: suzuvchi panel */}
      <div className="absolute bottom-4 left-3 top-[186px] z-[1000] hidden w-[400px] md:block">
        <div className="flex h-full flex-col overflow-hidden rounded-3xl bg-background/97 shadow-2xl ring-1 ring-border backdrop-blur">
          <div className="flex-1 overflow-y-auto p-3">{panelContent}</div>
        </div>
      </div>

      {/* --------------------------------------------- Mobil: bottom-sheet */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 z-[1000] flex flex-col rounded-t-3xl bg-background shadow-[0_-8px_30px_rgba(0,0,0,0.18)] ring-1 ring-border transition-[height] duration-300 md:hidden',
          sheetHeight,
        )}
      >
        <div className="flex items-center justify-center gap-2 py-2">
          <button
            type="button"
            onClick={() =>
              setSheet(sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'peek')
            }
            className="flex items-center gap-2 rounded-full px-4 py-1"
            aria-label="Panelni ochish/yopish"
          >
            <span className="h-1.5 w-10 rounded-full bg-muted-foreground/40" />
            {sheet === 'full' ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </div>

        {sheet === 'peek' ? (
          <div className="flex items-center gap-2 px-3 pb-3">
            <button
              type="button"
              onClick={() => setSheet('half')}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-[13.5px] font-semibold text-primary-foreground"
            >
              <Navigation className="h-4 w-4" />
              {destination ? 'Marshrutni ko\u2018rish' : 'Yaqin joylar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setView('history');
                setSheet('half');
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-muted px-4 py-3 text-[13.5px] font-semibold"
            >
              <History className="h-4 w-4" />
              Tarix
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-3 pb-4">{panelContent}</div>
        )}
      </div>
    </div>
  );
}

function categoryEmoji(categoryId: string): string {
  const map: Record<string, string> = {
    restaurant: '\ud83c\udf7d\ufe0f',
    cafe: '\u2615',
    fast_food: '\ud83c\udf54',
    bakery: '\ud83e\udd50',
    fuel: '\u26fd',
    parking: '\ud83c\udd7f\ufe0f',
    pharmacy: '\ud83d\udc8a',
    hospital: '\ud83c\udfe5',
    atm: '\ud83c\udfe7',
    bank: '\ud83c\udfe6',
    market: '\ud83e\uded1',
    supermarket: '\ud83d\uded2',
    mosque: '\ud83d\udd4c',
    hotel: '\ud83c\udfe8',
    school: '\ud83c\udfeb',
    gym: '\ud83c\udfcb\ufe0f',
    car_wash: '\ud83e\uddfd',
    bus_stop: '\ud83d\ude8f',
  };
  return map[categoryId] ?? '\ud83d\udccd';
}
