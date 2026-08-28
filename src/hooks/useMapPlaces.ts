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

    fetchPlacesByCategory(categoryId, center, { signal: controller.signal })
      .then((result) => setPlaces(result))
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError('Joylar yuklanmadi. Qayta urinib ko\u2018ring.');
        setPlaces([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
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

    const timer = setTimeout(() => {
      searchMapPlaces(term, center, controller.signal)
        .then((result) => {
          setPlaces(result.places);
          setCategory(result.category);
        })
        .catch((err: Error) => {
          if (err.name === 'AbortError') return;
          setError('Qidiruv ishlamadi. Internetni tekshiring.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, delayMs);

    return () => {
      clearTimeout(timer);
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
export function useStopRoutes(stopId?: string | null) {
  const [routes, setRoutes] = useState<TransitRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!stopId) {
        setRoutes([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const base = await fetchStopRoutes(stopId, { signal });
        const realtime = await fetchRealtimeArrivals(stopId, signal);
        setRoutes(
          realtime
            ? base.map((route) =>
                realtime[route.ref]?.length
                  ? { ...route, nextArrivalsMin: realtime[route.ref], realtime: true }
                  : route,
              )
            : base,
        );
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError('Marshrutlar yuklanmadi.');
        setRoutes([]);
      } finally {
        setLoading(false);
      }
    },
    [stopId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    // Har 30 sekundda yangilanadi - kelish vaqtlari "tirik" bo'lib turadi.
    const timer = setInterval(() => void load(), 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);

  return { routes, loading, error, reload: () => void load() };
}
