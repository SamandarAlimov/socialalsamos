import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchPlacesByCategory,
  searchMapPlaces,
  type MapPlace,
  type PlaceCategory,
  type PlaceCategoryId,
} from '@/lib/mapPlaces';
import {
  fetchNearbyStops,
  fetchRealtimeArrivals,
  fetchStopRoutes,
  type TransitRoute,
  type TransitStop,
} from '@/lib/transit';
import {
  fetchTransitArrivals,
  fetchTransitRealtimeStatus,
  fetchTransitVehicles,
  type TransitRealtimeStatus,
  type TransitRealtimeVehicle,
} from '@/lib/transitRealtime';

interface Center {
  latitude: number;
  longitude: number;
}

/** Kategoriya filtri (Restoranlar, Zaprovka, Parkovka...). */
export function usePlaceCategory(categoryId: PlaceCategoryId | null, center?: Center | null) {
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!categoryId || !center) {
      setPlaces([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const safetyTimer = window.setTimeout(() => {
      controller.abort();
      setLoading(false);
      setError('Xarita provayderi sekin javob bermoqda. Qayta urinib ko\u2018ring.');
    }, 12500);

    fetchPlacesByCategory(categoryId, center, { signal: controller.signal })
      .then((result) => {
        window.clearTimeout(safetyTimer);
        setPlaces(result);
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        window.clearTimeout(safetyTimer);
        setError('Joylar yuklanmadi. Qayta urinib ko\u2018ring.');
        setPlaces([]);
      })
      .finally(() => setLoading(false));

    return () => {
      window.clearTimeout(safetyTimer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, center?.latitude, center?.longitude]);

  return { places, loading, error };
}

/** Matn bo'yicha aqlli qidiruv (debounce + abort). */
export function usePlaceSearch(query: string, center?: Center | null, delayMs = 320) {
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [category, setCategory] = useState<PlaceCategory | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const term = query.trim();
    controllerRef.current?.abort();

    if (term.length < 2) {
      setPlaces([]);
      setCategory(undefined);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);

    const safetyTimer = window.setTimeout(() => {
      if (controllerRef.current !== controller) return;
      controller.abort();
      setLoading(false);
      setError('Qidiruv provayderi javob bermadi. Qayta urinib ko\u2018ring.');
    }, 9000);

    const timer = window.setTimeout(() => {
      searchMapPlaces(term, center, controller.signal)
        .then((result) => {
          window.clearTimeout(safetyTimer);
          if (controllerRef.current !== controller) return;
          setPlaces(result.places);
          setCategory(result.category);
        })
        .catch((err: Error) => {
          if (err.name === 'AbortError') return;
          window.clearTimeout(safetyTimer);
          if (controllerRef.current !== controller) return;
          setError('Qidiruv ishlamadi. Internetni tekshiring.');
        })
        .finally(() => {
          if (controllerRef.current === controller && !controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(safetyTimer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, center?.latitude, center?.longitude, delayMs]);

  return { places, category, loading, error };
}

/** Atrofdagi bekatlar. */
export function useNearbyStops(center?: Center | null, radiusM = 1500) {
  const [stops, setStops] = useState<TransitStop[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!center) {
      setStops([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetchNearbyStops(center, { radiusM, signal: controller.signal })
      .then(setStops)
      .catch(() => setStops([]))
      .finally(() => setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.latitude, center?.longitude, radiusM]);

  return { stops, loading };
}

/** Bekatga keladigan marshrutlar + real vaqt (mavjud bo'lsa). */
export function useStopRoutes(stop?: TransitStop | null) {
  const [routes, setRoutes] = useState<TransitRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConfigured, setRealtimeConfigured] = useState(false);
  const [realtimeFresh, setRealtimeFresh] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!stop?.id) {
        setRoutes([]);
        setRealtimeFresh(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const base = await fetchStopRoutes(stop.id, { signal });

        // Asosiy realtime manba: server-side GTFS gateway.
        const edgeRealtime = await fetchTransitArrivals({
          stopId: stop.id,
          latitude: stop.latitude,
          longitude: stop.longitude,
        });
        setRealtimeConfigured(Boolean(edgeRealtime?.configured));
        setRealtimeFresh(Boolean(edgeRealtime?.realtime && !edgeRealtime?.stale));

        const byRef = new Map<string, number[]>();
        for (const arrival of edgeRealtime?.arrivals ?? []) {
          if (!arrival.ref || !Number.isFinite(arrival.minutes)) continue;
          const list = byRef.get(arrival.ref) ?? [];
          list.push(arrival.minutes);
          byRef.set(arrival.ref, list.sort((a, b) => a - b));
        }

        // Eski normalized VITE adapteri backward-compatible fallback sifatida qoladi.
        const legacyRealtime =
          byRef.size === 0 ? await fetchRealtimeArrivals(stop.id, signal) : null;

        setRoutes(
          base.map((route) => {
            const arrivals = byRef.get(route.ref) ?? legacyRealtime?.[route.ref] ?? [];
            return arrivals.length
              ? { ...route, nextArrivalsMin: arrivals, realtime: true }
              : route;
          }),
        );
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError('Marshrutlar yuklanmadi.');
        setRoutes([]);
        setRealtimeFresh(false);
      } finally {
        setLoading(false);
      }
    },
    [stop?.id, stop?.latitude, stop?.longitude],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    // GTFS-RT best practice bilan mos: 30 sekundda yangilash.
    const timer = setInterval(() => void load(), 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);

  return {
    routes,
    loading,
    error,
    realtimeConfigured,
    realtimeFresh,
    reload: () => void load(),
  };
}

export function useTransitRealtimeStatus() {
  const [status, setStatus] = useState<TransitRealtimeStatus>({ configured: false });

  useEffect(() => {
    let cancelled = false;
    void fetchTransitRealtimeStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}

export function useTransitVehicles(
  bounds?: { south: number; west: number; north: number; east: number } | null,
  enabled = false,
) {
  const [vehicles, setVehicles] = useState<TransitRealtimeVehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [realtime, setRealtime] = useState(false);

  useEffect(() => {
    if (!enabled || !bounds) {
      setVehicles([]);
      setRealtime(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const result = await fetchTransitVehicles(bounds);
      if (!cancelled) {
        setVehicles(result?.vehicles ?? []);
        setRealtime(Boolean(result?.realtime && !result?.stale));
        setLoading(false);
      }
    };

    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, bounds?.south, bounds?.west, bounds?.north, bounds?.east]);

  return { vehicles, loading, realtime };
}
