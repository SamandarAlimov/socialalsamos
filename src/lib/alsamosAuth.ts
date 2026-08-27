/**
 * Alsamos authentication policy - single source of truth for the client.
 *
 * Model ("Owner identity + linked accounts"):
 *   - You log in with ONE identity email: <name>@alsamos.com
 *   - That identity may own up to 10 superapp accounts (slots 1..10)
 *   - Slot 1 is the primary account and carries the identity password
 *   - Slots 2..10 have a technical login email <username>@accounts.alsamos.com
 *     and no usable password: their sessions are minted by the server only
 *     after the identity password has been verified.
 */

import { supabase } from '@/integrations/supabase/client';

export const ALSAMOS_MAIL_DOMAIN = 'alsamos.com';
export const ALSAMOS_ACCOUNT_DOMAIN = 'accounts.alsamos.com';
export const MAX_ACCOUNTS_PER_IDENTITY = 10;

/** Bump this whenever Terms / Privacy change; stored with the consent. */
export const TOS_VERSION = '2026-08-27';

export const LEGAL_ROUTES = {
  privacy: '/legal/privacy',
  terms: '/legal/terms',
  help: '/help',
} as const;

export function normalizeEmail(value: string): string {
  return (value ?? '').trim().toLowerCase();
}

/** True only for real identity emails (<name>@alsamos.com). */
export function isAlsamosEmail(value: string): boolean {
  return /^[a-z0-9._%+-]{1,64}@alsamos\.com$/.test(normalizeEmail(value));
}

/** Internal address of a linked account - never shown as a login option. */
export function isTechnicalAccountEmail(value: string): boolean {
  return normalizeEmail(value).endsWith(`@${ALSAMOS_ACCOUNT_DOMAIN}`);
}

export function isUsernameValid(value: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test((value ?? '').trim().toLowerCase());
}

/** Accepts "name" or "name@alsamos.com" and always returns the full address. */
export function toIdentityEmail(input: string): string {
  const value = normalizeEmail(input);
  if (!value) return '';
  if (value.includes('@')) return value;
  return `${value}@${ALSAMOS_MAIL_DOMAIN}`;
}

export type PublicAccount = {
  id: string;
  slot_no: number;
  is_primary: boolean;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type LoginStepResult = {
  ticket: string;
  accounts: PublicAccount[];
  identity: {
    email: string;
    migration_status: 'legacy' | 'claimed' | 'migrated';
    used: number;
    max: number;
  };
};

export type AuthErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_DOMAIN_NOT_ALLOWED'
  | 'EMAIL_NOT_CONFIRMED'
  | 'TOO_MANY_ATTEMPTS'
  | 'TICKET_INVALID'
  | 'ACCOUNT_NOT_FOUND'
  | 'ACCOUNT_LIMIT_REACHED'
  | 'USERNAME_INVALID'
  | 'USERNAME_TAKEN'
  | 'PRIMARY_ACCOUNT_PROTECTED'
  | 'UNAUTHORIZED'
  | 'NETWORK'
  | 'UNKNOWN';

export class AlsamosAuthError extends Error {
  code: AuthErrorCode;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AlsamosAuthError';
    this.code = code;
  }
}

/** User-facing messages. Deliberately generic so nothing can be enumerated. */
export function authErrorMessage(code: AuthErrorCode): string {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return 'Email yoki parol xato.';
    case 'EMAIL_DOMAIN_NOT_ALLOWED':
      return `Faqat @${ALSAMOS_MAIL_DOMAIN} manzili bilan kirish mumkin.`;
    case 'EMAIL_NOT_CONFIRMED':
      return 'Email hali tasdiqlanmagan. Pochtangizdagi havolani bosing.';
    case 'TOO_MANY_ATTEMPTS':
      return 'Juda ko\u2018p urinish. 15 daqiqadan keyin qayta urinib ko\u2018ring.';
    case 'TICKET_INVALID':
      return 'Sessiya muddati tugadi. Iltimos, qaytadan kiring.';
    case 'ACCOUNT_LIMIT_REACHED':
      return `Bitta email uchun maksimal ${MAX_ACCOUNTS_PER_IDENTITY} akkaunt ochish mumkin.`;
    case 'USERNAME_INVALID':
      return 'Username 3-30 belgi, faqat a-z, 0-9 va _ bo\u2018lishi kerak.';
    case 'USERNAME_TAKEN':
      return 'Bu username band.';
    case 'PRIMARY_ACCOUNT_PROTECTED':
      return 'Asosiy akkauntni uzib bo\u2018lmaydi.';
    case 'ACCOUNT_NOT_FOUND':
      return 'Akkaunt topilmadi.';
    case 'UNAUTHORIZED':
      return 'Ruxsat yo\u2018q. Qaytadan kiring.';
    case 'NETWORK':
      return 'Tarmoq xatosi. Internetni tekshirib qayta urinib ko\u2018ring.';
    default:
      return 'Kutilmagan xatolik yuz berdi.';
  }
}

async function invokeAuthFunction<T>(
  name: 'account-login' | 'account-session' | 'account-create' | 'account-revoke',
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    // supabase-js wraps non-2xx responses; try to recover our error code.
    let code: AuthErrorCode = 'UNKNOWN';
    const ctx = (error as { context?: Response }).context;

    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = await ctx.json();
        if (typeof payload?.error === 'string') code = payload.error as AuthErrorCode;
      } catch {
        code = 'UNKNOWN';
      }
    }

    throw new AlsamosAuthError(code, authErrorMessage(code));
  }

  if (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)) {
    const code = (data as { error: AuthErrorCode }).error;
    throw new AlsamosAuthError(code, authErrorMessage(code));
  }

  return data as T;
}

/** Step 1: verify identity credentials, get the list of owned accounts. */
export function requestLoginTicket(email: string, password: string) {
  return invokeAuthFunction<LoginStepResult>('account-login', {
    email: toIdentityEmail(email),
    password,
  });
}

/** Step 2: exchange the ticket for a session of the chosen account. */
export function requestAccountSession(ticket: string, accountId?: string) {
  return invokeAuthFunction<{
    token_hash: string;
    slot_no: number;
    account: { id: string; slot_no: number; is_primary: boolean };
  }>('account-session', { ticket, account_id: accountId ?? null });
}

/** Create an additional account (slot 2..10) for the current identity. */
export function requestAccountCreate(params: {
  username: string;
  displayName?: string;
  ticket?: string;
}) {
  return invokeAuthFunction<{
    account: PublicAccount & { user_id: string };
    slot_no: number;
    token_hash: string | null;
  }>('account-create', {
    username: params.username.trim().toLowerCase(),
    display_name: params.displayName ?? null,
    ticket: params.ticket ?? null,
  });
}

/** Revoke an account's sessions server side (and optionally free its slot). */
export function requestAccountRevoke(accountId: string, mode: 'signout' | 'unlink' = 'signout') {
  return invokeAuthFunction<{ ok: true; revoked_tokens: number }>('account-revoke', {
    account_id: accountId,
    mode,
  });
}
