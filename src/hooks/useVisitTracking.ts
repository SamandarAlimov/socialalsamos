import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '@/lib/supabaseAny';
import { useAuth } from '@/contexts/AuthContext';
import { reverseGeocode } from '@/lib/geocoding';

/** 120 metrdan uzoqlashsa - yangi joy hisoblanadi. */
const MOVE_THRESHOLD_M = 120;
/** 4 daqiqadan ko'p turilsa - tashrif sifatida yozamiz. */
const MIN_DWELL_MS = 4 * 60 * 1000;
/** Turgan vaqtini har 2 daqiqada yangilaymiz. */
const SYNC_EVERY_MS = 2 * 60 * 1000;

export const STORAGE_KEY = 'alsamos_visit_tracking_enabled';

export interface PlaceVisit {
  id: string;
  name: string | null;
  address: string | null;
  category: string | null;
  latitude: number;
  longitude: number;
  arrived_at: string;
  left_at: string | null;
  dwell_seconds: number;
}

export function isVisitTrackingEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) !== '0';
}

export function setVisitTrackingEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
}

function metersBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function deviceId(): string {
  if (typeof window === 'undefined') return 'server';
  const key = 'alsamos_device_id';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    window.localStorage.setItem(key, id);
  }
  return id;
}

/**
 * Blink uslubidagi tashrif kuzatuvi: qayerda bo'ldingiz, soat nechida,
 * qancha turdingiz. Faqat foydalanuvchi ruxsat bergan holda ishlaydi.
 */
export function useVisitTracking(enabled = true) {
  const { user } = useAuth();
  const anchorRef = useRef<{ latitude: number; longitude: number; since: number } | null>(null);
  const syncedRef = useRef(0);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');

  const write = useCallback(
    async (
      point: { latitude: number; longitude: number },
      dwellSeconds: number,
    ) => {
      if (!user) return;
      let name: string | null = null;
      let address: string | null = null;
      try {
        const place = await reverseGeocode(point.latitude, point.longitude);
        name = place?.name ?? null;
        address = place?.address ?? null;
      } catch {
        // nomni aniqlab bo'lmadi - koordinata bilan yozamiz
      }
      try {
        await db.rpc('track_place_visit', {
          p_latitude: point.latitude,
          p_longitude: point.longitude,
          p_name: name,
          p_address: address,
          p_category: null,
          p_dwell_seconds: Math.round(dwellSeconds),
          p_source: 'auto',
          p_device_id: deviceId(),
        });
      } catch {
        // jimgina o'tkazib yuboramiz - tarix keyingi urinishda yozliadi
      }
    },
    [user],
  );

  useEffect(() => {
    if (!enabled || !user || typeof navigator === 'undefined' || !navigator.geolocation) return;
    if (!isVisitTrackingEnabled()) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setPermission('granted');
        const point = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        const now = Date.now();
        const anchor = anchorRef.current;

        if (!anchor) {
          anchorRef.current = { ...point, since: now };
          syncedRef.current = 0;
          return;
        }

        const moved = metersBetween(anchor, point);
        if (moved > MOVE_THRESHOLD_M) {
          const dwell = now - anchor.since;
          if (dwell >= MIN_DWELL_MS) {
            void write({ latitude: anchor.latitude, longitude: anchor.longitude }, dwell / 1000);
          }
          anchorRef.current = { ...point, since: now };
          syncedRef.current = 0;
          return;
        }

        const dwell = now - anchor.since;
        if (dwell >= MIN_DWELL_MS && now - syncedRef.current > SYNC_EVERY_MS) {
          syncedRef.current = now;
          void write({ latitude: anchor.latitude, longitude: anchor.longitude }, dwell / 1000);
        }
      },
      () => setPermission('denied'),
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, user, write]);

  return { permission };
}

export function usePlaceVisits(limit = 100) {
  const { user } = useAuth();
  const [visits, setVisits] = useState<PlaceVisit[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setVisits([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await db
        .from('place_visits')
        .select('id, name, address, category, latitude, longitude, arrived_at, left_at, dwell_seconds')
        .eq('user_id', user.id)
        .order('arrived_at', { ascending: false })
        .limit(limit);
      setVisits(data ?? []);
    } catch {
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [user, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const removeVisit = useCallback(async (id: string) => {
    await db.from('place_visits').delete().eq('id', id);
    setVisits((prev) => prev.filter((visit) => visit.id !== id));
  }, []);

  return { visits, loading, reload: load, removeVisit };
}

export function formatDwell(seconds: number): string {
  if (!seconds || seconds < 60) return '1 daqiqadan kam';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + ' daqiqa';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? hours + ' soat ' + rest + ' daqiqa' : hours + ' soat';
}
