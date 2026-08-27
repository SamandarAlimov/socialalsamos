import { useCallback, useEffect, useRef, useState } from 'react';

export interface LiveLocationSession {
  messageId: string;
  conversationId: string;
  expiresAt: number;
}

interface UseLiveLocationOptions {
  /** Har bir yangi koordinata kelganda chaqiriladi (xabarni yangilash uchun) */
  onUpdate: (
    session: LiveLocationSession,
    coords: { latitude: number; longitude: number; heading?: number | null }
  ) => void | Promise<void>;
  /** Vaqt tugaganda yoki to'xtatilganda chaqiriladi */
  onStop?: (session: LiveLocationSession) => void | Promise<void>;
  /** Yangilash oralig'i (ms). Telegramda ~15 sekund */
  intervalMs?: number;
}

/**
 * Telegramdagi "Jonli joylashuv" (Live Location) mantiqi:
 * - foydalanuvchi 15 daqiqa / 1 soat / 8 soat davomida joylashuvini ulashadi
 * - joylashuv fonda kuzatiladi va xabar yangilanib turadi
 * - vaqt tugasa yoki foydalanuvchi to'xtatsa, kuzatuv o'chadi
 */
export function useLiveLocation({
  onUpdate,
  onStop,
  intervalMs = 15000,
}: UseLiveLocationOptions) {
  const [session, setSession] = useState<LiveLocationSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<LiveLocationSession | null>(null);

  const cleanup = useCallback(() => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(async () => {
    const current = sessionRef.current;
    cleanup();
    sessionRef.current = null;
    setSession(null);
    if (current && onStop) await onStop(current);
  }, [cleanup, onStop]);

  const start = useCallback(
    (params: { messageId: string; conversationId: string; durationSeconds: number }) => {
      if (!('geolocation' in navigator)) {
        setError("Brauzeringiz joylashuvni qo'llab-quvvatlamaydi");
        return;
      }

      cleanup();
      setError(null);

      const newSession: LiveLocationSession = {
        messageId: params.messageId,
        conversationId: params.conversationId,
        expiresAt: Date.now() + params.durationSeconds * 1000,
      };
      sessionRef.current = newSession;
      setSession(newSession);
      lastSentRef.current = 0;

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const active = sessionRef.current;
          if (!active) return;

          const now = Date.now();
          if (now >= active.expiresAt) {
            stop();
            return;
          }
          if (now - lastSentRef.current < intervalMs) return;
          lastSentRef.current = now;

          onUpdate(active, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            heading: position.coords.heading,
          });
        },
        (geoError) => {
          console.error('Live location error:', geoError);
          setError(
            geoError.code === geoError.PERMISSION_DENIED
              ? "Joylashuvga ruxsat berilmadi"
              : "Joylashuvni aniqlab bo'lmadi"
          );
          stop();
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
      );

      expiryTimerRef.current = setTimeout(() => {
        stop();
      }, params.durationSeconds * 1000);
    },
    [cleanup, intervalMs, onUpdate, stop]
  );

  useEffect(() => cleanup, [cleanup]);

  return {
    /** Hozir jonli joylashuv ulashilyaptimi */
    isSharing: session !== null,
    session,
    error,
    start,
    stop,
  };
}

/** Telegramdagi kabi jonli joylashuv muddatlari */
export const LIVE_LOCATION_DURATIONS = [
  { label: '15 daqiqa', seconds: 15 * 60 },
  { label: '1 soat', seconds: 60 * 60 },
  { label: '8 soat', seconds: 8 * 60 * 60 },
];
