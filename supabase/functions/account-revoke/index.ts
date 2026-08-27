// POST /account-revoke
//
// Signs an account out everywhere (server-side refresh-token revocation) and,
// optionally, marks the linked account as deleted so its slot is freed.
//   in : { account_id, mode?: "signout" | "unlink" }
//   out: { ok: true, revoked_tokens }
//
// Only a caller holding a valid session of the same identity is authorised.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  audit,
  authError,
  corsHeaders,
  identityFromJwt,
  jsonResponse,
  listIdentityAccounts,
  serviceClient,
} from "../_shared/auth-core.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return authError(req, "METHOD_NOT_ALLOWED", 405);
  }

  const admin = serviceClient();
  const caller = await identityFromJwt(admin, req);
  if (!caller) {
    return authError(req, "UNAUTHORIZED", 401);
  }

  let accountId = "";
  let mode = "signout";
  try {
    const body = await req.json();
    accountId = typeof body?.account_id === "string" ? body.account_id : "";
    mode = body?.mode === "unlink" ? "unlink" : "signout";
  } catch {
    return authError(req, "INVALID_REQUEST", 400);
  }

  const { rows } = await listIdentityAccounts(admin, caller.identityId);
  const target = rows.find((r) => r.id === accountId);

  if (!target) {
    return authError(req, "ACCOUNT_NOT_FOUND", 404);
  }

  if (mode === "unlink" && target.is_primary) {
    // The primary account carries the identity itself.
    return authError(req, "PRIMARY_ACCOUNT_PROTECTED", 409);
  }

  const { data: revoked } = await admin.rpc("revoke_user_sessions", {
    p_user_id: target.user_id,
  });

  if (mode === "unlink") {
    await admin
      .from("identity_accounts")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", target.id);
  }

  await audit(admin, req, {
    eventType: mode === "unlink" ? "account_unlink" : "account_signout",
    outcome: "success",
    identityId: caller.identityId,
    userId: target.user_id,
    metadata: { slot_no: target.slot_no, by_user: caller.userId },
  });

  return jsonResponse(req, { ok: true, revoked_tokens: revoked ?? 0 });
});
