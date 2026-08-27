// POST /account-login
//
// Step 1 of the Alsamos login.
//   in : { identifier: "<email | username | phone>", password, device_id? }
//   out: { ticket, accounts[], identity } | { mfa_required: true, ticket }
//
// Accepted identifiers:
//   * <name>@alsamos.com  - identity email
//   * old email address   - preserved legacy address (gmail.com etc.)
//   * username            - of ANY account owned by the identity
//   * phone number        - identity phone (E.164, any human formatting)
//
// Security properties:
//   * the identifier is resolved inside the database with service_role only;
//   * the response is identical for "unknown identifier" and "wrong password";
//   * failures are rate limited per identifier and per IP;
//   * when 2FA is on, the account list is NOT returned yet and the ticket can
//     only be used by /account-2fa (purpose = "mfa_pending");
//   * no session is returned here - the caller must pick an account first;
//   * every attempt is written to the audit log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  activeTotpForIdentity,
  anonClient,
  audit,
  authError,
  canonicalIdentifier,
  classifyIdentifier,
  clientIp,
  corsHeaders,
  isRateLimited,
  issueTicket,
  jsonResponse,
  listIdentityAccounts,
  MAX_ACCOUNTS,
  recordAttempt,
  resolveIdentityByIdentifier,
  serviceClient,
  sha256,
} from "../_shared/auth-core.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return authError(req, "METHOD_NOT_ALLOWED", 405);
  }

  const admin = serviceClient();
  const ip = clientIp(req);

  let identifier = "";
  let password = "";
  try {
    const body = await req.json();
    // `email` is still accepted for backwards compatibility.
    const raw = body?.identifier ?? body?.email;
    identifier = typeof raw === "string" ? raw.trim() : "";
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return authError(req, "INVALID_REQUEST", 400);
  }

  if (!identifier || !password) {
    return authError(req, "INVALID_CREDENTIALS", 401);
  }

  const kind = classifyIdentifier(identifier);
  const canonical = canonicalIdentifier(identifier);
  const identifierHash = await sha256(canonical);

  // Rate limiting happens before any lookup so that probing costs the same
  // whether the identifier exists or not.
  if (await isRateLimited(admin, identifierHash, ip)) {
    await audit(admin, req, {
      eventType: "login",
      outcome: "blocked",
      reason: "rate_limited",
      metadata: { identifier_kind: kind },
    });
    return authError(req, "TOO_MANY_ATTEMPTS", 429);
  }

  if (kind === "invalid") {
    await recordAttempt(admin, identifierHash, ip, "failure");
    await audit(admin, req, {
      eventType: "login",
      outcome: "failure",
      reason: "malformed_identifier",
    });
    return authError(req, "INVALID_CREDENTIALS", 401);
  }

  const resolved = await resolveIdentityByIdentifier(admin, canonical);

  // Unknown identifier: behave exactly like a wrong password.
  if (!resolved) {
    await recordAttempt(admin, identifierHash, ip, "failure");
    await audit(admin, req, {
      eventType: "login",
      outcome: "failure",
      reason: "identifier_not_found",
      metadata: { identifier_kind: kind },
    });
    return authError(req, "INVALID_CREDENTIALS", 401);
  }

  // Verify the password with an anonymous client, then drop the session:
  // the browser must not receive a session before choosing an account.
  const anon = anonClient();
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
    email: resolved.loginEmail,
    password,
  });

  if (signInError || !signIn?.user) {
    await recordAttempt(admin, identifierHash, ip, "failure");
    await audit(admin, req, {
      eventType: "login",
      outcome: "failure",
      reason: "invalid_credentials",
      identityId: resolved.identityId,
      metadata: { identifier_kind: kind },
    });
    return authError(req, "INVALID_CREDENTIALS", 401);
  }

  const userId = signIn.user.id;
  await anon.auth.signOut({ scope: "global" }).catch(() => {});

  if (!signIn.user.email_confirmed_at) {
    await audit(admin, req, {
      eventType: "login",
      outcome: "blocked",
      reason: "email_not_confirmed",
      identityId: resolved.identityId,
      userId,
    });
    return authError(req, "EMAIL_NOT_CONFIRMED", 403);
  }

  const { data: identity } = await admin
    .from("auth_identities")
    .select("id, alsamos_email, phone, max_accounts, migration_status")
    .eq("id", resolved.identityId)
    .single();

  const { publicAccounts } = await listIdentityAccounts(admin, resolved.identityId);

  if (publicAccounts.length === 0) {
    await audit(admin, req, {
      eventType: "login",
      outcome: "failure",
      reason: "no_active_accounts",
      identityId: resolved.identityId,
      userId,
    });
    return authError(req, "ACCOUNT_NOT_FOUND", 404);
  }

  const identityPayload = {
    email: (identity?.alsamos_email as string | null) ?? resolved.loginEmail,
    phone: (identity?.phone as string | null) ?? null,
    migration_status: identity?.migration_status ?? resolved.migrationStatus,
    used: publicAccounts.length,
    max: (identity?.max_accounts as number | null) ?? MAX_ACCOUNTS,
  };

  // ---- Second factor -------------------------------------------------
  const totp = await activeTotpForIdentity(admin, resolved.identityId);

  if (totp) {
    // Password was correct but it is not enough: hand out a ticket that can
    // ONLY be spent on /account-2fa. A few uses are allowed so that a mistyped
    // code does not force the password to be entered again.
    const mfaTicket = await issueTicket(admin, req, resolved.identityId, "mfa_pending", 5);

    await recordAttempt(admin, identifierHash, ip, "success");
    await audit(admin, req, {
      eventType: "login",
      outcome: "success",
      reason: "mfa_required",
      identityId: resolved.identityId,
      userId,
      metadata: { identifier_kind: kind },
    });

    return jsonResponse(req, {
      mfa_required: true,
      mfa_method: "totp",
      ticket: mfaTicket,
      accounts: [],
      identity: identityPayload,
    });
  }

  // A ticket allows exactly "pick an account" (+1 spare use for creating one).
  const ticket = await issueTicket(admin, req, resolved.identityId, "account_select", 2);

  await recordAttempt(admin, identifierHash, ip, "success");
  await audit(admin, req, {
    eventType: "login",
    outcome: "success",
    identityId: resolved.identityId,
    userId,
    metadata: { accounts: publicAccounts.length, identifier_kind: kind },
  });

  return jsonResponse(req, {
    mfa_required: false,
    ticket,
    accounts: publicAccounts,
    identity: identityPayload,
  });
});
