/**
 * Slot-aware Supabase session storage.
 *
 * Sessions are shared across *.alsamos.com through cookies, but every linked
 * account gets its own physical key: `<storageKey>.s<slot>`. Switching account
 * therefore means "point the active-slot cookie somewhere else and reload" -
 * no token is ever duplicated into another store.
 *
 * On hosts that are not *.alsamos.com (local dev, preview URLs) the same
 * layout is used in localStorage.
 */

import { getActiveSlot, storageKeyForSlot } from '@/lib/accountSlots';

const CHUNK_SIZE = 3500;
const MAX_CHUNKS = 8;
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

const setCookie = (name: string, value: string, maxAge: number) => {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; max-age=${maxAge}; ${cookieOptions()}`;
};

const getCookie = (name: string) => {
  const encodedName = `${encodeURIComponent(name)}=`;
  const value = document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(encodedName))
    ?.slice(encodedName.length);
  return value ? decodeURIComponent(value) : undefined;
};

const removeCookie = (name: string) => setCookie(name, '', 0);

export const sharedSupabaseStorage = {
  getItem(key: string): string | null {
    if (!hasWindow()) return null;

    const scoped = physicalKey(key);

    if (!isAlsamosHost()) return localStorage.getItem(scoped);

    const chunks = Number(getCookie(`${scoped}.chunks`) ?? '0');
    if (!chunks) return null;

    const value = Array.from(
      { length: chunks },
      (_, index) => getCookie(`${scoped}.${index}`) ?? '',
    ).join('');

    return value ? decodeURIComponent(value) : null;
  },

  setItem(key: string, value: string): void {
    if (!hasWindow()) return;

    const scoped = physicalKey(key);

    if (!isAlsamosHost()) {
      localStorage.setItem(scoped, value);
      return;
    }

    const encoded = encodeURIComponent(value);
    const chunks = Math.ceil(encoded.length / CHUNK_SIZE);

    for (let index = 0; index < MAX_CHUNKS; index += 1) removeCookie(`${scoped}.${index}`);

    setCookie(`${scoped}.chunks`, String(chunks), MAX_AGE);
    for (let index = 0; index < chunks; index += 1) {
      setCookie(
        `${scoped}.${index}`,
        encoded.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
        MAX_AGE,
      );
    }
  },

  removeItem(key: string): void {
    if (!hasWindow()) return;

    const scoped = physicalKey(key);

    if (!isAlsamosHost()) {
      localStorage.removeItem(scoped);
      localStorage.removeItem(`${scoped}.chunks`);
      return;
    }

    const chunks = Number(getCookie(`${scoped}.chunks`) ?? '0');
    for (let index = 0; index < Math.max(chunks, MAX_CHUNKS); index += 1) {
      removeCookie(`${scoped}.${index}`);
    }
    removeCookie(`${scoped}.chunks`);
  },
};
