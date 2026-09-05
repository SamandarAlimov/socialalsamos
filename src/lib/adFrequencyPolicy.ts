const LOCAL_KEY = 'alsamos-ad-frequency-v3';
const SESSION_KEY = 'alsamos-ad-session-v3';
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

const FEED_FIRST_WAIT_MS = 45 * 1000;
const FEED_MIN_GAP_MS = 3 * 60 * 1000;
const FEED_HIDE_COOLDOWN_MS = 20 * 60 * 1000;
const FEED_SESSION_CAP = 2;
const FEED_DAILY_CAP = 5;
const FEED_SAME_AD_GAP_MS = 45 * 60 * 1000;
const FEED_SAME_AD_DAILY_CAP = 2;

const DISCOVER_FIRST_WAIT_MS = 90 * 1000;
const DISCOVER_MIN_GAP_MS = 8 * 60 * 1000;
const DISCOVER_HIDE_COOLDOWN_MS = 30 * 60 * 1000;
const DISCOVER_SESSION_CAP = 1;
const DISCOVER_DAILY_CAP = 2;
const DISCOVER_SAME_AD_DAILY_CAP = 1;

const VIDEO_FIRST_ORGANIC_COUNT = 12;
const VIDEO_FIRST_WAIT_MS = 2 * 60 * 1000;
const VIDEO_MIN_ORGANIC_GAP = 20;
const VIDEO_MIN_TIME_GAP_MS = 8 * 60 * 1000;
const VIDEO_HIDE_COOLDOWN_MS = 30 * 60 * 1000;
const VIDEO_SESSION_CAP = 2;
const VIDEO_DAILY_CAP = 3;
const VIDEO_SAME_AD_DAILY_CAP = 1;

type Surface = 'feed' | 'discover' | 'video';

type Exposure = {
  count: number;
  lastAt: number;
};

type PersistentState = {
  day: string;
  feedImpressions: number;
  discoverImpressions: number;
  videoImpressions: number;
  lastFeedAt: number;
  lastDiscoverAt: number;
  lastVideoAt: number;
  feedSnoozedUntil: number;
  discoverSnoozedUntil: number;
  videoSnoozedUntil: number;
  exposures: Record<string, Exposure>;
};

type SessionState = {
  startedAt: number;
  feedOpportunities: number;
  discoverOpportunities: number;
  feedImpressions: number;
  discoverImpressions: number;
  videoImpressions: number;
  lastVideoIndex: number;
};

function dayKey(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

function emptyPersistent(now: number): PersistentState {
  return {
    day: dayKey(now),
    feedImpressions: 0,
    discoverImpressions: 0,
    videoImpressions: 0,
    lastFeedAt: 0,
    lastDiscoverAt: 0,
    lastVideoAt: 0,
    feedSnoozedUntil: 0,
    discoverSnoozedUntil: 0,
    videoSnoozedUntil: 0,
    exposures: {},
  };
}

function emptySession(now: number): SessionState {
  return {
    startedAt: now,
    feedOpportunities: 0,
    discoverOpportunities: 0,
    feedImpressions: 0,
    discoverImpressions: 0,
    videoImpressions: 0,
    lastVideoIndex: -1,
  };
}

function readJson<T>(storage: Storage | undefined, key: string): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage | undefined, key: string, value: unknown) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Frequency capping is a UX enhancement; storage failures must never break rendering.
  }
}

