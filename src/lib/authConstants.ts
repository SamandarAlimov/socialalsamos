/**
 * Pure auth constants.
 *
 * This module must stay dependency-free: it is imported both by the Supabase
 * client (through the session storage) and by the auth policy helpers, so any
 * import here would create a cycle.
 */

export const ALSAMOS_MAIL_DOMAIN = 'alsamos.com';
export const ALSAMOS_ACCOUNT_DOMAIN = 'accounts.alsamos.com';

/** One identity email may own at most this many superapp accounts. */
export const MAX_ACCOUNTS_PER_IDENTITY = 10;

/** Bump whenever Terms / Privacy change; stored together with the consent. */
export const TOS_VERSION = '2026-08-27';

/** Supabase auth storage key prefix; the active slot is appended (`.s3`). */
export const AUTH_STORAGE_KEY = 'alsamos-auth';
export const ACTIVE_SLOT_COOKIE = 'alsamos_active_slot';
export const ACCOUNT_META_KEY = 'alsamos_account_meta';

/** Legacy keys that used to hold plaintext access/refresh tokens. */
export const LEGACY_TOKEN_KEYS = ['alsamos_accounts', 'alsamos_active_account'] as const;
