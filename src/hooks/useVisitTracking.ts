import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { reverseGeocode } from '@/lib/geocoding';

/**
 * Blink uslubidagi tashrif tarixi: foydalanuvchi qayerga borgani, soat nechida
 * kelgani va qancha turgani avtomatik saqlanadi.
 *
 * Mantiq: joriy joylashuv 120 metrdan uzoqqa siljisa - yangi "lager" ochiladi.
 * Bir joyda 4 daqiqadan ko'p turilsa - tashrif yoziladi, keyin har 2 daqiqada
 * turgan vaqti yangilanadi (yangi qator qo'shilmaydi - RPC birlashtiradi).
 */

const MOVE_THRESHOLD_M = 120;
const MIN_DWELL_MS = 4 * 60 * 1000;
const SYNC_EVERY_MS = 2 * 60 * 1000;
const STORAGE_KEY = 'alsamos_visit_tracking_enabled';

interface Anchor {
  latitude: number;
  longitude: number;
  since: number;
  lastSyncAt: number;
  name?: string | null;
  address?: string | null;
  category?: string | null;
}

function metersBetween(a: Anchor, latitude: number, longitude: number): number {
  const R = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(latitude - a.latitude);
  const dLon = toRad(longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function isVisitTrackingEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) !== 'off';
}

export function setVisitTrackingEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
}

export function useVisitTracking(enabled = true) {
  const { user } = useAuth();
  const anchorRef = useRef<Anchor | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [active, setActive] = useState(false);

  const save = useCallback(async (anchor: Anchor) => {
    const dwellSeconds = Math.round((Date.now() - anchor.since) / 1000);
    try {
      if (!anchor.name) {
        const place = await reverseGeocode(anchor.latitude, anchor.longitude);
        anchor.name = place?.name ?? null;
        anchor.address = place?.address ?? null;
        anchor.category = place?.category ?? null;
      }
      await supabase.rpc('track_place_visit', {
        p_latitude: anchor.latitude,
        p_longitude: anchor.longitude,
        p_name: anchor.name,
        p_address: anchor.address,
        p_category: anchor.category,
        p_dwell_seconds: dwellSeconds,
        p_source: 'auto',
        p_device_id: null,
      });
      anchor.lastSyncAt = Date.now();
      setLastSavedAt(Date.now());
    } catch {
      // Tarmoq yo'q bo'lsa jim o'tib ketamiz - keyingi urinishda yoziladi.
    }
  }, []);

  useEffect(() => {
    if (!enabled || !user || typeof navigator === 'undefined' || !navigator.geolocation) {
      setActive(false);
      return;
    }

    setActive(true);
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const anchor = anchorRef.current;

        if (!anchor || metersBetween(anchor, latitude, longitude) > MOVE_THRESHOLD_M) {
          // Oldingi joydan ketdi - agar yetarli turgan bo'lsa, yakuniy yozuv.
          if (anchor && Date.now() - anchor.since >= MIN_DWELL_MS) void save(anchor);
          anchorRef.current = {
            latitude,
            longitude,
            since: Date.now(),
            lastSyncAt: 0,
          };
          return;
        }

        const stayedMs = Date.now() - anchor.since;
        const sinceSync = Date.now() - anchor.lastSyncAt;
        if (stayedMs >= MIN_DWELL_MS && sinceSync >= SYNC_EVERY_MS) void save(anchor);
      },
      () => setActive(false),
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      const anchor = anchorRef.current;
      if (anchor && Date.now() - anchor.since >= MIN_DWELL_MS) void save(anchor);
      setActive(false);
    };
  }, [enabled, user, save]);

  return { active, lastSavedAt };
}

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

/** Tashriflar tarixi ro'yxati (kunlar bo'yicha guruhlash sahifada bo'ladi). */
export function usePlaceVisits(limit = 100) {
  const { user } = useAuth();
  const [visits, setVisits] = useState<PlaceVisit[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user) {
      setVisits([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('place_visits')
      .select('id, name, address, category, latitude, longitude, arrived_at, left_at, dwell_seconds')
      .order('arrived_at', { ascending: false })
      .limit(limit);
    setVisits((data ?? []) as PlaceVisit[]);
    setLoading(false);
  }, [user, limit]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { visits, loading, reload };
}

export function formatDwell(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '1 daqiqadan kam';
  if (minutes < 60) return minutes + ' daqiqa';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours + ' soat' + (rest ? ' ' + rest + ' daq' : '');
}
