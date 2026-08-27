/**
 * Per-account session slots.
 *
 * Every linked account keeps its OWN Supabase session under its own storage
 * key (`alsamos-auth.s<slot>`). Switching accounts only changes which slot is
 * active - tokens are never copied into a second store, which is what made the
 * old `localStorage['alsamos_accounts']` approach dangerous (a single XSS
 * leaked the refresh tokens of every account at once).
 *
 * Only non-sensitive metadata (slot, username, avatar) is cached for the UI.
 */

import { MAX_ACCOUNTS_PER_IDENTITY } from '@/lib/alsamosAuth';

export const AUTH_STORAGE_KEY = 'alsamos-auth';
export const ACTIVE_SLOT_COOKIE = 'alsamos_active_slot';
export const ACCOUNT_META_KEY = 'alsamos_account_meta';

export const COOKIE_DOMAIN = '.alsamos.com';
const SLOT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type AccountMeta = {
  slot: number;
  accountId: string;
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isPrimary: boolean;
};

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function useCookieDomain(): boolean {
  return hasWindow() && window.location.hostname.endsWith('alsamos.com');
}

function readCookie(name: string): string | null {
  if (!hasWindow()) return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&')}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, maxAge = SLOT_COOKIE_MAX_AGE): void {
  if (!hasWindow()) return;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'path=/',
    `max-age=${maxAge}`,
    'SameSite=Lax',
  ];
  if (useCookieDomain()) parts.push(`domain=${COOKIE_DOMAIN}`);
  if (window.location.protocol === 'https:') parts.push('Secure');
  document.cookie = parts.join('; ');
}

function deleteCookie(name: string): void {
  if (!hasWindow()) return;
  const parts = [`${name}=`, 'path=/', 'max-age=0'];
  if (useCookieDomain()) parts.push(`domain=${COOKIE_DOMAIN}`);
  document.cookie = parts.join('; ');
}

export function isValidSlot(slot: unknown): slot is number {
  return (
    typeof slot === 'number' &&
    Number.isInteger(slot) &&
    slot >= 1 &&
    slot <= MAX_ACCOUNTS_PER_IDENTITY
  );
}

/** Storage key of a given slot; this is what the Supabase client reads. */
export function storageKeyForSlot(slot: number, baseKey = AUTH_STORAGE_KEY): string {
  return `${baseKey}.s${slot}`;
}

export function getActiveSlot(): number {
  const raw = Number.parseInt(readCookie(ACTIVE_SLOT_COOKIE) ?? '', 10);
  return isValidSlot(raw) ? raw : 1;
}

export function setActiveSlot(slot: number): void {
  if (!isValidSlot(slot)) return;
  writeCookie(ACTIVE_SLOT_COOKIE, String(slot));
}

/** Slots that currently hold a stored session on this device. */
export function occupiedSlots(baseKey = AUTH_STORAGE_KEY): number[] {
  if (!hasWindow()) return [];

  const slots: number[] = [];
  for (let slot = 1; slot <= MAX_ACCOUNTS_PER_IDENTITY; slot++) {
    const key = storageKeyForSlot(slot, baseKey);
    const inCookie =
      readCookie(key) !== null || readCookie(`${key}.chunks`) !== null || readCookie(`${key}.0`) !== null;

    let inLocal = false;
    try {
      inLocal =
        window.localStorage.getItem(key) !== null ||
        window.localStorage.getItem(`${key}.chunks`) !== null;
    } catch {
      inLocal = false;
    }

    if (inCookie || inLocal) slots.push(slot);
  }
  return slots;
}

export function hasSessionForSlot(slot: number): boolean {
  return occupiedSlots().includes(slot);
}

/** Remove one slot's stored session (cookie chunks + localStorage fallback). */
export function clearSlot(slot: number, baseKey = AUTH_STORAGE_KEY): void {
  if (!hasWindow() || !isValidSlot(slot)) return;

  const key = storageKeyForSlot(slot, baseKey);
  deleteCookie(key);
  deleteCookie(`${key}.chunks`);
  for (let i = 0; i < 8; i++) deleteCookie(`${key}.${i}`);

  try {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(`${key}.chunks`);
    for (let i = 0; i < 8; i++) window.localStorage.removeItem(`${key}.${i}`);
  } catch {
    /* storage unavailable - nothing to clean */
  }
}

/** Full local wipe: every slot, the active-slot pointer and the UI metadata. */
export function clearAllSlots(baseKey = AUTH_STORAGE_KEY): void {
  for (let slot = 1; slot <= MAX_ACCOUNTS_PER_IDENTITY; slot++) {
    clearSlot(slot, baseKey);
  }
  deleteCookie(ACTIVE_SLOT_COOKIE);
  try {
    window.localStorage.removeItem(ACCOUNT_META_KEY);
    // Legacy keys from the previous multi-account implementation:
    // they used to contain plaintext access/refresh tokens.
    window.localStorage.removeItem('alsamos_accounts');
    window.localStorage.removeItem('alsamos_active_account');
  } catch {
    /* ignore */
  }
}

/**
 * One-time cleanup of the legacy token store. Called on app start so existing
 * devices stop carrying plaintext refresh tokens around.
 */
export function purgeLegacyTokenStore(): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem('alsamos_accounts');
    window.localStorage.removeItem('alsamos_active_account');
  } catch {
    /* ignore */
  }
}

/** Non-sensitive account metadata cache (never contains tokens). */
export function readAccountMeta(): AccountMeta[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(ACCOUNT_META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => isValidSlot(item?.slot));
  } catch {
    return [];
  }
}

export function writeAccountMeta(accounts: AccountMeta[]): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(ACCOUNT_META_KEY, JSON.stringify(accounts));
  } catch {
    /* quota / private mode - metadata cache is optional */
  }
}
