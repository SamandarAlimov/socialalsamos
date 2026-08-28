import { useCallback, useEffect, useRef, useState } from 'react';
import { nearbyPlaces, searchPlaces, type GeoPlace } from '@/lib/geocoding';

interface Coords {
  latitude: number;
  longitude: number;
}

/** Joy qidirish (debounce) va atrofdagi joylar ro'yxati. */
export function usePlaceSearch(center: Coords | null) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [nearby, setNearby] = useState<GeoPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchController = useRef<AbortController | null>(null);
  const nearbyController = useRef<AbortController | null>(null);

  // Qidiruv
  useEffect(() => {
    const term = query.trim();

    if (term.length < 2) {
      searchController.current?.abort();
      setResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      searchController.current?.abort();
      const controller = new AbortController();
      searchController.current = controller;

      setIsSearching(true);
      setError(null);

      try {
        const found = await searchPlaces(term, center, controller.signal);
        setResults(found);
      } catch (searchError) {
        if ((searchError as Error).name !== 'AbortError') {
          console.error('Joy qidiruvida xatolik:', searchError);
          setError('Joylarni qidirib bo\u2018lmadi. Internetni tekshiring.');
          setResults([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, center?.latitude, center?.longitude]);

  const loadNearby = useCallback(async () => {
    if (!center) return;

    nearbyController.current?.abort();
    const controller = new AbortController();
    nearbyController.current = controller;

    setIsLoadingNearby(true);
    try {
      const found = await nearbyPlaces(center.latitude, center.longitude, controller.signal);
      setNearby(found);
    } catch (nearbyError) {
      if ((nearbyError as Error).name !== 'AbortError') {
        console.error('Atrofdagi joylarni yuklashda xatolik:', nearbyError);
      }
    } finally {
      setIsLoadingNearby(false);
    }
  }, [center?.latitude, center?.longitude]);

  useEffect(() => {
    loadNearby();
    return () => nearbyController.current?.abort();
  }, [loadNearby]);

  useEffect(() => {
    return () => searchController.current?.abort();
  }, []);

  return {
    query,
    setQuery,
    results,
    nearby,
    isSearching,
    isLoadingNearby,
    error,
    refreshNearby: loadNearby,
  };
}
