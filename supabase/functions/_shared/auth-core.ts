// Shared helpers for the Alsamos identity/account auth edge functions.
// Keep this file free of business logic: only primitives that must behave
// identically across every auth endpoint live here.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const ALSAMOS_DOMAIN = "alsamos.com";
export const ACCOUNT_DOMAIN = "accounts.alsamos.com";
export const MAX_ACCOUNTS = 10;

/** Allowed browser origins. `*` is only used when no allowlist is configured. */
const allowedOrigins = (Deno.env.get("AUTH_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = allowedOrigins.length === 0
    ? "*"
    : allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

/**
 * Generic auth error. Never reveal whether the identifier exists, whether the
 * password was wrong, or which account is linked to which email.
 */
export function authError(req: Request, code: string, status = 400, message?: string) {
  return jsonResponse(req, { error: code, message: message ?? null }, status);
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Anonymous client used purely to verify a password. */
export function anonClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isIdentityEmail(email: string): boolean {
  return /^[a-z0-9._%+-]{1,64}@alsamos\\.com$/.test(email);
}

export function isUsernameValid(username: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(username);
}

export function accountEmailFor(username: string): string {
  return `${username}@${ACCOUNT_DOMAIN}`;
}

// ---------------------------------------------------------------------
// Login identifiers: email | username | phone
// ---------------------------------------------------------------------

/** Digits -> E.164, or null when the value cannot be a phone number. */
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const e164 = `+${digits}`;
  return /^\\+[1-9][0-9]{7,14}$/.test(e164) ? e164 : null;
}

export type IdentifierKind = "email" | "phone" | "username" | "invalid";

export function classifyIdentifier(raw: string): IdentifierKind {
  const value = raw.trim().toLowerCase();
  if (!value) return "invalid";
  if (value.includes("@")) return "email";
  if (/^[+0-9][0-9\\s().\\-_]{6,}$/.test(value)) {
    return normalizePhone(value) ? "phone" : "invalid";
  }
  return isUsernameValid(value) ? "username" : "invalid";
}

/** Canonical form used for rate-limit bucketing and audit hashing. */
export function canonicalIdentifier(raw: string): string {
  const kind = classifyIdentifier(raw);
  const value = raw.trim().toLowerCase();
  if (kind === "phone") return normalizePhone(value) ?? value;
  return value;
}

export type ResolvedIdentity = {
  identityId: string;
  loginEmail: string;
  migrationStatus: string;
};

/**
 * Resolve an identifier (identity email, preserved legacy email, username or
 * phone number) to the identity and to the login email that carries the
 * password. Runs entirely inside the database with service_role rights, so
 * nothing is exposed to the client.
 */
export async function resolveIdentityByIdentifier(
  admin: SupabaseClient,
  identifier: string,
): Promise<ResolvedIdentity | null> {
  const { data, error } = await admin.rpc("resolve_login_identity", {
    _identifier: identifier,
  });

  if (error) {
    console.error("resolve_login_identity failed", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.identity_id || !row?.login_email) return null;

  return {
    identityId: row.identity_id as string,
    loginEmail: row.login_email as string,
    migrationStatus: (row.migration_status as string) ?? "migrated",
  };
}

export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip");
}

export function userAgent(req: Request): string {
  return (req.headers.get("user-agent") ?? "").slice(0, 400);
}

const encoder = new TextEncoder();

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cryptographically strong password for accounts that never log in directly. */
export function unusablePassword(): string {
  return `${randomToken(24)}-${randomToken(24)}Aa1!`;
}

export async function audit(
  admin: SupabaseClient,
  req: Request,
  params: {
    eventType: string;
    outcome?: "success" | "failure" | "blocked";
    identityId?: string | null;
    userId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await admin.rpc("record_auth_event", {
    p_event_type: params.eventType,
    p_outcome: params.outcome ?? "success",
    p_identity_id: params.identityId ?? null,
    p_user_id: params.userId ?? null,
    p_reason: params.reason ?? null,
    p_ip: clientIp(req),
    p_user_agent: userAgent(req),
    p_metadata: params.metadata ?? {},
  });
}

export const RATE_LIMIT = {
  windowMinutes: 15,
  maxFailuresPerEmail: 8,
  maxFailuresPerIp: 25,
};

export async function isRateLimited(
  admin: SupabaseClient,
  emailHash: string,
  ip: string | null,
): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT.windowMinutes * 60_000).toISOString();

  const { count: emailFailures } = await admin
    .from("auth_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("email_hash", emailHash)
    .eq("outcome", "failure")
    .gte("created_at", since);

  if ((emailFailures ?? 0) >= RATE_LIMIT.maxFailuresPerEmail) return true;

  if (ip) {
    const { count: ipFailures } = await admin
      .from("auth_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("outcome", "failure")
      .gte("created_at", since);

    if ((ipFailures ?? 0) >= RATE_LIMIT.maxFailuresPerIp) return true;
  }

  return false;
}

export async function recordAttempt(
  admin: SupabaseClient,
  emailHash: string,
  ip: string | null,
  outcome: "success" | "failure",
): Promise<void> {
  await admin.from("auth_login_attempts").insert({
    email_hash: emailHash,
    ip,
    outcome,
  });
}

export type AccountRow = {
  id: string;
  identity_id: string;
  user_id: string;
  slot_no: number;
  login_email: string;
  is_primary: boolean;
  status: string;
};

/** Public (safe) shape of an account, used by the account picker UI. */
export type PublicAccount = {
  id: string;
  slot_no: number;
  is_primary: boolean;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export async function listIdentityAccounts(
  admin: SupabaseClient,
  identityId: string,
): Promise<{ rows: AccountRow[]; publicAccounts: PublicAccount[] }> {
  const { data: rows } = await admin
    .from("identity_accounts")
    .select("id, identity_id, user_id, slot_no, login_email, is_primary, status")
    .eq("identity_id", identityId)
    .eq("status", "active")
    .order("slot_no", { ascending: true });

  const accounts = (rows ?? []) as AccountRow[];
  if (accounts.length === 0) return { rows: [], publicAccounts: [] };

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", accounts.map((a) => a.user_id));

  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  return {
    rows: accounts,
    publicAccounts: accounts.map((a) => {
      const p = byId.get(a.user_id);
      return {
        id: a.id,
        slot_no: a.slot_no,
        is_primary: a.is_primary,
        username: (p?.username as string | null) ?? null,
        display_name: (p?.display_name as string | null) ?? null,
        avatar_url: (p?.avatar_url as string | null) ?? null,
      };
    }),
  };
}

export type TicketPurpose = "account_select" | "account_create" | "mfa_pending";

/** Create a single-use, short-lived ticket bound to an identity. */
export async function issueTicket(
  admin: SupabaseClient,
  req: Request,
  identityId: string,
  purpose: TicketPurpose = "account_select",
  uses = 2,
): Promise<string> {
  const token = randomToken(32);
  await admin.from("auth_login_tickets").insert({
    token_hash: await sha256(token),
    identity_id: identityId,
    purpose,
    ip: clientIp(req),
    user_agent: userAgent(req),
    uses_left: uses,
  });
  return token;
}

/**
 * Consume one use of a ticket.
 *
 * `expectedPurpose` must be passed by every caller that depends on the ticket
 * meaning something specific: an "mfa_pending" ticket must never be usable to
 * open a session, otherwise 2FA could be skipped entirely.
 */
export async function consumeTicket(
  admin: SupabaseClient,
  token: unknown,
  expectedPurpose?: TicketPurpose,
): Promise<{ identityId: string; purpose: TicketPurpose } | null> {
  if (typeof token !== "string" || token.length < 32) return null;

  const hash = await sha256(token);
  const { data } = await admin
    .from("auth_login_tickets")
    .select("id, identity_id, purpose, uses_left, expires_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
  if ((data.uses_left as number) <= 0) return null;

  const purpose = (data.purpose as TicketPurpose) ?? "account_select";
  if (expectedPurpose && purpose !== expectedPurpose) return null;

  const remaining = (data.uses_left as number) - 1;
  await admin
    .from("auth_login_tickets")
    .update({
      uses_left: remaining,
      consumed_at: remaining === 0 ? new Date().toISOString() : null,
    })
    .eq("id", data.id);

  return { identityId: data.identity_id as string, purpose };
}

/** Invalidate every remaining use of a ticket (e.g. after 2FA is satisfied). */
export async function burnTicket(admin: SupabaseClient, token: unknown): Promise<void> {
  if (typeof token !== "string" || token.length < 32) return;
  await admin
    .from("auth_login_tickets")
    .update({ uses_left: 0, consumed_at: new Date().toISOString() })
    .eq("token_hash", await sha256(token));
}

// ---------------------------------------------------------------------
// Two-factor authentication state
// ---------------------------------------------------------------------

export type TotpRecord = {
  user_id: string;
  identity_id: string | null;
  secret: string;
  confirmed_at: string | null;
  last_used_step: number | null;
};

/** The confirmed TOTP enrolment of an identity, if 2FA is switched on. */
export async function activeTotpForIdentity(
  admin: SupabaseClient,
  identityId: string,
): Promise<TotpRecord | null> {
  const { data } = await admin
    .from("user_totp")
    .select("user_id, identity_id, secret, confirmed_at, last_used_step")
    .eq("identity_id", identityId)
    .not("confirmed_at", "is", null)
    .maybeSingle();

  return (data as TotpRecord | null) ?? null;
}

// ---------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------

/**
 * Stable-per-browser device fingerprint.
 *
 * The client sends a random id it keeps in localStorage; when it is missing we
 * fall back to a hash of user-agent + IP so the device list is never empty.
 * Only the hash is stored.
 */
export async function deviceHash(req: Request, clientDeviceId?: unknown): Promise<string> {
  if (typeof clientDeviceId === "string" && clientDeviceId.trim().length >= 8) {
    return sha256(`device:${clientDeviceId.trim().slice(0, 200)}`);
  }
  return sha256(`ua:${userAgent(req)}|ip:${clientIp(req) ?? "unknown"}`);
}

/** Human readable device label derived from the user agent. */
export function deviceLabel(req: Request): string {
  const ua = userAgent(req);
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/i.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Noma'lum tizim";

  const browser = /Edg\\//i.test(ua)
    ? "Edge"
    : /OPR\\/|Opera/i.test(ua)
      ? "Opera"
      : /Chrome\\//i.test(ua)
        ? "Chrome"
        : /Safari\\//i.test(ua)
          ? "Safari"
          : /Firefox\\//i.test(ua)
            ? "Firefox"
            : "Brauzer";

  return `${browser} - ${os}`;
}

/** Register (or refresh) the device row for a freshly minted session. */
export async function touchDevice(
  admin: SupabaseClient,
  req: Request,
  params: {
    identityId: string;
    userId: string;
    slotNo: number;
    clientDeviceId?: unknown;
  },
): Promise<string | null> {
  const { data, error } = await admin.rpc("touch_auth_device", {
    _identity_id: params.identityId,
    _user_id: params.userId,
    _slot_no: params.slotNo,
    _device_hash: await deviceHash(req, params.clientDeviceId),
    _user_agent: userAgent(req),
    _ip: clientIp(req),
    _label: deviceLabel(req),
  });

  if (error) {
    console.error("touch_auth_device failed", error.message);
    return null;
  }

  return (data as string | null) ?? null;
}

/**
 * Mint a session for an account without ever handling its password:
 * a magic-link token hash is returned and exchanged client side with
 * `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })`.
 */
export async function mintSessionToken(
  admin: SupabaseClient,
  loginEmail: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: loginEmail,
  });

  if (error || !data?.properties?.hashed_token) return null;
  return data.properties.hashed_token;
}

/** Resolve the identity of a caller that presents a valid session JWT. */
export async function identityFromJwt(
  admin: SupabaseClient,
  req: Request,
): Promise<{ identityId: string; userId: string } | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;

  const { data: link } = await admin
    .from("identity_accounts")
    .select("identity_id")
    .eq("user_id", data.user.id)
    .neq("status", "deleted")
    .maybeSingle();

  if (!link) return null;
  return { identityId: link.identity_id as string, userId: data.user.id };
}
