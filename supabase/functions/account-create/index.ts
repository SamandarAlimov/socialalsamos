// POST /account-create
//
// Creates an additional superapp account (slot 2..10) under the caller's
// identity. Authorisation is either an active session JWT or a fresh login
// ticket. The 10-account cap is enforced by the database trigger as well.
//   in : { username, display_name?, ticket? }
//   out: { account, token_hash, slot_no }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  accountEmailFor,
  audit,
  authError,
  consumeTicket,
  corsHeaders,
  identityFromJwt,
  isUsernameValid,
  jsonResponse,
  listIdentityAccounts,
  MAX_ACCOUNTS,
  mintSessionToken,
  serviceClient,
  unusablePassword,
} from "../_shared/auth-core.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return authError(req, "METHOD_NOT_ALLOWED", 405);
  }

  const admin = serviceClient();

  let username = "";
  let displayName = "";
  let ticket: unknown;
  try {
    const body = await req.json();
    username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
    displayName = typeof body?.display_name === "string" ? body.display_name.trim() : "";
    ticket = body?.ticket;
  } catch {
    return authError(req, "INVALID_REQUEST", 400);
  }

  // --- authorise -----------------------------------------------------------
  const viaJwt = await identityFromJwt(admin, req);
  const identityId = viaJwt?.identityId ?? (await consumeTicket(admin, ticket))?.identityId;

  if (!identityId) {
    return authError(req, "UNAUTHORIZED", 401);
  }

  // --- validate ------------------------------------------------------------
  if (!isUsernameValid(username)) {
    return authError(req, "USERNAME_INVALID", 400);
  }

  const { data: taken } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (taken) {
    return authError(req, "USERNAME_TAKEN", 409);
  }

  const { data: identity } = await admin
    .from("auth_identities")
    .select("id, max_accounts")
    .eq("id", identityId)
    .single();

  const limit = (identity?.max_accounts as number | null) ?? MAX_ACCOUNTS;
  const { rows } = await listIdentityAccounts(admin, identityId);

  if (rows.length >= limit) {
    await audit(admin, req, {
      eventType: "account_create",
      outcome: "blocked",
      reason: "limit_reached",
      identityId,
      metadata: { used: rows.length, max: limit },
    });
    return authError(req, "ACCOUNT_LIMIT_REACHED", 409);
  }

  // Lowest free slot.
  const used = new Set(rows.map((r) => r.slot_no));
  let slot = 0;
  for (let i = 1; i <= MAX_ACCOUNTS; i++) {
    if (!used.has(i)) {
      slot = i;
      break;
    }
  }
  if (slot === 0) {
    return authError(req, "ACCOUNT_LIMIT_REACHED", 409);
  }

  // --- create --------------------------------------------------------------
  const loginEmail = accountEmailFor(username);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: loginEmail,
    password: unusablePassword(), // never handed out; sessions are minted only
    email_confirm: true,
    user_metadata: {
      username,
      display_name: displayName || username,
      identity_id: identityId,
      slot_no: slot,
      alsamos_linked_account: true,
    },
  });

  if (createError || !created?.user) {
    await audit(admin, req, {
      eventType: "account_create",
      outcome: "failure",
      reason: createError?.message ?? "create_failed",
      identityId,
    });
    return authError(req, "ACCOUNT_CREATE_FAILED", 500);
  }

  // The on_auth_user_created_identity trigger links the row; make sure it did.
  const { data: linked } = await admin
    .from("identity_accounts")
    .select("id, slot_no")
    .eq("user_id", created.user.id)
    .maybeSingle();

  if (!linked) {
    const { error: linkError } = await admin.from("identity_accounts").insert({
      identity_id: identityId,
      user_id: created.user.id,
      slot_no: slot,
      login_email: loginEmail,
      is_primary: false,
    });

    if (linkError) {
      // Roll back: an orphan auth user must never survive.
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      await audit(admin, req, {
        eventType: "account_create",
        outcome: "failure",
        reason: linkError.message,
        identityId,
      });
      return authError(
        req,
        linkError.message.includes("ACCOUNT_LIMIT_REACHED")
          ? "ACCOUNT_LIMIT_REACHED"
          : "ACCOUNT_CREATE_FAILED",
        409,
      );
    }
  }

  const finalSlot = (linked?.slot_no as number | undefined) ?? slot;
  const tokenHash = await mintSessionToken(admin, loginEmail);

  await audit(admin, req, {
    eventType: "account_create",
    outcome: "success",
    identityId,
    userId: created.user.id,
    metadata: { slot_no: finalSlot, username },
  });

  return jsonResponse(req, {
    account: {
      id: linked?.id ?? null,
      user_id: created.user.id,
      slot_no: finalSlot,
      username,
      display_name: displayName || username,
      is_primary: false,
    },
    slot_no: finalSlot,
    token_hash: tokenHash,
  }, 201);
});
