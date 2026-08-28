import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '@/lib/db';

interface Options {
  /** post_locations qatori identifikatori. */
  locationId: string | null;
  /** Ulashish tugash vaqti (ISO). */
  liveUntil: string | null;
  /** Faqat post egasi uchun yoqiladi. */
  enabled: boolean;
  /** Yangilash oralig‘i (ms). Default: 20 soniya. */
  intervalMs?: number;
}

/**
 * Real vaqtli joylashuvni avtomatik yangilab turadi.
 *
 * `watchPosition` bilan qurilma joylashuvini kuzatadi, lekin bazaga
 * belgilangan oraliqdan tez-tez yozmaydi (trafik va limitlarni tejash uchun).
 * Muddat tugaganda kuzatuv o‘zi to‘xtaydi.
 */
export function useLiveLocationSharing({
  locationId,
  liveUntil,
  enabled,
  intervalMs = 20000,
}: Options) {
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastWriteRef = useRef(0);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsSharing(false);
  }, []);

  /** Ulashishni butunlay yakunlash (live_until = hozir). */
  const endSharing = useCallback(async () => {
    stop();
    if (!locationId) return;

    const { error: updateError } = await db
      .from('post_locations')
      .update({ live_until: new Date().toISOString() })
      .eq('id', locationId);

    if (updateError) {
      console.error('Live ulashishni yakunlashda xatolik:', updateError);
    }
  }, [locationId, stop]);

  useEffect(() => {
    if (!enabled || !locationId || !liveUntil) return;
    if (!('geolocation' in navigator)) {
      setError('Qurilma joylashuvni qo‘llab-quvvatlamaydi');
      return;
    }

    const endsAt = new Date(liveUntil).getTime();
    if (Number.isNaN(endsAt) || endsAt <= Date.now()) return;

    setIsSharing(true);
    setError(null);

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        // Muddat tugagan bo‘lsa to‘xtatamiz
        if (Date.now() >= endsAt) {
          stop();
          return;
        }

        const now = Date.now();
        if (now - lastWriteRef.current < intervalMs) return;
        lastWriteRef.current = now;

        const { error: updateError } = await db
          .from('post_locations')
          .update({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy_m: position.coords.accuracy ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', locationId);

        if (updateError) {
          console.error('Live joylashuv yozilmadi:', updateError);
        }
      },
      (positionError) => {
        setError(
          positionError.code === positionError.PERMISSION_DENIED
            ? 'Joylashuvga ruxsat olib tashlandi'
            : 'Joylashuvni kuzatib bo‘lmadi',
        );
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );

    watchIdRef.current = watchId;

    // Muddat tugaganda avtomatik to‘xtatuvchi taymer
    const stopTimer = setTimeout(stop, Math.max(0, endsAt - Date.now()));

    return () => {
      clearTimeout(stopTimer);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsSharing(false);
    };
  }, [enabled, locationId, liveUntil, intervalMs, stop]);

  return { isSharing, error, endSharing };
}
