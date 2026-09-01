import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/supabaseAny';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Saqlangan joylar.
 *
 * `saved_places` jadvali ikki mijoz uchun umumiy va uning kanonik shakli
 * `alsamos-superapp/supabase/migrations/20260712200000_map_p0_features.sql`
 * ichida belgilangan. Muhim tafsilotlar:
 *
 * - Izoh ustuni `notes` deb nomlanadi, `note` emas.
 * - Guruhlash asli `list_id` -> `saved_place_lists` orqali. Matnli `collection`
 *   ustuni keyin qo'shildi va trigger uni ro'yxat nomidan to'ldiradi, shuning
 *   uchun ikkala mijoz ham o'zi biladigan nom bilan ishlay oladi.
 * - `place_key` ni klient yozmaydi: uni trigger koordinatalardan hosil qiladi.
 *
 * `external_id` va `external_source` ustunlari mavjud emas. OSM havolasi
 * `place_key` orqali saqlanadi.
 */
export interface SavedPlace {
  id: string;
  name: string;
  address: string | null;
  category: string | null;
  latitude: number;
  longitude: number;
  collection: string;
  notes: string | null;
  listId: string | null;
  isFavorite: boolean;
  created_at: string;
}

export interface SavePlaceInput {
  name: string;
  address?: string | null;
  category?: string | null;
  latitude: number;
  longitude: number;
  notes?: string | null;
  collection?: string;
  isFavorite?: boolean;
  externalId?: string | null;
  externalSource?: string | null;
}

const COLUMNS =
  'id, name, address, category, latitude, longitude, collection, notes, list_id, is_favorite, created_at';

const ROUND = (value: number) => Math.round(value * 100000) / 100000;

function toSavedPlace(row: Record<string, unknown>): SavedPlace {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    address: (row.address as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    collection: String(row.collection ?? 'default'),
    notes: (row.notes as string | null) ?? null,
    listId: (row.list_id as string | null) ?? null,
    isFavorite: Boolean(row.is_favorite),
    created_at: String(row.created_at ?? ''),
  };
}

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
        .select(COLUMNS)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);
      setPlaces(((data ?? []) as Array<Record<string, unknown>>).map(toSavedPlace));
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
          notes: input.notes ?? null,
          is_favorite: input.isFavorite ?? false,
          collection: input.collection ?? 'favorites',
        })
        .select(COLUMNS)
        .single();
      if (data) setPlaces((prev) => [toSavedPlace(data as Record<string, unknown>), ...prev]);
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
