/**
 * Slot-aware Supabase session storage.
 *
 * Sessions are shared across *.alsamos.com through cookies, but every linked
 * account gets its own physical key: `<storageKey>.s<slot>`. Switching account
 * therefore means "point the active-slot cookie somewhere else and reload" -
 * no token is ever duplicated into a second store.
 *
 * On hosts that are not *.alsamos.com (local dev, preview URLs) the same
 * layout is used in localStorage.
 */

import { getActiveSlot, storageKeyForSlot } from '@/lib/accountSlots';

/**
 * Cookie values are URI-encoded twice by the legacy format: once before
 * chunking and once by setCookie. A 3500-character chunk can therefore exceed
 * the browser's ~4 KB per-cookie limit after the second encoding. Safari/iOS is
 * particularly strict here and may silently drop/truncate that cookie, leaving
 * Supabase with a malformed session on the next launch.
 *
 * 2000 characters is safely below the limit even in the worst case where every
 * third character is a percent escape. Keep the legacy encoding format so
 * existing valid sessions remain readable; newly refreshed sessions are simply
 * rewritten using smaller chunks.
 */
const CHUNK_SIZE = 2000;
const MAX_CHUNKS = 16;
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const hasWindow = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const isAlsamosHost = () =>
  hasWindow() && window.location.hostname.endsWith('alsamos.com');

/** Physical key for the currently active account slot. */
const physicalKey = (key: string): string =>
  key.match(/\.s\d+$/) ? key : storageKeyForSlot(getActiveSlot(), key);

const cookieOptions = () => {
  const secure = hasWindow() && window.location.protocol === 'https:';
  return ['path=/', 'domain=.alsamos.com', 'SameSite=Lax', secure ? 'Secure' : '']
    .filter(Boolean)
    .join('; ');
};

function safeDecodeURIComponent(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

const setCookie = (name: string, value: string, maxAge: number) => {
  if (!hasWindow()) return;
  try {
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; max-age=${maxAge}; ${cookieOptions()}`;
  } catch {
    // Cookie writes can be denied in restrictive/private browser modes.
  }
};

const getCookie = (name: string): string | undefined => {
  if (!hasWindow()) return undefined;

  try {
    const encodedName = `${encodeURIComponent(name)}=`;
    const value = document.cookie
      .split(';')
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(encodedName))
      ?.slice(encodedName.length);

    if (!value) return undefined;
    return safeDecodeURIComponent(value);
  } catch {
    return undefined;
  }
};

const removeCookie = (name: string) => setCookie(name, '', 0);

function clearCookieSession(scoped: string, count = MAX_CHUNKS): void {
  if (!hasWindow()) return;
  const safeCount = Math.min(MAX_CHUNKS, Math.max(0, Number.isFinite(count) ? count : 0));
  for (let index = 0; index < Math.max(safeCount, MAX_CHUNKS); index += 1) {
    removeCookie(`${scoped}.${index}`);
  }
  removeCookie(`${scoped}.chunks`);
}

function safeLocalGet(scoped: string): string | null {
  if (!hasWindow()) return null;
  try {
    return window.localStorage.getItem(scoped);
  } catch {
    return null;
  }
}

function safeLocalSet(scoped: string, value: string): boolean {
  if (!hasWindow()) return false;
  try {
    window.localStorage.setItem(scoped, value);
    return true;
  } catch {
    return false;
  }
}

function safeLocalRemove(scoped: string): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(scoped);
    window.localStorage.removeItem(`${scoped}.chunks`);
  } catch {
    // Storage is optional in private/restricted browser modes.
  }
}

export const sharedSupabaseStorage = {
  getItem(key: string): string | null {
    if (!hasWindow()) return null;

    const scoped = physicalKey(key);

    if (!isAlsamosHost()) return safeLocalGet(scoped);

    const rawChunkCount = getCookie(`${scoped}.chunks`);
    const chunks = Number(rawChunkCount ?? '0');

    // If cookies are unavailable, use a same-origin local fallback rather than
    // throwing during Supabase bootstrap and leaving the entire app white.
    if (!rawChunkCount) return safeLocalGet(scoped);

    if (!Number.isInteger(chunks) || chunks <= 0 || chunks > MAX_CHUNKS) {
      console.warn('[alsamos] Invalid auth cookie chunk marker; clearing corrupted session.');
      clearCookieSession(scoped, chunks);
      return safeLocalGet(scoped);
    }

    const parts: string[] = [];
    for (let index = 0; index < chunks; index += 1) {
      const part = getCookie(`${scoped}.${index}`);
      if (part === undefined) {
        console.warn('[alsamos] Incomplete auth cookie session; clearing corrupted chunks.');
        clearCookieSession(scoped, chunks);
        return safeLocalGet(scoped);
      }
      parts.push(part);
    }

    const decoded = safeDecodeURIComponent(parts.join(''));
    if (decoded === undefined) {
      console.warn('[alsamos] Malformed auth cookie session; clearing corrupted chunks.');
      clearCookieSession(scoped, chunks);
      return safeLocalGet(scoped);
    }

    return decoded || null;
  },

  setItem(key: string, value: string): void {
    if (!hasWindow()) return;

    const scoped = physicalKey(key);

    if (!isAlsamosHost()) {
      safeLocalSet(scoped, value);
      return;
    }

    const encoded = encodeURIComponent(value);
    const chunks = Math.ceil(encoded.length / CHUNK_SIZE);

    if (!Number.isFinite(chunks) || chunks <= 0 || chunks > MAX_CHUNKS) {
      console.error('[alsamos] Auth session is too large for safe cookie storage.');
      clearCookieSession(scoped);
      // Keep the app usable on this origin instead of crashing at startup.
      safeLocalSet(scoped, value);
      return;
    }

    // Marker last: readers never trust a partially written new chunk count.
    removeCookie(`${scoped}.chunks`);
    for (let index = 0; index < chunks; index += 1) {
      setCookie(
        `${scoped}.${index}`,
        encoded.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
        MAX_AGE,
      );
    }
    for (let index = chunks; index < MAX_CHUNKS; index += 1) {
      removeCookie(`${scoped}.${index}`);
    }
    setCookie(`${scoped}.chunks`, String(chunks), MAX_AGE);

    // Verify that the browser accepted the marker and every chunk. Safari may
    // silently reject oversized/blocked cookies without throwing.
    const acceptedCount = Number(getCookie(`${scoped}.chunks`) ?? '0');
    const accepted =
      acceptedCount === chunks &&
      Array.from({ length: chunks }, (_, index) => getCookie(`${scoped}.${index}`))
        .every((part) => part !== undefined);

    if (!accepted) {
      console.warn('[alsamos] Browser rejected auth cookies; using local fallback for this origin.');
      clearCookieSession(scoped, chunks);
      safeLocalSet(scoped, value);
      return;
    }

    // A valid shared-cookie session is preferable; do not duplicate auth tokens
    // in localStorage when cross-subdomain cookies work normally.
    safeLocalRemove(scoped);
  },

  removeItem(key: string): void {
    if (!hasWindow()) return;

    const scoped = physicalKey(key);

    if (!isAlsamosHost()) {
      safeLocalRemove(scoped);
      return;
    }

    const chunks = Number(getCookie(`${scoped}.chunks`) ?? '0');
    clearCookieSession(scoped, chunks);
    safeLocalRemove(scoped);
  },
};
