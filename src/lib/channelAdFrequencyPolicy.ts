const LOCAL_KEY = 'alsamos-channel-ad-frequency-v1';
const SESSION_KEY = 'alsamos-channel-ad-session-v1';

const MIN_SESSION_MS = 3 * 60 * 1000;
const MIN_GAP_MS = 10 * 60 * 1000;
const HIDE_COOLDOWN_MS = 60 * 60 * 1000;
const SESSION_CAP = 1;
const DAILY_CAP = 2;
const SAME_AD_DAILY_CAP = 1;

type State = {
  day: string;
  impressions: number;
  lastAt: number;
  snoozedUntil: number;
  ads: Record<string, number>;
};

type Session = {
  startedAt: number;
  impressions: number;
};

function dayKey(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

function readLocal(now: number): State {
  const fallback: State = {
    day: dayKey(now),
    impressions: 0,
    lastAt: 0,
    snoozedUntil: 0,
    ads: {},
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? (JSON.parse(raw) as State) : null;
    if (!parsed || parsed.day !== dayKey(now)) return fallback;
    return { ...fallback, ...parsed, ads: parsed.ads || {} };
  } catch {
    return fallback;
  }
}

function saveLocal(state: State) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  } catch {
    // Ad pacing must never break channel rendering.
  }
}

function readSession(now: number): Session {
  const fallback: Session = { startedAt: now, impressions: 0 };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Session) : null;
    if (!parsed?.startedAt) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(fallback));
      return fallback;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

function saveSession(state: Session) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage restrictions.
  }
}

export function canShowChannelAd(adId: string, now = Date.now()) {
  const state = readLocal(now);
  const session = readSession(now);
  if (now - session.startedAt < MIN_SESSION_MS) return false;
  if (session.impressions >= SESSION_CAP) return false;
  if (state.impressions >= DAILY_CAP) return false;
  if (state.snoozedUntil > now) return false;
  if (state.lastAt && now - state.lastAt < MIN_GAP_MS) return false;
  if ((state.ads[adId] || 0) >= SAME_AD_DAILY_CAP) return false;
  return true;
}

export function recordChannelAdImpression(adId: string, now = Date.now()) {
  const state = readLocal(now);
  state.impressions += 1;
  state.lastAt = now;
  state.ads[adId] = (state.ads[adId] || 0) + 1;
  saveLocal(state);

  const session = readSession(now);
  session.impressions += 1;
  saveSession(session);
}

export function snoozeChannelAds(now = Date.now()) {
  const state = readLocal(now);
  state.snoozedUntil = Math.max(state.snoozedUntil, now + HIDE_COOLDOWN_MS);
  saveLocal(state);
}
