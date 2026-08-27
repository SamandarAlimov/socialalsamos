// POST /account-2fa
//
// One endpoint, several actions:
//
//   Authenticated (session JWT required):
//     { action: "status" }                      -> { enabled, pending, codes_left }
//     { action: "setup" }                       -> { secret, otpauth_url }
//     { action: "enable", code }                -> { enabled: true, recovery_codes[] }
//     { action: "disable", code }               -> { enabled: false }
//     { action: "regenerate_codes", code }      -> { recovery_codes[] }
//
//   Unauthenticated, ticket based (login flow):
//     { action: "verify_login", ticket, code }  -> { ticket, accounts[], identity }
//
// Rules enforced here:
//   * secrets never leave the server after enrolment (only during setup);
//   * recovery codes are returned exactly once and stored as SHA-256 hashes;
//   * a TOTP step can be used only once (replay protection);
//   * verify_login only accepts a ticket whose purpose is "mfa_pending",
//     and it burns that ticket before issuing an account_select ticket;
//   * failures are rate limited per identity and per IP.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  activeTotpForIdentity,
  audit,
  authError,
  burnTicket,
  clientIp,
  consumeTicket,
  corsHeaders,
  identityFromJwt,
  isRateLimited,
  issueTicket,
  jsonResponse,
  listIdentityAccounts,
  MAX_ACCOUNTS,
  recordAttempt,
  serviceClient,
  sha256,
} from "../_shared/auth-core.ts";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  otpauthUrl,
  verifyTotp,
} from "../_shared/totp.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const RECOVERY_CODE_COUNT = 10;

async function countOpenCodes(admin: SupabaseClient, identityId: string): Promise<number> {
  const { count } = await admin
    .from("user_recovery_codes")
    .select("id", { count: "exact", head: true })
    .eq("identity_id", identityId)
    .is("used_at", null);
  return count ?? 0;
}

/** Replace every recovery code of an identity and return the plaintext once. */
async function issueRecoveryCodes(
  admin: SupabaseClient,
  identityId: string,
  userId: string,
): Promise<string[]> {
  const codes = generateRecoveryCodes(RECOVERY_CODE_COUNT);

  await admin.from("user_recovery_codes").delete().eq("identity_id", identityId);

  const rows = await Promise.all(
    codes.map(async (code) => ({
      identity_id: identityId,
      user_id: userId,
      code_hash: await sha256(normalizeRecoveryCode(code)),
    })),
  );

  await admin.from("user_recovery_codes").insert(rows);
  return codes;
}

/** Best-effort mirror of the 2FA state into the legacy user_security table. */
async function mirrorSecurityState(
  admin: SupabaseClient,
  userId: string,
  enabled: boolean,
): Promise<void> {
  try {
    await admin
      .from("user_security")
      .upsert(
        {
          user_id: userId,
          two_fa_enabled: enabled,
          two_fa_method: enabled ? "totp" : null,
        },
        { onConflict: "user_id" },
      );
  } catch (e) {
    console.warn("user_security mirror skipped", e);
  }
}

