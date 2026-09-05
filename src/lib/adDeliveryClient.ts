export type DeliveryPlacement = 'feed' | 'story' | 'video' | 'discover' | 'channel';
export type AdFeedbackType = 'hide' | 'not_relevant' | 'seen_too_often' | 'report';

const SESSION_ID_KEY = 'alsamos-ad-delivery-session-id-v2';
const SESSION_STARTED_KEY = 'alsamos-ad-delivery-session-started-v2';
const LOCAL_STATE_KEY = 'alsamos-ad-delivery-client-v2';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface ExposureState {
  count: number;
  lastAt: number;
}

interface LocalDeliveryState {
  day: string;
  advertisers: Record<string, ExposureState>;
  blockedAds: Record<string, number>;
}

export interface DeliveryCandidate {
  id: string;
  user_id: string;
  bid_amount?: number | null;
  impressions_count?: number | null;
  clicks_count?: number | null;
  created_at?: string | null;
}

function localStorageSafe() {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

function sessionStorageSafe() {
  return typeof window === 'undefined' ? undefined : window.sessionStorage;
}

function today(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function emptyState(now = Date.now()): LocalDeliveryState {
  return { day: today(now), advertisers: {}, blockedAds: {} };
}

function readState(now = Date.now()): LocalDeliveryState {
  const storage = localStorageSafe();
  if (!storage) return emptyState(now);

  try {
    const raw = storage.getItem(LOCAL_STATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as LocalDeliveryState) : null;
    if (!parsed || parsed.day !== today(now)) {
      const fresh = emptyState(now);
      storage.setItem(LOCAL_STATE_KEY, JSON.stringify(fresh));
      return fresh;
    }

    const blockedAds = Object.fromEntries(
      Object.entries(parsed.blockedAds || {}).filter(([, until]) => Number(until) > now),
    );

    return {
      day: parsed.day,
      advertisers: parsed.advertisers || {},
      blockedAds,
    };
  } catch {
    return emptyState(now);
  }
}

function writeState(state: LocalDeliveryState) {
  const storage = localStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
  } catch {
    // Delivery personalization must never break content rendering.
  }
}

export function getAdSessionId() {
  const storage = sessionStorageSafe();
  if (!storage) return 'server';

  let sessionId = storage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    storage.setItem(SESSION_ID_KEY, sessionId);
  }

  if (!storage.getItem(SESSION_STARTED_KEY)) {
    storage.setItem(SESSION_STARTED_KEY, String(Date.now()));
  }

  return sessionId;
}

export function getAdSessionAgeSeconds() {
  const storage = sessionStorageSafe();
  if (!storage) return 0;
  const raw = Number(storage.getItem(SESSION_STARTED_KEY) || Date.now());
  return Math.max(0, Math.floor((Date.now() - raw) / 1000));
}

export function getAdRequestContext(extra: Record<string, unknown> = {}) {
  const timezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      return null;
    }
  })();

  return {
    locale: typeof navigator !== 'undefined' ? navigator.language : null,
    timezone,
    device_type:
      typeof navigator !== 'undefined' && /Mobile|Android|iPhone/i.test(navigator.userAgent)
        ? 'mobile'
        : 'desktop',
    session_age_seconds: getAdSessionAgeSeconds(),
    ...extra,
  };
}

export function createAdEventKey(
  adId: string,
  placement: DeliveryPlacement,
  eventType: string,
  slotKey?: string,
) {
  const nonce = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${placement}:${eventType}:${adId}:${slotKey || 'slot'}:${nonce}`;
}

export function isAdBlockedLocally(adId: string, now = Date.now()) {
  return (readState(now).blockedAds[adId] || 0) > now;
}

export function recordAdFeedbackLocal(
  adId: string,
  feedback: AdFeedbackType,
  now = Date.now(),
) {
  const state = readState(now);
  const ttl =
    feedback === 'report'
      ? 365 * DAY
      : feedback === 'not_relevant'
        ? 30 * DAY
        : feedback === 'seen_too_often'
          ? 7 * DAY
          : DAY;

  state.blockedAds[adId] = Math.max(state.blockedAds[adId] || 0, now + ttl);
  writeState(state);
}

export function recordAdvertiserExposure(
  advertiserId: string | null | undefined,
  now = Date.now(),
) {
  if (!advertiserId) return;
  const state = readState(now);
  const current = state.advertisers[advertiserId] || { count: 0, lastAt: 0 };
  state.advertisers[advertiserId] = {
    count: current.count + 1,
    lastAt: now,
  };
  writeState(state);
}

/**
 * Fallback ranking used while Ads Delivery V2 RPC is unavailable.
 * It deliberately values diversity and fatigue control over raw bid size.
 */
export function rankAdCandidates<T extends DeliveryCandidate>(
  candidates: T[],
  now = Date.now(),
): T[] {
  const state = readState(now);

  return candidates
    .filter((ad) => !isAdBlockedLocally(ad.id, now))
    .map((ad) => {
      const advertiser = state.advertisers[ad.user_id] || { count: 0, lastAt: 0 };
      const impressions = Math.max(0, Number(ad.impressions_count || 0));
      const clicks = Math.max(0, Number(ad.clicks_count || 0));
      const ctr = clicks / Math.max(impressions, 20);
      const bid = Math.max(0.01, Number(ad.bid_amount || 0.01));
      const quality = 1 + Math.min(0.5, ctr * 5);
      const fatigue = 1 / (1 + advertiser.count * 0.8);
      const recentAdvertiserPenalty = advertiser.lastAt && now - advertiser.lastAt < 6 * HOUR ? 0.25 : 1;
      const createdAt = ad.created_at ? new Date(ad.created_at).getTime() : 0;
      const freshness = createdAt && now - createdAt < 7 * DAY ? 1.05 : 1;
      return {
        ad,
        score: Math.log1p(bid * 100) * quality * fatigue * recentAdvertiserPenalty * freshness,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ ad }) => ad);
}
