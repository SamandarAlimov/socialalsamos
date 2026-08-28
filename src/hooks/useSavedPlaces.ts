import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/supabaseAny';
import { useAuth } from '@/contexts/AuthContext';

export interface SavedPlace {
  id: string;
  name: string;
  address: string | null;
  category: string | null;
  latitude: number;
  longitude: number;
  collection: string;
  note: string | null;
  created_at: string;
}

export interface SavePlaceInput {
  name: string;
  address?: string | null;
  category?: string | null;
  latitude: number;
  longitude: number;
  externalId?: string | null;
  externalSource?: string | null;
  collection?: string;
}

const ROUND = (value: number) => Math.round(value * 100000) / 100000;

export function useSavedPlaces() {
  const { user } = useAuth();
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setPlaces([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await db
        .from('saved_places')
        .select('id, name, address, category, latitude, longitude, collection, note, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);
      setPlaces(data ?? []);
    } catch {
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const isSaved = useCallback(
    (latitude: number, longitude: number) =>
      places.some(
        (place) =>
          ROUND(place.latitude) === ROUND(latitude) && ROUND(place.longitude) === ROUND(longitude),
      ),
    [places],
  );

  const findSaved = useCallback(
    (latitude: number, longitude: number) =>
      places.find(
        (place) =>
          ROUND(place.latitude) === ROUND(latitude) && ROUND(place.longitude) === ROUND(longitude),
      ) ?? null,
    [places],
  );

  const toggleSave = useCallback(
    async (input: SavePlaceInput) => {
      if (!user) return false;
      const existing = findSaved(input.latitude, input.longitude);
      if (existing) {
        await db.from('saved_places').delete().eq('id', existing.id);
        setPlaces((prev) => prev.filter((place) => place.id !== existing.id));
        return false;
      }
      const { data } = await db
        .from('saved_places')
        .insert({
          user_id: user.id,
          name: input.name,
          address: input.address ?? null,
          category: input.category ?? null,
          latitude: input.latitude,
          longitude: input.longitude,
          external_id: input.externalId ?? null,
          external_source: input.externalSource ?? null,
          collection: input.collection ?? 'favorites',
        })
        .select('id, name, address, category, latitude, longitude, collection, note, created_at')
        .single();
      if (data) setPlaces((prev) => [data, ...prev]);
      return true;
    },
    [user, findSaved],
  );

  const removePlace = useCallback(async (id: string) => {
    await db.from('saved_places').delete().eq('id', id);
    setPlaces((prev) => prev.filter((place) => place.id !== id));
  }, []);

  const collections = Array.from(new Set(places.map((place) => place.collection)));

  return { places, collections, loading, isSaved, findSaved, toggleSave, removePlace, reload: load };
}
