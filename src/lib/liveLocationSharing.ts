import { db } from '@/lib/db';

interface ActiveShare {
  watchId: number;
  stopTimer: number;
  liveUntilMs: number;
  lastSentAt: number;
  sending: boolean;
}

interface PersistedShare {
  postId: string;
  liveUntil: string;
}

const activeShares = new Map<string, ActiveShare>();
const MIN_UPDATE_INTERVAL_MS = 8_000;
const LIVE_SHARES_STORAGE_KEY = 'alsamos.live-location.active.v1';

function readPersistedShares(): PersistedShare[] {
  try {
    const raw = localStorage.getItem(LIVE_SHARES_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    return parsed.filter((item): item is PersistedShare => {
      if (!item || typeof item.postId !== 'string' || typeof item.liveUntil !== 'string') {
        return false;
      }
      const until = new Date(item.liveUntil).getTime();
      return Number.isFinite(until) && until > now;
    });
  } catch {
    return [];
  }
}

function writePersistedShares(shares: PersistedShare[]) {
  try {
    if (shares.length === 0) {
      localStorage.removeItem(LIVE_SHARES_STORAGE_KEY);
      return;
    }
    localStorage.setItem(LIVE_SHARES_STORAGE_KEY, JSON.stringify(shares));
  } catch {
    // Live sharing itself can continue even if browser storage is unavailable.
  }
}

function rememberShare(postId: string, liveUntil: string) {
  const shares = readPersistedShares().filter((item) => item.postId !== postId);
  shares.push({ postId, liveUntil });
  writePersistedShares(shares);
}

function forgetShare(postId: string) {
  writePersistedShares(readPersistedShares().filter((item) => item.postId !== postId));
}

function clearShare(postId: string, forget = true) {
  const active = activeShares.get(postId);
  if (active) {
    navigator.geolocation.clearWatch(active.watchId);
    window.clearTimeout(active.stopTimer);
    activeShares.delete(postId);
  }
  if (forget) forgetShare(postId);
}

export function stopLiveLocationSharing(postId: string) {
  if (!('geolocation' in navigator)) {
    forgetShare(postId);
    return;
  }
  clearShare(postId);
}

export function startLiveLocationSharing(postId: string, liveUntil: string | null | undefined) {
  if (!('geolocation' in navigator) || !liveUntil) return false;

  const liveUntilMs = new Date(liveUntil).getTime();
  if (!Number.isFinite(liveUntilMs) || liveUntilMs <= Date.now()) {
    clearShare(postId);
    return false;
  }

  // Existing watcher is replaced, but the persisted session is written again below.
  clearShare(postId, false);

  const share: ActiveShare = {
    watchId: -1,
    stopTimer: window.setTimeout(
      () => clearShare(postId),
      Math.max(0, liveUntilMs - Date.now()),
    ),
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
  rememberShare(postId, liveUntil);
  return true;
}

/**
 * Route reload qilinganda shu brauzerda boshlangan live-location sessiyalarini
 * localStorage'dan tiklaydi. Serverdagi my_active_live_locations RPC'ga startup
 * probe yuborilmaydi: production migration kechiksa foydalanuvchining har bir
 * sahifa ochishida 404/PGRST202 console xatosi paydo bo'lmasin.
 */
export async function resumeMyLiveLocationSharing() {
  if (!('geolocation' in navigator)) return;

  const shares = readPersistedShares();
  writePersistedShares(shares);

  for (const share of shares) {
    startLiveLocationSharing(share.postId, share.liveUntil);
  }
}
