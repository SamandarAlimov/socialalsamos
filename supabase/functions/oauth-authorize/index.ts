// POST /oauth-authorize
//
// Two actions:
//   { action: "accounts", client_id }  -> { accounts[], client }
//   { client_id, redirect_uri, scope, state, code_challenge,
//     code_challenge_method, account_id? } -> { code, state, redirect_uri }
//
// SECURITY FIX: this endpoint used to take `user_id` from the request body,
// which allowed anybody to mint an authorization code for ANY user. The
// subject is now derived from the caller's session JWT, and `account_id` may
// only name an account owned by the caller's own identity - which is exactly
// what makes the "choose an account" step safe.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  audit,
  corsHeaders,
  identityFromJwt,
  jsonResponse,
  listIdentityAccounts,
  serviceClient,
} from "../_shared/auth-core.ts";

type OAuthClient = {
  client_id: string;
  client_name?: string | null;
  logo_url?: string | null;
  redirect_uris: string[];
  allowed_scopes: string[];
};

function oauthError(
  req: Request,
  error: string,
  description: string,
  status = 400,
): Response {
  return jsonResponse(req, { error, error_description: description }, status);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return oauthError(req, "invalid_request", "Only POST is supported", 405);
  }

  const admin = serviceClient();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return oauthError(req, "invalid_request", "Malformed JSON body");
  }

  const action = typeof body.action === "string" ? body.action : "authorize";
  const clientId = typeof body.client_id === "string" ? body.client_id : "";
  const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
  const scope = typeof body.scope === "string" && body.scope ? body.scope : "openid";
  const state = typeof body.state === "string" ? body.state : null;
  const codeChallenge = typeof body.code_challenge === "string" ? body.code_challenge : null;
  const codeChallengeMethod =
    typeof body.code_challenge_method === "string" ? body.code_challenge_method : null;
  const accountId = typeof body.account_id === "string" ? body.account_id : null;

  // ---- The end user must be signed in -------------------------------
  const caller = await identityFromJwt(admin, req);
  if (!caller) {
    return oauthError(req, "login_required", "A valid user session is required", 401);
  }

  if (!clientId) {
    return oauthError(req, "invalid_request", "Missing client_id");
  }

  const { data: clientRow } = await admin
    .from("oauth_clients")
    .select("client_id, client_name, logo_url, redirect_uris, allowed_scopes")
    .eq("client_id", clientId)
    .eq("is_active", true)
    .maybeSingle();

  const client = clientRow as OAuthClient | null;
  if (!client) {
    return oauthError(req, "invalid_client", "Client not found or inactive", 401);
  }

  // ---- Account picker ------------------------------------------------
  // The consent screen calls this first to show which of the identity's
  // accounts can be shared with the app.
  if (action === "accounts") {
    const { publicAccounts } = await listIdentityAccounts(admin, caller.identityId);

    return jsonResponse(req, {
      accounts: publicAccounts.map((account) => ({
        ...account,
        is_current: false,
      })),
      current_user_id: caller.userId,
      client: {
        client_id: client.client_id,
        client_name: client.client_name ?? client.client_id,
        logo_url: client.logo_url ?? null,
      },
    });
  }

  // ---- Authorization code -------------------------------------------
  if (!redirectUri) {
    return oauthError(req, "invalid_request", "Missing redirect_uri");
  }

  // Exact match only: no prefix or wildcard matching (open-redirect safety).
  if (!Array.isArray(client.redirect_uris) || !client.redirect_uris.includes(redirectUri)) {
    return oauthError(req, "invalid_request", "Invalid redirect_uri");
  }

  const requestedScopes = scope.split(/\s+/).filter(Boolean);
  const invalidScopes = requestedScopes.filter(
    (s) => !(client.allowed_scopes ?? []).includes(s),
  );
  if (invalidScopes.length > 0) {
    return oauthError(req, "invalid_scope", `Invalid scopes: ${invalidScopes.join(", ")}`);
  }

  // PKCE: if a challenge is supplied it must be S256 (plain is not accepted).
  if (codeChallenge && codeChallengeMethod !== "S256") {
    return oauthError(
      req,
      "invalid_request",
      "Only code_challenge_method=S256 is supported",
    );
  }

  // Which account is being shared? Default: the currently active one.
  let subjectUserId = caller.userId;

  if (accountId) {
    const { rows } = await listIdentityAccounts(admin, caller.identityId);
    const target = rows.find((row) => row.id === accountId);

    if (!target) {
      // The account does not exist or is not owned by this identity.
      await audit(admin, req, {
        eventType: "oauth_authorize",
        outcome: "blocked",
        reason: "account_not_owned",
        identityId: caller.identityId,
        userId: caller.userId,
        metadata: { client_id: clientId },
      });
      return oauthError(req, "access_denied", "Account not available", 403);
    }

    subjectUserId = target.user_id;
  }

  const { data: authCode, error: codeError } = await admin
    .from("oauth_authorization_codes")
    .insert({
      client_id: clientId,
      user_id: subjectUserId,
      redirect_uri: redirectUri,
      scope: requestedScopes.join(" ") || "openid",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
    })
    .select("code")
    .single();

  if (codeError || !authCode) {
    console.error("Error creating authorization code:", codeError?.message);
    return oauthError(req, "server_error", "Failed to generate authorization code", 500);
  }

  await audit(admin, req, {
    eventType: "oauth_authorize",
    outcome: "success",
    identityId: caller.identityId,
    userId: subjectUserId,
    metadata: {
      client_id: clientId,
      scopes: requestedScopes,
      account_switched: subjectUserId !== caller.userId,
    },
  });

  return jsonResponse(req, {
    code: authCode.code,
    state,
    redirect_uri: redirectUri,
  });
});
