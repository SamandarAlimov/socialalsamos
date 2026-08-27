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
 *
 * When 2FA is on, step 1 returns `mfa_required` and the ticket can only be
 * spent on verifyMfaLogin().
 *
 * RESILIENCE: the multi-account flow lives in edge functions. When those are
 * not deployed / unreachable (CORS, 404, cold start), the client falls back to
 * plain Supabase email+password sign-in via directPasswordLogin(), so users can
 * always get in. See isRecoverableAuthFailure().
 */

import { supabase } from '@/integrations/supabase/client';
import {
  ALSAMOS_ACCOUNT_DOMAIN,
  ALSAMOS_MAIL_DOMAIN,
  MAX_ACCOUNTS_PER_IDENTITY,
  TOS_VERSION,
} from '@/lib/authConstants';
import { setActiveSlot } from '@/lib/accountSlots';
import { getDeviceId } from '@/lib/deviceId';

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

/** TOTP codes are 6 digits; recovery codes are "xxxx-xxxx-xxxx" base32. */
export function isTotpCode(value: string): boolean {
  return /^[0-9]{6}$/.test((value ?? '').replace(/\s/g, ''));
}

export function isRecoveryCode(value: string): boolean {
  return (value ?? '').toUpperCase().replace(/[^A-Z2-7]/g, '').length >= 8;
}

export type PublicAccount = {
  id: string;
  slot_no: number;
  is_primary: boolean;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type IdentitySummary = {
  email: string;
  phone?: string | null;
  migration_status: 'legacy' | 'claimed' | 'migrated';
  used: number;
  max: number;
};

export type LoginStepResult = {
  ticket: string;
  accounts: PublicAccount[];
  identity: IdentitySummary;
  /** When true the ticket may ONLY be used with verifyMfaLogin(). */
  mfa_required?: boolean;
  mfa_method?: 'totp' | null;
};

export type TwoFactorStatus = {
  enabled: boolean;
  pending: boolean;
  codes_left: number;
};

export type ActiveDevice = {
  id: string;
  slot_no: number;
  label: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  is_current_account: boolean;
  is_current_device: boolean;
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
  | 'MFA_CODE_INVALID'
  | 'MFA_ALREADY_ENABLED'
  | 'MFA_NOT_PENDING'
  | 'DEVICE_NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
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
    case 'MFA_CODE_INVALID':
      return 'Kod xato yoki muddati tugagan. Ilovadagi yangi kodni kiriting.';
    case 'MFA_ALREADY_ENABLED':
      return '2FA allaqachon yoqilgan.';
    case 'MFA_NOT_PENDING':
      return '2FA sozlash boshlanmagan. Avval QR kodni oling.';
    case 'DEVICE_NOT_FOUND':
      return 'Qurilma topilmadi yoki allaqachon uzilgan.';
    case 'NETWORK':
      return 'Tarmoq xatosi. Internetni tekshirib qayta urinib ko’ring.';
    default:
      return 'Kutilmagan xatolik yuz berdi.';
  }
}

type AuthFunctionName =
  | 'account-login'
  | 'account-session'
  | 'account-create'
  | 'account-revoke'
  | 'account-2fa'
  | 'account-devices';

async function invokeAuthFunction<T>(
  name: AuthFunctionName,
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

    // No response body at all: the function is unreachable (CORS / not deployed).
    if (code === 'UNKNOWN' && !ctx) code = 'NETWORK';

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
    device_id: getDeviceId(),
  });
}

/** Step 1b (only when mfa_required): TOTP or recovery code. */
export function verifyMfaLogin(ticket: string, code: string) {
  return invokeAuthFunction<LoginStepResult & { method: 'totp' | 'recovery' }>('account-2fa', {
    action: 'verify_login',
    ticket,
    code: code.trim(),
  });
}