function getLocalStorage() {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

function getSessionStorage() {
  return typeof window === 'undefined' ? undefined : window.sessionStorage;
}

function loadPersistent(now: number): PersistentState {
  const stored = readJson<PersistentState>(getLocalStorage(), LOCAL_KEY);
  if (!stored || stored.day !== dayKey(now)) {
    const fresh = emptyPersistent(now);
    writeJson(getLocalStorage(), LOCAL_KEY, fresh);
    return fresh;
  }

  return {
    ...emptyPersistent(now),
    ...stored,
    exposures: stored.exposures || {},
  };
}

function savePersistent(state: PersistentState) {
  writeJson(getLocalStorage(), LOCAL_KEY, state);
}

function loadSession(now: number): SessionState {
  const stored = readJson<SessionState>(getSessionStorage(), SESSION_KEY);
  if (!stored || !stored.startedAt || now - stored.startedAt > SESSION_TTL_MS) {
    const fresh = emptySession(now);
    writeJson(getSessionStorage(), SESSION_KEY, fresh);
    return fresh;
  }

  return {
    ...emptySession(stored.startedAt),
    ...stored,
  };
}

function saveSession(state: SessionState) {
  writeJson(getSessionStorage(), SESSION_KEY, state);
}

function exposureKey(surface: Surface, adId: string) {
  return `${surface}:${adId}`;
}

function exposureFor(state: PersistentState, surface: Surface, adId: string) {
  return state.exposures[exposureKey(surface, adId)] || { count: 0, lastAt: 0 };
}

function recordExposure(
  state: PersistentState,
  surface: Surface,
  adId: string,
  now: number,
) {
  const key = exposureKey(surface, adId);
  const current = state.exposures[key] || { count: 0, lastAt: 0 };
  state.exposures[key] = { count: current.count + 1, lastAt: now };
}

/**
 * Home feed does not use a blind "every N posts" rule anymore.
 * The first physical slot is intentionally skipped, then time/session/day caps
 * decide whether a later slot is allowed to become a real impression.
 */
export function registerFeedAdOpportunity(adId: string, now = Date.now()) {
  const session = loadSession(now);
  session.feedOpportunities += 1;
  saveSession(session);

  const persistent = loadPersistent(now);
  const sameAd = exposureFor(persistent, 'feed', adId);

  if (session.feedOpportunities < 2) return false;
  if (now - session.startedAt < FEED_FIRST_WAIT_MS) return false;
  if (session.feedImpressions >= FEED_SESSION_CAP) return false;
  if (persistent.feedImpressions >= FEED_DAILY_CAP) return false;
  if (persistent.feedSnoozedUntil > now) return false;
  if (persistent.lastFeedAt && now - persistent.lastFeedAt < FEED_MIN_GAP_MS) return false;
  if (sameAd.count >= FEED_SAME_AD_DAILY_CAP) return false;
  if (sameAd.lastAt && now - sameAd.lastAt < FEED_SAME_AD_GAP_MS) return false;

  return true;
}

export function recordFeedAdImpression(adId: string, now = Date.now()) {
  const session = loadSession(now);
  session.feedImpressions += 1;
  saveSession(session);

  const persistent = loadPersistent(now);
  persistent.feedImpressions += 1;
  persistent.lastFeedAt = now;
  recordExposure(persistent, 'feed', adId, now);
  savePersistent(persistent);
}

export function snoozeFeedAds(now = Date.now()) {
  const persistent = loadPersistent(now);
  persistent.feedSnoozedUntil = Math.max(
    persistent.feedSnoozedUntil,
    now + FEED_HIDE_COOLDOWN_MS,
  );
  savePersistent(persistent);
}

/**
 * Discover is a high-intent surface, so ad load is intentionally lower than
 * Home: no immediate ad on entry, one impression per session, two per day.
 */
export function registerDiscoverAdOpportunity(adId: string, now = Date.now()) {
  const session = loadSession(now);
  session.discoverOpportunities += 1;
  saveSession(session);

  const persistent = loadPersistent(now);
  const sameAd = exposureFor(persistent, 'discover', adId);

  if (now - session.startedAt < DISCOVER_FIRST_WAIT_MS) return false;
  if (session.discoverImpressions >= DISCOVER_SESSION_CAP) return false;
  if (persistent.discoverImpressions >= DISCOVER_DAILY_CAP) return false;
  if (persistent.discoverSnoozedUntil > now) return false;
  if (persistent.lastDiscoverAt && now - persistent.lastDiscoverAt < DISCOVER_MIN_GAP_MS) return false;
  if (sameAd.count >= DISCOVER_SAME_AD_DAILY_CAP) return false;

  return true;
}

export function recordDiscoverAdImpression(adId: string, now = Date.now()) {
  const session = loadSession(now);
  session.discoverImpressions += 1;
  saveSession(session);

  const persistent = loadPersistent(now);
  persistent.discoverImpressions += 1;
  persistent.lastDiscoverAt = now;
  recordExposure(persistent, 'discover', adId, now);
  savePersistent(persistent);
}

export function snoozeDiscoverAds(now = Date.now()) {
  const persistent = loadPersistent(now);
  persistent.discoverSnoozedUntil = Math.max(
    persistent.discoverSnoozedUntil,
    now + DISCOVER_HIDE_COOLDOWN_MS,
  );
  savePersistent(persistent);
}

/**
 * Reels/video ads are intentionally sparse:
 * - no ad before 12 organic reels and 2 minutes of session time;
 * - at least 20 organic reels AND 8 minutes between impressions;
 * - at most 2 per session, 3 per day;
 * - the same video ad is shown at most once per day;
 * - dismissing an ad creates a 30 minute quiet period.
 */
export function canShowVideoAd(activeIndex: number, adId: string, now = Date.now()) {
  const organicCount = activeIndex + 1;
  const session = loadSession(now);
  const persistent = loadPersistent(now);
  const sameAd = exposureFor(persistent, 'video', adId);

  if (organicCount < VIDEO_FIRST_ORGANIC_COUNT) return false;
  if (now - session.startedAt < VIDEO_FIRST_WAIT_MS) return false;
  if (session.videoImpressions >= VIDEO_SESSION_CAP) return false;
  if (persistent.videoImpressions >= VIDEO_DAILY_CAP) return false;
  if (persistent.videoSnoozedUntil > now) return false;
  if (sameAd.count >= VIDEO_SAME_AD_DAILY_CAP) return false;

  if (session.lastVideoIndex >= 0) {
    if (activeIndex <= session.lastVideoIndex) return false;
    if (activeIndex - session.lastVideoIndex < VIDEO_MIN_ORGANIC_GAP) return false;
  }

  if (persistent.lastVideoAt && now - persistent.lastVideoAt < VIDEO_MIN_TIME_GAP_MS) {
    return false;
  }

  return true;
}

export function recordVideoAdImpression(adId: string, activeIndex: number, now = Date.now()) {
  const session = loadSession(now);
  session.videoImpressions += 1;
  session.lastVideoIndex = activeIndex;
  saveSession(session);

  const persistent = loadPersistent(now);
  persistent.videoImpressions += 1;
  persistent.lastVideoAt = now;
  recordExposure(persistent, 'video', adId, now);
  savePersistent(persistent);
}

export function snoozeVideoAds(now = Date.now()) {
  const persistent = loadPersistent(now);
  persistent.videoSnoozedUntil = Math.max(
    persistent.videoSnoozedUntil,
    now + VIDEO_HIDE_COOLDOWN_MS,
  );
  savePersistent(persistent);
}