/** Accept a TOTP code, or a single-use recovery code, for an identity. */
async function verifySecondFactor(
  admin: SupabaseClient,
  identityId: string,
  code: unknown,
  ip: string | null,
): Promise<{ ok: boolean; method: "totp" | "recovery" | null; userId: string | null }> {
  const totp = await activeTotpForIdentity(admin, identityId);
  if (!totp) return { ok: false, method: null, userId: null };

  const result = await verifyTotp(totp.secret, code, {
    window: 1,
    minStep: totp.last_used_step ?? null,
  });

  if (result.valid && result.step != null) {
    await admin
      .from("user_totp")
      .update({ last_used_step: result.step, failed_attempts: 0, updated_at: new Date().toISOString() })
      .eq("user_id", totp.user_id);
    return { ok: true, method: "totp", userId: totp.user_id };
  }

  // Fall back to a recovery code.
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length >= 8) {
    const hash = await sha256(normalized);
    const { data: row } = await admin
      .from("user_recovery_codes")
      .select("id")
      .eq("identity_id", identityId)
      .eq("code_hash", hash)
      .is("used_at", null)
      .maybeSingle();

    if (row?.id) {
      await admin
        .from("user_recovery_codes")
        .update({ used_at: new Date().toISOString(), used_ip: ip })
        .eq("id", row.id);
      return { ok: true, method: "recovery", userId: totp.user_id };
    }
  }

  await admin
    .from("user_totp")
    .update({ failed_attempts: (totp as { failed_attempts?: number }).failed_attempts ?? 0 })
    .eq("user_id", totp.user_id);

  return { ok: false, method: null, userId: totp.user_id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return authError(req, "METHOD_NOT_ALLOWED", 405);
  }

  const admin = serviceClient();
  const ip = clientIp(req);

  let action = "";
  let code: unknown = null;
  let ticket: unknown = null;
  try {
    const body = await req.json();
    action = typeof body?.action === "string" ? body.action : "";
    code = body?.code ?? null;
    ticket = body?.ticket ?? null;
  } catch {
    return authError(req, "INVALID_REQUEST", 400);
  }

  // ------------------------------------------------------------------
  // Login flow: ticket + second factor -> account_select ticket
  // ------------------------------------------------------------------
  if (action === "verify_login") {
    const consumed = await consumeTicket(admin, ticket, "mfa_pending");
    if (!consumed) {
      await audit(admin, req, {
        eventType: "mfa_verify",
        outcome: "blocked",
        reason: "invalid_or_expired_ticket",
      });
      return authError(req, "TICKET_INVALID", 401);
    }

    const bucket = await sha256(`mfa:${consumed.identityId}`);
    if (await isRateLimited(admin, bucket, ip)) {
      await audit(admin, req, {
        eventType: "mfa_verify",
        outcome: "blocked",
        reason: "rate_limited",
        identityId: consumed.identityId,
      });
      return authError(req, "TOO_MANY_ATTEMPTS", 429);
    }

    const check = await verifySecondFactor(admin, consumed.identityId, code, ip);

    if (!check.ok) {
      await recordAttempt(admin, bucket, ip, "failure");
      await audit(admin, req, {
        eventType: "mfa_verify",
        outcome: "failure",
        reason: "invalid_code",
        identityId: consumed.identityId,
      });
      return authError(req, "MFA_CODE_INVALID", 401);
    }

    // The pending ticket must not survive a successful verification.
    await burnTicket(admin, ticket);

    const { publicAccounts } = await listIdentityAccounts(admin, consumed.identityId);
    if (publicAccounts.length === 0) {
      return authError(req, "ACCOUNT_NOT_FOUND", 404);
    }

    const { data: identity } = await admin
      .from("auth_identities")
      .select("alsamos_email, phone, max_accounts, migration_status")
      .eq("id", consumed.identityId)
      .maybeSingle();

    const sessionTicket = await issueTicket(
      admin,
      req,
      consumed.identityId,
      "account_select",
      2,
    );

    await recordAttempt(admin, bucket, ip, "success");
    await audit(admin, req, {
      eventType: "mfa_verify",
      outcome: "success",
      identityId: consumed.identityId,
      userId: check.userId,
      metadata: { method: check.method },
    });

    return jsonResponse(req, {
      ticket: sessionTicket,
      accounts: publicAccounts,
      method: check.method,
      identity: {
        email: (identity?.alsamos_email as string | null) ?? null,
        phone: (identity?.phone as string | null) ?? null,
        migration_status: identity?.migration_status ?? "migrated",
        used: publicAccounts.length,
        max: (identity?.max_accounts as number | null) ?? MAX_ACCOUNTS,
      },
    });
  }

  // ------------------------------------------------------------------
  // Everything else requires a real session
  // ------------------------------------------------------------------
  const caller = await identityFromJwt(admin, req);
  if (!caller) {
    return authError(req, "UNAUTHORIZED", 401);
  }

  if (action === "status") {
    const { data: row } = await admin
      .from("user_totp")
      .select("user_id, confirmed_at")
      .eq("identity_id", caller.identityId)
      .maybeSingle();

    return jsonResponse(req, {
      enabled: !!row?.confirmed_at,
      pending: !!row && !row.confirmed_at,
      codes_left: row?.confirmed_at ? await countOpenCodes(admin, caller.identityId) : 0,
    });
  }

  if (action === "setup") {
    const existing = await activeTotpForIdentity(admin, caller.identityId);
    if (existing) {
      return authError(req, "MFA_ALREADY_ENABLED", 409);
    }

    const secret = generateTotpSecret();
    const { data: account } = await admin
      .from("auth_identities")
      .select("alsamos_email")
      .eq("id", caller.identityId)
      .maybeSingle();

    // A pending (unconfirmed) enrolment always replaces the previous one.
    await admin.from("user_totp").upsert(
      {
        user_id: caller.userId,
        identity_id: caller.identityId,
        secret,
        confirmed_at: null,
        last_used_step: null,
        failed_attempts: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    await audit(admin, req, {
      eventType: "mfa_setup",
      outcome: "success",
      identityId: caller.identityId,
      userId: caller.userId,
    });

    return jsonResponse(req, {
      secret,
      otpauth_url: otpauthUrl({
        secret,
        account: (account?.alsamos_email as string | null) ?? "alsamos",
      }),
    });
  }

  if (action === "enable") {
    const { data: pending } = await admin
      .from("user_totp")
      .select("user_id, secret, confirmed_at")
      .eq("user_id", caller.userId)
      .maybeSingle();

    if (!pending?.secret) {
      return authError(req, "MFA_NOT_PENDING", 409);
    }
    if (pending.confirmed_at) {
      return authError(req, "MFA_ALREADY_ENABLED", 409);
    }

    const result = await verifyTotp(pending.secret as string, code, { window: 1 });
    if (!result.valid) {
      await audit(admin, req, {
        eventType: "mfa_enable",
        outcome: "failure",
        reason: "invalid_code",
        identityId: caller.identityId,
        userId: caller.userId,
      });
      return authError(req, "MFA_CODE_INVALID", 401);
    }

    await admin
      .from("user_totp")
      .update({
        confirmed_at: new Date().toISOString(),
        identity_id: caller.identityId,
        last_used_step: result.step,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", caller.userId);

    const codes = await issueRecoveryCodes(admin, caller.identityId, caller.userId);
    await mirrorSecurityState(admin, caller.userId, true);

    await audit(admin, req, {
      eventType: "mfa_enable",
      outcome: "success",
      identityId: caller.identityId,
      userId: caller.userId,
    });

    return jsonResponse(req, { enabled: true, recovery_codes: codes });
  }

  if (action === "disable") {
    const check = await verifySecondFactor(admin, caller.identityId, code, ip);
    if (!check.ok) {
      await audit(admin, req, {
        eventType: "mfa_disable",
        outcome: "failure",
        reason: "invalid_code",
        identityId: caller.identityId,
        userId: caller.userId,
      });
      return authError(req, "MFA_CODE_INVALID", 401);
    }

    await admin.from("user_recovery_codes").delete().eq("identity_id", caller.identityId);
    await admin.from("user_totp").delete().eq("identity_id", caller.identityId);
    await mirrorSecurityState(admin, caller.userId, false);

    await audit(admin, req, {
      eventType: "mfa_disable",
      outcome: "success",
      identityId: caller.identityId,
      userId: caller.userId,
    });

    return jsonResponse(req, { enabled: false });
  }

  if (action === "regenerate_codes") {
    const check = await verifySecondFactor(admin, caller.identityId, code, ip);
    if (!check.ok) {
      return authError(req, "MFA_CODE_INVALID", 401);
    }

    const codes = await issueRecoveryCodes(admin, caller.identityId, caller.userId);

    await audit(admin, req, {
      eventType: "mfa_codes_regenerated",
      outcome: "success",
      identityId: caller.identityId,
      userId: caller.userId,
    });

    return jsonResponse(req, { recovery_codes: codes });
  }

  return authError(req, "INVALID_REQUEST", 400);
});
