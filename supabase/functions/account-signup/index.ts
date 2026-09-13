// POST /account-signup
//
// First-party registration for Alsamos' synthetic @alsamos.com identity
// namespace. These addresses are identifiers, not mailboxes, so registration
// MUST NOT depend on a confirmation email.
//
// action=signup (default):
//   creates a confirmed Supabase Auth user server-side and returns a one-time
//   token hash that the browser exchanges for a normal session.
//
// action=repair:
//   repairs an account that was created while hosted Confirm Email was
//   accidentally enabled. Ownership is proven by a service_role-only SQL
//   password verifier before the account is confirmed. This path is also used
//   transparently by login when GoTrue reports "Email not confirmed".

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  audit,
  authError,
  clientIp,
  corsHeaders,
  isIdentityEmail,
  isRateLimited,
  isUsernameValid,
  jsonResponse,
  mintSessionToken,
  normalizeEmail,
  recordAttempt,
  serviceClient,
  sha256,
} from "../_shared/auth-core.ts";

type SignupAction = "signup" | "repair";

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const phone = `+${digits}`;
  return /^\+[1-9][0-9]{7,14}$/.test(phone) ? phone : null;
}

async function verifyExistingPassword(
  admin: ReturnType<typeof serviceClient>,
  email: string,
  password: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc("verify_alsamos_identity_password", {
    _email: email,
    _password: password,
  });

  if (error) {
    console.error("verify_alsamos_identity_password failed", error.message);
    return null;
  }

  return typeof data === "string" && data ? data : null;
}

async function confirmAndMint(
  admin: ReturnType<typeof serviceClient>,
  userId: string,
  email: string,
): Promise<string | null> {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });
  if (error) {
    console.error("Failed to confirm Alsamos identity", error.message);
    return null;
  }
  return mintSessionToken(admin, email);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return authError(req, "METHOD_NOT_ALLOWED", 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return authError(req, "INVALID_REQUEST", 400);
  }

  const action: SignupAction = body.action === "repair" ? "repair" : "signup";
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const username = typeof body.username === "string"
    ? body.username.trim().toLowerCase()
    : email.split("@")[0] ?? "";
  const displayName = typeof body.display_name === "string"
    ? body.display_name.trim().slice(0, 100)
    : username;
  const phone = normalizePhone(body.phone);
  const tosVersion = typeof body.tos_version === "string"
    ? body.tos_version.trim().slice(0, 50)
    : null;

  if (!isIdentityEmail(email) || email.endsWith("@accounts.alsamos.com") || password.length < 10) {
    return authError(req, "INVALID_REQUEST", 400);
  }
  if (action === "signup" && !isUsernameValid(username)) {
    return authError(req, "USERNAME_INVALID", 400);
  }
  if (body.phone && !phone) {
    return authError(req, "PHONE_INVALID", 400);
  }

  const admin = serviceClient();
  const ip = clientIp(req);
  const emailHash = await sha256(email);

  // The repair path accepts a password before a session exists, so it must be
  // protected against online guessing. Reuse the same server-side counters as
  // login; no account existence information is returned.
  if (await isRateLimited(admin, emailHash, ip)) {
    return authError(req, "TOO_MANY_ATTEMPTS", 429);
  }

  if (action === "repair") {
    const userId = await verifyExistingPassword(admin, email, password);
    if (!userId) {
      await recordAttempt(admin, emailHash, ip, "failure");
      await audit(admin, req, {
        eventType: "identity_confirmation_repair",
        outcome: "failure",
        reason: "ownership_proof_failed",
      });
      return authError(req, "INVALID_CREDENTIALS", 401);
    }

    const tokenHash = await confirmAndMint(admin, userId, email);
    if (!tokenHash) {
      return authError(req, "SESSION_MINT_FAILED", 500);
    }

    await recordAttempt(admin, emailHash, ip, "success");
    await audit(admin, req, {
      eventType: "identity_confirmation_repair",
      outcome: "success",
      userId,
    });

    return jsonResponse(req, {
      token_hash: tokenHash,
      repaired: true,
      user_id: userId,
    });
  }

  // Username is public profile data, so returning USERNAME_TAKEN here does not
  // reveal a secret login identifier.
  const { data: taken } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (taken) {
    return authError(req, "USERNAME_TAKEN", 409);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      display_name: displayName || username,
      phone,
      tos_version: tosVersion,
      alsamos_identity: true,
    },
  });

  let userId = created?.user?.id ?? null;
  let repaired = false;

  if (createError || !userId) {
    // A previous browser build may already have created this exact identity as
    // an unconfirmed user. Never confirm it merely because it exists: require
    // proof of the original password first.
    userId = await verifyExistingPassword(admin, email, password);
    if (!userId) {
      await recordAttempt(admin, emailHash, ip, "failure");
      await audit(admin, req, {
        eventType: "identity_signup",
        outcome: "failure",
        reason: "create_or_ownership_proof_failed",
      });
      return authError(req, "ACCOUNT_CREATE_FAILED", 409);
    }
    repaired = true;
  }

  let tokenHash: string | null;
  if (repaired) {
    tokenHash = await confirmAndMint(admin, userId, email);
  } else {
    tokenHash = await mintSessionToken(admin, email);
  }

  if (!tokenHash) {
    return authError(req, "SESSION_MINT_FAILED", 500);
  }

  await recordAttempt(admin, emailHash, ip, "success");
  await audit(admin, req, {
    eventType: repaired ? "identity_signup_repair" : "identity_signup",
    outcome: "success",
    userId,
    metadata: { username },
  });

  return jsonResponse(req, {
    token_hash: tokenHash,
    repaired,
    user_id: userId,
  }, repaired ? 200 : 201);
});
