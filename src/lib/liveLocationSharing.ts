import { db } from '@/lib/db';

interface ActiveShare {
  watchId: number;
  stopTimer: number;
  liveUntilMs: number;
  lastSentAt: number;
  sending: boolean;
}

const activeShares = new Map<string, ActiveShare>();
const MIN_UPDATE_INTERVAL_MS = 8_000;

function clearShare(postId: string) {
  const active = activeShares.get(postId);
  if (!active) return;

  navigator.geolocation.clearWatch(active.watchId);
  window.clearTimeout(active.stopTimer);
  activeShares.delete(postId);
}

export function stopLiveLocationSharing(postId: string) {
  if (!('geolocation' in navigator)) return;
  clearShare(postId);
}

export function startLiveLocationSharing(postId: string, liveUntil: string | null | undefined) {
  if (!('geolocation' in navigator) || !liveUntil) return false;

  const liveUntilMs = new Date(liveUntil).getTime();
  if (!Number.isFinite(liveUntilMs) || liveUntilMs <= Date.now()) {
    clearShare(postId);
    return false;
  }

  clearShare(postId);

  const share: ActiveShare = {
    watchId: -1,
    stopTimer: window.setTimeout(() => clearShare(postId), Math.max(0, liveUntilMs - Date.now())),
    liveUntilMs,
    lastSentAt: 0,
    sending: false,
  };

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const current = activeShares.get(postId);
      if (!current) return;

      if (Date.now() >= current.liveUntilMs) {
        clearShare(postId);
        return;
      }

      if (current.sending || Date.now() - current.lastSentAt < MIN_UPDATE_INTERVAL_MS) return;

      current.sending = true;
      current.lastSentAt = Date.now();

      void (async () => {
        try {
          const { error } = await db
            .from('post_locations')
            .update({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy_m: position.coords.accuracy ?? null,
              heading: position.coords.heading ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq('post_id', postId)
            .eq('mode', 'live');

          if (error) console.warn('Jonli joylashuvni yangilab bo‘lmadi:', error);
        } finally {
          const latest = activeShares.get(postId);
          if (latest) latest.sending = false;
        }
      })();
    },
    (error) => {
      console.warn('Jonli geolocation watcher xatosi:', error);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 20_000,
    },
  );

  share.watchId = watchId;
  activeShares.set(postId, share);
  return true;
}

export async function resumeMyLiveLocationSharing() {
  if (!('geolocation' in navigator)) return;

  try {
    const { data, error } = await db.rpc('my_active_live_locations');
    if (error) throw error;

    for (const row of Array.isArray(data) ? data : []) {
      if (row?.post_id && row?.live_until) {
        startLiveLocationSharing(String(row.post_id), String(row.live_until));
      }
    }
  } catch (error) {
    // Migration hali deploy bo'lmagan bo'lishi mumkin; boshqa sahifalar buzilmaydi.
    console.warn('Aktiv jonli joylashuvlarni tiklab bo‘lmadi:', error);
  }
}
