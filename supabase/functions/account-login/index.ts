// POST /account-login
//
// Step 1 of the two-step Alsamos login.
//   in : { email: "<name>@alsamos.com", password: "..." }
//   out: { ticket, accounts[], identity: { email, used, max } }
//
// Security properties:
//   * only @alsamos.com identity emails are accepted;
//   * the response is identical for "unknown email" and "wrong password";
//   * failures are rate limited per email and per IP;
//   * no session is returned here - the caller must pick an account first;
//   * every attempt is written to the audit log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  anonClient,
  audit,
  authError,
  clientIp,
  corsHeaders,
  isIdentityEmail,
  isRateLimited,
  issueTicket,
  jsonResponse,
  listIdentityAccounts,
  MAX_ACCOUNTS,
  normalizeEmail,
  recordAttempt,
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

  let email = "";
  let password = "";
  try {
    const body = await req.json();
    email = normalizeEmail(body?.email);
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return authError(req, "INVALID_REQUEST", 400);
  }

  if (!email || !password) {
    return authError(req, "INVALID_CREDENTIALS", 401);
  }

  // Domain policy: logging in is only possible with an @alsamos.com identity.
  if (!isIdentityEmail(email)) {
    await audit(admin, req, {
      eventType: "login",
      outcome: "blocked",
      reason: "non_alsamos_domain",
    });
    return authError(req, "EMAIL_DOMAIN_NOT_ALLOWED", 400);
  }

  const emailHash = await sha256(email);

  if (await isRateLimited(admin, emailHash, ip)) {
    await audit(admin, req, {
      eventType: "login",
      outcome: "blocked",
      reason: "rate_limited",
    });
    return authError(req, "TOO_MANY_ATTEMPTS", 429);
  }

  // Verify the password with an anonymous client, then drop the session:
  // the browser must not receive a session before choosing an account.
  const anon = anonClient();
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signIn?.user) {
    await recordAttempt(admin, emailHash, ip, "failure");
    await audit(admin, req, {
      eventType: "login",
      outcome: "failure",
      reason: "invalid_credentials",
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
      userId,
    });
    return authError(req, "EMAIL_NOT_CONFIRMED", 403);
  }

  // Resolve the identity (the migration backfills every existing user).
  const { data: link } = await admin
    .from("identity_accounts")
    .select("identity_id")
    .eq("user_id", userId)
    .neq("status", "deleted")
    .maybeSingle();

  let identityId = link?.identity_id as string | undefined;

  if (!identityId) {
    const { data: created } = await admin
      .from("auth_identities")
      .insert({ alsamos_email: email, primary_user_id: userId, migration_status: "migrated" })
      .select("id")
      .single();

    identityId = created?.id as string | undefined;
    if (identityId) {
      await admin.from("identity_accounts").insert({
        identity_id: identityId,
        user_id: userId,
        slot_no: 1,
        login_email: email,
        is_primary: true,
      });
    }
  }

  if (!identityId) {
    await audit(admin, req, {
      eventType: "login",
      outcome: "failure",
      reason: "identity_bootstrap_failed",
      userId,
    });
    return authError(req, "IDENTITY_UNAVAILABLE", 500);
  }

  const { data: identity } = await admin
    .from("auth_identities")
    .select("id, alsamos_email, max_accounts, migration_status")
    .eq("id", identityId)
    .single();

  const { publicAccounts } = await listIdentityAccounts(admin, identityId);

  // A ticket allows exactly "pick an account" (+1 spare use for creating one).
  const ticket = await issueTicket(admin, req, identityId, "account_select", 2);

  await recordAttempt(admin, emailHash, ip, "success");
  await audit(admin, req, {
    eventType: "login",
    outcome: "success",
    identityId,
    userId,
    metadata: { accounts: publicAccounts.length },
  });

  return jsonResponse(req, {
    ticket,
    accounts: publicAccounts,
    identity: {
      email: (identity?.alsamos_email as string | null) ?? email,
      migration_status: identity?.migration_status ?? "migrated",
      used: publicAccounts.length,
      max: (identity?.max_accounts as number | null) ?? MAX_ACCOUNTS,
    },
  });
});
