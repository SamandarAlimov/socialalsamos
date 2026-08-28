import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/supabaseAny';
import { useAuth } from '@/contexts/AuthContext';

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
  name?: string | null;
  latitude: number;
  longitude: number;
}

/** Bir joyni turli manbalarda bir xil kalit bilan tanib olish. */
export function placeKeyFor(place: PlaceRef): string {
  if (place.id && place.source) return place.source + ':' + place.id;
  return 'geo:' + place.latitude.toFixed(5) + ',' + place.longitude.toFixed(5);
}

export function usePlaceReviews(place: PlaceRef | null) {
  const { user } = useAuth();
  const key = useMemo(() => (place ? placeKeyFor(place) : null), [place]);
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
        .select('id, user_id, place_key, place_name, rating, comment, created_at')
        .eq('place_key', key)
        .order('created_at', { ascending: false })
        .limit(50);

      const rows: PlaceReview[] = data ?? [];
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
  }, [key]);

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
        const { error } = await db.from('place_reviews').upsert(
          {
            user_id: user.id,
            place_key: key,
            place_name: place.name ?? null,
            latitude: place.latitude,
            longitude: place.longitude,
            rating,
            comment: comment.trim() ? comment.trim() : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,place_key' },
        );
        if (error) return false;
        await load();
        return true;
      } catch {
        return false;
      } finally {
        setSaving(false);
      }
    },
    [user, place, key, load],
  );

  const remove = useCallback(async () => {
    if (!user || !key) return;
    await db.from('place_reviews').delete().eq('user_id', user.id).eq('place_key', key);
    await load();
  }, [user, key, load]);

  return { reviews, summary, myReview, loading, saving, submit, remove, reload: load };
}
