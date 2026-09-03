import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/db';
import {
  ensureStructuredPostTable,
  isMissingStructuredPostSchemaError,
  writeStructuredPostSchemaCapability,
  writeStructuredPostTableCapability,
} from '@/lib/structuredPostSchema';

export interface PostLocation {
  id: string;
  post_id: string;
  place_id: string | null;
  mode: 'place' | 'live';
  label: string | null;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  live_until: string | null;
  updated_at: string;
  place?: {
    id: string;
    name: string;
    address: string | null;
    category: string | null;
  } | null;
}

export function isLiveActive(location: Pick<PostLocation, 'mode' | 'live_until'>): boolean {
  if (location.mode !== 'live' || !location.live_until) return false;
  return new Date(location.live_until).getTime() > Date.now();
}

/**
 * Post joylashuvini yuklaydi; live rejimda realtime kuzatadi.
 *
 * MUHIM: ilgari bu yerda sessionStorage'dagi "schema capability" bayrog'i
 * o'qishni butunlay to'sib qo'yardi. Bir marta xato bo'lgan sessiyada
 * jadval bor bo'lsa ham joylashuv boshqa yuklanmasdi va foydalanuvchiga
 * matndagi eski "Current location" yorlig'i ko'rinardi. Endi o'qish hech
 * qachon to'silmaydi — bayroq faqat yozib boriladi.
 */

/**
 * Grid/feedlar uchun post locationlarni bitta query bilan yuklaydi.
 * N+1 so'rov yuborilmaydi.
 */
export async function fetchPostLocations(
  postIds: string[],
): Promise<Map<string, PostLocation>> {
  const uniqueIds = Array.from(new Set(postIds.filter(Boolean)));
  const locations = new Map<string, PostLocation>();

  if (uniqueIds.length === 0) return locations;

  const schemaAvailable = await ensureStructuredPostTable(
    'post_locations',
    async () => {
      const { error } = await db.from('post_locations').select('id').limit(1);
      return { error };
    },
  );
  if (!schemaAvailable) return locations;

  try {
    const { data, error } = await db
      .from('post_locations')
      .select('*, place:places(id, name, address, category)')
      .in('post_id', uniqueIds);

    if (error) throw error;

    writeStructuredPostSchemaCapability('available');
    writeStructuredPostTableCapability('post_locations', 'available');
    for (const row of (data ?? []) as PostLocation[]) {
      if (row?.post_id) locations.set(row.post_id, row);
    }
  } catch (error) {
    if (isMissingStructuredPostSchemaError(error)) {
      writeStructuredPostSchemaCapability('missing');
      writeStructuredPostTableCapability('post_locations', 'missing');
    } else {
      console.error('Post joylashuvlarini batch yuklashda xatolik:', error);
    }
  }

  return locations;
}

export function usePostLocation(postId: string | null, enabled = true) {
  const [location, setLocation] = useState<PostLocation | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(postId) && enabled);

  const load = useCallback(async () => {
    if (!postId || !enabled) {
      setLocation(null);
      setIsLoading(false);
      return;
    }

    const schemaAvailable = await ensureStructuredPostTable(
      'post_locations',
      async () => {
        const { error } = await db.from('post_locations').select('id').limit(1);
        return { error };
      },
    );
    if (!schemaAvailable) {
      setLocation(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await db
        .from('post_locations')
        .select('*, place:places(id, name, address, category)')
        .eq('post_id', postId)
        .maybeSingle();

      if (error) throw error;
      writeStructuredPostSchemaCapability('available');
    writeStructuredPostTableCapability('post_locations', 'available');
      setLocation((data as PostLocation) ?? null);
    } catch (error) {
      if (isMissingStructuredPostSchemaError(error)) {
        writeStructuredPostSchemaCapability('missing');
        writeStructuredPostTableCapability('post_locations', 'missing');
      } else {
        console.error('Joylashuvni yuklashda xatolik:', error);
      }
      setLocation(null);
    } finally {
      setIsLoading(false);
    }
  }, [postId, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  // Live joylashuv yangilanishlarini kuzatamiz
  useEffect(() => {
    if (!location || !isLiveActive(location)) return;

    const channel = supabase
      .channel(`post-location-${location.post_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'post_locations',
          filter: `post_id=eq.${location.post_id}`,
        },
        (payload) => {
          setLocation((current) =>
            current ? { ...current, ...(payload.new as Partial<PostLocation>) } : current,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [location?.post_id, location?.mode, location?.live_until]);

  /** Live joylashuvni yangilash (post egasi uchun). */
  const updateLive = useCallback(
    async (latitude: number, longitude: number, accuracyM?: number | null) => {
      if (!location || location.mode !== 'live') return;

      const { error } = await db
        .from('post_locations')
        .update({
          latitude,
          longitude,
          accuracy_m: accuracyM ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', location.id);

      if (error) console.error('Live joylashuv yangilanmadi:', error);
    },
    [location],
  );

  /** Live ulashishni to'xtatish. */
  const stopLive = useCallback(async () => {
    if (!location || location.mode !== 'live') return;

    const { error } = await db
      .from('post_locations')
      .update({ live_until: new Date().toISOString() })
      .eq('id', location.id);

    if (error) {
      console.error('Live to\u2018xtatilmadi:', error);
      return;
    }
    await load();
  }, [location, load]);

  return { location, isLoading, refresh: load, updateLive, stopLive };
}