/** Step 2: exchange the ticket for a session of the chosen account. */
export function requestAccountSession(ticket: string, accountId?: string) {
  return invokeAuthFunction<{
    token_hash: string;
    slot_no: number;
    account: { id: string; slot_no: number; is_primary: boolean };
  }>('account-session', {
    ticket,
    account_id: accountId ?? null,
    device_id: getDeviceId(),
  });
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

// ---------------------------------------------------------------------
// Direct sign-in fallback
// ---------------------------------------------------------------------

/**
 * Ticket value used when the session was opened directly by Supabase auth
 * instead of the account-session edge function. completeLogin() recognises it
 * and simply keeps the session that already exists.
 */
export const DIRECT_SESSION_TICKET = 'direct-session';

/**
 * Failures that mean "the multi-account server flow is unavailable", not
 * "these credentials are wrong". Only these may trigger the direct fallback,
 * so a genuinely wrong password never silently takes another path.
 */
const RECOVERABLE_CODES: AuthErrorCode[] = [
  'NETWORK',
  'UNKNOWN',
  'INVALID_REQUEST',
  'METHOD_NOT_ALLOWED',
  'IDENTITY_UNAVAILABLE',
  'SESSION_MINT_FAILED',
  'ACCOUNT_NOT_FOUND',
  'TICKET_INVALID',
];

export function isRecoverableAuthFailure(error: unknown): boolean {
  if (error instanceof AlsamosAuthError) return RECOVERABLE_CODES.includes(error.code);
  // Anything that is not one of our coded errors is an infrastructure problem.
  return true;
}

/** Email addresses worth trying for a given login identifier. */
function loginEmailCandidates(identifier: string): string[] {
  const value = normalizeEmail(identifier);
  const kind = classifyIdentifier(value);

  if (kind === 'email') {
    const candidates = [value];
    const local = value.split('@')[0];
    if (!isAlsamosEmail(value) && local) {
      candidates.push(`${local}@${ALSAMOS_MAIL_DOMAIN}`);
    }
    return candidates;
  }

  if (kind === 'username') {
    return [`${value}@${ALSAMOS_MAIL_DOMAIN}`, `${value}@${ALSAMOS_ACCOUNT_DOMAIN}`];
  }

  return [];
}

/**
 * Plain Supabase email/phone + password sign-in. Used as a fallback so login
 * keeps working when the account-* edge functions are unavailable.
 */
export async function directPasswordLogin(
  identifier: string,
  password: string,
): Promise<LoginStepResult> {
  const kind = classifyIdentifier(identifier);

  if (kind === 'invalid') {
    throw new AlsamosAuthError('INVALID_CREDENTIALS', authErrorMessage('INVALID_CREDENTIALS'));
  }

  // The direct session always lives in the primary slot.
  setActiveSlot(1);

  const attempts: Array<{ email?: string; phone?: string }> =
    kind === 'phone'
      ? [{ phone: normalizePhoneInput(identifier) ?? identifier }]
      : loginEmailCandidates(identifier).map((email) => ({ email }));

  let notConfirmed = false;
  let rateLimited = false;

  for (const attempt of attempts) {
    const { data, error } = await supabase.auth.signInWithPassword({
      ...attempt,
      password,
    } as Parameters<typeof supabase.auth.signInWithPassword>[0]);

    if (!error && data?.session && data?.user) {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', data.user.id)
        .maybeSingle();

      return {
        ticket: DIRECT_SESSION_TICKET,
        accounts: [
          {
            id: data.user.id,
            slot_no: 1,
            is_primary: true,
            username: profileRow?.username ?? null,
            display_name: profileRow?.display_name ?? null,
            avatar_url: profileRow?.avatar_url ?? null,
          },
        ],
        identity: {
          email: data.user.email ?? toIdentityEmail(identifier),
          phone: data.user.phone ?? null,
          migration_status: 'legacy',
          used: 1,
          max: MAX_ACCOUNTS_PER_IDENTITY,
        },
        mfa_required: false,
      };
    }

    const message = error?.message ?? '';
    if (/not\s*confirmed|confirm/i.test(message)) notConfirmed = true;
    if (/rate|too many/i.test(message)) rateLimited = true;
  }

  if (rateLimited) {
    throw new AlsamosAuthError('TOO_MANY_ATTEMPTS', authErrorMessage('TOO_MANY_ATTEMPTS'));
  }
  if (notConfirmed) {
    throw new AlsamosAuthError('EMAIL_NOT_CONFIRMED', authErrorMessage('EMAIL_NOT_CONFIRMED'));
  }

  throw new AlsamosAuthError('INVALID_CREDENTIALS', authErrorMessage('INVALID_CREDENTIALS'));
}

// ---------------------------------------------------------------------
// Two-factor authentication (session required)
// ---------------------------------------------------------------------

export function fetchTwoFactorStatus() {
  return invokeAuthFunction<TwoFactorStatus>('account-2fa', { action: 'status' });
}

/** Returns the shared secret ONCE, for the QR code. */
export function startTwoFactorSetup() {
  return invokeAuthFunction<{ secret: string; otpauth_url: string }>('account-2fa', {
    action: 'setup',
  });
}

/** Confirms the enrolment and returns the recovery codes ONCE. */
export function enableTwoFactor(code: string) {
  return invokeAuthFunction<{ enabled: true; recovery_codes: string[] }>('account-2fa', {
    action: 'enable',
    code: code.trim(),
  });
}

export function disableTwoFactor(code: string) {
  return invokeAuthFunction<{ enabled: false }>('account-2fa', {
    action: 'disable',
    code: code.trim(),
  });
}

export function regenerateRecoveryCodes(code: string) {
  return invokeAuthFunction<{ recovery_codes: string[] }>('account-2fa', {
    action: 'regenerate_codes',
    code: code.trim(),
  });
}

// ---------------------------------------------------------------------
// Active devices / sessions (session required)
// ---------------------------------------------------------------------

export function listActiveDevices() {
  return invokeAuthFunction<{ devices: ActiveDevice[] }>('account-devices', {
    action: 'list',
    client_device_id: getDeviceId(),
  });
}

export function revokeDevice(deviceId: string) {
  return invokeAuthFunction<{ ok: true; revoked_tokens: number | null }>('account-devices', {
    action: 'revoke',
    device_id: deviceId,
    client_device_id: getDeviceId(),
  });
}

export function revokeOtherDevices() {
  return invokeAuthFunction<{ ok: true; revoked_devices: number }>('account-devices', {
    action: 'revoke_others',
    client_device_id: getDeviceId(),
  });
}
