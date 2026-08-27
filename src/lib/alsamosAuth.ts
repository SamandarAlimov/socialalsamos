/**
 * Alsamos authentication policy - single source of truth for the client.
 *
 * Model ("Owner identity + linked accounts"):
 *   - One identity email <name>@alsamos.com owns up to 10 superapp accounts.
 *   - Slot 1 is the primary account and carries the identity password.
 *   - Slots 2..10 use a technical login email <username>@accounts.alsamos.com
 *     and have no usable password: their sessions are minted by the server
 *     only after the identity password has been verified.
 *
 * Logging in accepts THREE kinds of identifier (resolved server side only):
 *   - email    : <name>@alsamos.com or a preserved legacy address
 *   - username : of any account owned by the identity
 *   - phone    : the identity phone number, in any human formatting
 */

import { supabase } from '@/integrations/supabase/client';
import {
  ALSAMOS_ACCOUNT_DOMAIN,
  ALSAMOS_MAIL_DOMAIN,
  MAX_ACCOUNTS_PER_IDENTITY,
  TOS_VERSION,
} from '@/lib/authConstants';

export {
  ALSAMOS_ACCOUNT_DOMAIN,
  ALSAMOS_MAIL_DOMAIN,
  MAX_ACCOUNTS_PER_IDENTITY,
  TOS_VERSION,
};

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

/**
 * Phone numbers are stored and compared in E.164 form. Any human formatting
 * is accepted: "+998 90 123 45 67", "998901234567", "(90) 123-45-67".
 */
export function normalizePhoneInput(value: string): string | null {
  const digits = (value ?? '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  const e164 = `+${digits}`;
  return /^\+[1-9][0-9]{7,14}$/.test(e164) ? e164 : null;
}

export type IdentifierKind = 'email' | 'phone' | 'username' | 'invalid';

/** Mirrors classifyIdentifier() in supabase/functions/_shared/auth-core.ts */
export function classifyIdentifier(raw: string): IdentifierKind {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return 'invalid';
  if (value.includes('@')) return 'email';
  if (/^[+0-9][0-9\s().\-_]{6,}$/.test(value)) {
    return normalizePhoneInput(value) ? 'phone' : 'invalid';
  }
  return isUsernameValid(value) ? 'username' : 'invalid';
}

/** Canonical form sent to the server (phones become E.164). */
export function canonicalIdentifier(raw: string): string {
  const value = (raw ?? '').trim().toLowerCase();
  if (classifyIdentifier(value) === 'phone') {
    return normalizePhoneInput(value) ?? value;
  }
  return value;
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
    phone?: string | null;
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
  | 'ACCOUNT_CREATE_FAILED'
  | 'USERNAME_INVALID'
  | 'USERNAME_TAKEN'
  | 'PHONE_INVALID'
  | 'PRIMARY_ACCOUNT_PROTECTED'
  | 'SESSION_MINT_FAILED'
  | 'UNAUTHORIZED'
  | 'IDENTITY_UNAVAILABLE'
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
      return 'Kirish maʼlumotlari xato.';
    case 'EMAIL_DOMAIN_NOT_ALLOWED':
      return `Ro’yxatdan o’tish faqat @${ALSAMOS_MAIL_DOMAIN} manzili bilan.`;
    case 'EMAIL_NOT_CONFIRMED':
      return 'Email hali tasdiqlanmagan. Pochtangizdagi havolani bosing.';
    case 'TOO_MANY_ATTEMPTS':
      return 'Juda ko’p urinish. 15 daqiqadan keyin qayta urinib ko’ring.';
    case 'TICKET_INVALID':
      return 'Sessiya muddati tugadi. Iltimos, qaytadan kiring.';
    case 'ACCOUNT_LIMIT_REACHED':
      return `Bitta identifikator uchun maksimal ${MAX_ACCOUNTS_PER_IDENTITY} akkaunt ochish mumkin.`;
    case 'USERNAME_INVALID':
      return 'Username 3-30 belgi, faqat a-z, 0-9 va _ bo’lishi kerak.';
    case 'USERNAME_TAKEN':
      return 'Bu username band.';
    case 'PHONE_INVALID':
      return 'Telefon raqamni xalqaro shaklda kiriting, masalan +998901234567.';
    case 'PRIMARY_ACCOUNT_PROTECTED':
      return 'Asosiy akkauntni uzib bo’lmaydi.';
    case 'ACCOUNT_NOT_FOUND':
      return 'Akkaunt topilmadi.';
    case 'UNAUTHORIZED':
      return 'Ruxsat yo’q. Qaytadan kiring.';
    case 'IDENTITY_UNAVAILABLE':
      return 'Akkaunt maʼlumotlarini yuklab bo’lmadi. Keyinroq urinib ko’ring.';
    case 'NETWORK':
      return 'Tarmoq xatosi. Internetni tekshirib qayta urinib ko’ring.';
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
    // supabase-js wraps non-2xx responses; recover our own error code.
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

/**
 * Step 1: verify the identity credentials and get the list of owned accounts.
 * `identifier` may be an email, a username or a phone number.
 */
export function requestLoginTicket(identifier: string, password: string) {
  return invokeAuthFunction<LoginStepResult>('account-login', {
    identifier: canonicalIdentifier(identifier),
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
export function requestAccountRevoke(
  accountId: string,
  mode: 'signout' | 'unlink' = 'signout',
) {
  return invokeAuthFunction<{ ok: true; revoked_tokens: number }>('account-revoke', {
    account_id: accountId,
    mode,
  });
}
