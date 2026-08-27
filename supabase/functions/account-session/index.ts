// POST /account-session
//
// Step 2 of the login: exchange a ticket for a session of one of the
// identity's accounts.
//   in : { ticket, account_id, device_id? }
//   out: { token_hash, slot_no, account }
//
// The client turns token_hash into a real session with
//   supabase.auth.verifyOtp({ type: 'magiclink', token_hash })
// so no password or refresh token ever travels through application code.
//
// Only tickets with purpose "account_select" are accepted here: an
// "mfa_pending" ticket cannot be used to skip the second factor.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  audit,
  authError,
  consumeTicket,
  corsHeaders,
  jsonResponse,
  listIdentityAccounts,
  mintSessionToken,
  serviceClient,
  touchDevice,
} from "../_shared/auth-core.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return authError(req, "METHOD_NOT_ALLOWED", 405);
  }

  const admin = serviceClient();

  let ticket: unknown;
  let accountId: unknown;
  let clientDeviceId: unknown;
  try {
    const body = await req.json();
    ticket = body?.ticket;
    accountId = body?.account_id;
    clientDeviceId = body?.device_id;
  } catch {
    return authError(req, "INVALID_REQUEST", 400);
  }

  const consumed = await consumeTicket(admin, ticket, "account_select");
  if (!consumed) {
    await audit(admin, req, {
      eventType: "account_session",
      outcome: "blocked",
      reason: "invalid_or_expired_ticket",
    });
    return authError(req, "TICKET_INVALID", 401);
  }

  const { rows } = await listIdentityAccounts(admin, consumed.identityId);

  // No account_id -> use the primary account (slot 1).
  const target = typeof accountId === "string" && accountId
    ? rows.find((r) => r.id === accountId)
    : rows.find((r) => r.is_primary) ?? rows[0];

  if (!target) {
    await audit(admin, req, {
      eventType: "account_session",
      outcome: "failure",
      reason: "account_not_found",
      identityId: consumed.identityId,
    });
    return authError(req, "ACCOUNT_NOT_FOUND", 404);
  }

  const tokenHash = await mintSessionToken(admin, target.login_email);
  if (!tokenHash) {
    await audit(admin, req, {
      eventType: "account_session",
      outcome: "failure",
      reason: "mint_failed",
      identityId: consumed.identityId,
      userId: target.user_id,
    });
    return authError(req, "SESSION_MINT_FAILED", 500);
  }

  await admin
    .from("identity_accounts")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", target.id);

  // Register the device so the user can see and revoke this session later.
  await touchDevice(admin, req, {
    identityId: consumed.identityId,
    userId: target.user_id,
    slotNo: target.slot_no,
    clientDeviceId,
  });

  await audit(admin, req, {
    eventType: "account_session",
    outcome: "success",
    identityId: consumed.identityId,
    userId: target.user_id,
    metadata: { slot_no: target.slot_no },
  });

  return jsonResponse(req, {
    token_hash: tokenHash,
    slot_no: target.slot_no,
    account: {
      id: target.id,
      slot_no: target.slot_no,
      is_primary: target.is_primary,
    },
  });
});
