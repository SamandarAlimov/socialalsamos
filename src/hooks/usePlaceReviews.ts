import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/supabaseAny';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Joy izohlari va reytingi.
 *
 * `place_reviews` ikki mijoz uchun umumiy. Kanonik shakli
 * `alsamos-superapp/supabase/migrations/20260803020000_social_map_features.sql`
 * ichida, ustun taxalluslari esa `20260831053000_reconcile_map_schema.sql`
 * ichida qo'shilgan. Yozishda e'tibor berilishi kerak bo'lgan joylar:
 *
 * - `place_key` va `comment` - taxallus ustunlar. Trigger ulardan majburiy
 *   `place_id` va `place_name` ni to'ldiradi.
 * - Koordinatalar jadvalda saqlanmaydi. Ular `place_key` ichida kodlangan.
 * - `updated_at` ni klient yozmaydi.
 * - `upsert` kaliti `(user_id, place_key)`, unga to'liq unique indeks kerak:
 *   `20260831061000_place_reviews_upsert_key.sql`.
 */
export interface PlaceReview {
  id: string;
  user_id: string;
  place_key: string;
  place_name: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  author?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface PlaceRef {
  id?: string | null;
  source?: string | null;
  canonicalId?: string | null;
  name?: string | null;
  latitude: number;
  longitude: number;
}

const COLUMNS = 'id, user_id, place_key, place_name, rating, comment, created_at';

/** Bir joyni turli manbalarda bir xil kalit bilan tanib olish. */
export function placeKeyFor(place: PlaceRef): string {
  if (place.canonicalId) return 'alsamos:' + place.canonicalId;
  if (place.id && place.source) return place.source + ':' + place.id;
  return 'geo:' + place.latitude.toFixed(5) + ',' + place.longitude.toFixed(5);
}

function legacyPlaceKeyFor(place: PlaceRef): string {
  if (place.id && place.source) return place.source + ':' + place.id;
  return 'geo:' + place.latitude.toFixed(5) + ',' + place.longitude.toFixed(5);
}

export function usePlaceReviews(place: PlaceRef | null) {
  const { user } = useAuth();
  const key = useMemo(() => (place ? placeKeyFor(place) : null), [place]);
  const keys = useMemo(() => {
    if (!place || !key) return [];
    return Array.from(new Set([key, legacyPlaceKeyFor(place)]));
  }, [place, key]);
  const [reviews, setReviews] = useState<PlaceReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!key) {
      setReviews([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await db
        .from('place_reviews')
        .select(COLUMNS)
        .in('place_key', keys)
        .order('created_at', { ascending: false })
        .limit(50);

      const rawRows: PlaceReview[] = data ?? [];
      const byUser = new Map<string, PlaceReview>();
      for (const row of rawRows) {
        const existing = byUser.get(row.user_id);
        if (
          !existing ||
          row.place_key === key ||
          (existing.place_key !== key &&
            new Date(row.created_at).getTime() >
              new Date(existing.created_at).getTime())
        ) {
          byUser.set(row.user_id, row);
        }
      }
      const rows = Array.from(byUser.values());
      const authorIds = Array.from(new Set(rows.map((row) => row.user_id)));
      if (authorIds.length) {
        const { data: profiles } = await db
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', authorIds);
        const byId = new Map<string, PlaceReview['author']>(
          (profiles ?? []).map((p: { id: string; username: string | null; display_name: string | null; avatar_url: string | null }) => [
            p.id,
            { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url },
          ]),
        );
        setReviews(rows.map((row) => ({ ...row, author: byId.get(row.user_id) })));
      } else {
        setReviews(rows);
      }
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [key, keys]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    if (!reviews.length) return { average: 0, total: 0 };
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return { average: Math.round((sum / reviews.length) * 10) / 10, total: reviews.length };
  }, [reviews]);

  const myReview = useMemo(
    () => (user ? reviews.find((review) => review.user_id === user.id) ?? null : null),
    [reviews, user],
  );

  const submit = useCallback(
    async (rating: number, comment: string) => {
      if (!user || !place || !key) return false;
      setSaving(true);
      try {
        // Faqat haqiqatda mavjud ustunlar. Koordinatalar place_key ichida.
        const payload = {
          user_id: user.id,
          place_key: key,
          place_name: place.name ?? null,
          rating,
          comment: comment.trim() ? comment.trim() : null,
        };

        const existing = reviews.find((review) => review.user_id === user.id);
        const result = existing
          ? await db
              .from('place_reviews')
              .update(payload)
              .eq('id', existing.id)
          : await db.from('place_reviews').upsert(payload, {
              onConflict: 'user_id,place_key',
            });
        if (result.error) return false;
        await load();
        return true;
      } catch {
        return false;
      } finally {
        setSaving(false);
      }
    },
    [user, place, key, reviews, load],
  );

  const remove = useCallback(async () => {
    if (!user || !key) return;
    await db
      .from('place_reviews')
      .delete()
      .eq('user_id', user.id)
      .in('place_key', keys);
    await load();
  }, [user, keys, load]);

  return { reviews, summary, myReview, loading, saving, submit, remove, reload: load };
}
