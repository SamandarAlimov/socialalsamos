// GET/POST /oauth-userinfo  (OpenID Connect UserInfo endpoint)
//
// Authorization: Bearer <oauth access token>
//
// Fixes applied:
//   * the old version queried public.profiles by a non-existent `user_id`
//     column and read first_name/last_name/email/phone fields that do not
//     exist, so every claim came back undefined;
//   * `sub` is per ACCOUNT (each linked account is a separate subject), and
//     email/phone come from the owning identity;
//   * claims are only returned for the scopes actually granted.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json(
        { error: "invalid_token", error_description: "Missing or invalid Authorization header" },
        401,
      );
    }

    const token = authHeader.slice(7).trim();

    const { data: accessToken } = await supabase
      .from("oauth_access_tokens")
      .select("user_id, scope, expires_at, revoked")
      .eq("token", token)
      .eq("revoked", false)
      .maybeSingle();

    if (!accessToken) {
      return json({ error: "invalid_token", error_description: "Invalid access token" }, 401);
    }

    if (new Date(accessToken.expires_at as string) < new Date()) {
      return json({ error: "invalid_token", error_description: "Access token has expired" }, 401);
    }

    const userId = accessToken.user_id as string;
    const scopes = String(accessToken.scope ?? "openid").split(/\s+/).filter(Boolean);

    // Profile of the specific account (profiles.id === auth.users.id).
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, updated_at")
      .eq("id", userId)
      .maybeSingle();

    // Identity that owns this account carries the email and the phone number.
    const { data: link } = await supabase
      .from("identity_accounts")
      .select("slot_no, identity_id")
      .eq("user_id", userId)
      .neq("status", "deleted")
      .maybeSingle();

    let identityEmail: string | null = null;
    let identityPhone: string | null = null;
    let phoneVerified = false;

    if (link?.identity_id) {
      const { data: identity } = await supabase
        .from("auth_identities")
        .select("alsamos_email, phone, phone_verified_at")
        .eq("id", link.identity_id as string)
        .maybeSingle();

      identityEmail = (identity?.alsamos_email as string | null) ?? null;
      identityPhone = (identity?.phone as string | null) ?? null;
      phoneVerified = !!identity?.phone_verified_at;
    }

    const { data: authUser } = await supabase.auth.admin.getUserById(userId);

    const userInfo: Record<string, unknown> = {
      // One subject per account, so apps can tell linked accounts apart.
      sub: userId,
    };

    if (scopes.includes("profile")) {
      userInfo.name = (profile?.display_name as string | null) ?? null;
      userInfo.preferred_username = (profile?.username as string | null) ?? null;
      userInfo.picture = (profile?.avatar_url as string | null) ?? null;
      userInfo.updated_at = profile?.updated_at ?? null;
      userInfo.alsamos_slot = (link?.slot_no as number | null) ?? null;
    }

    if (scopes.includes("email")) {
      userInfo.email = identityEmail ?? authUser?.user?.email ?? null;
      userInfo.email_verified = !!authUser?.user?.email_confirmed_at;
    }

    if (scopes.includes("phone")) {
      userInfo.phone_number = identityPhone;
      userInfo.phone_number_verified = phoneVerified;
    }

    return json(userInfo);
  } catch (error: unknown) {
    console.error("UserInfo error:", error);
    return json(
      {
        error: "server_error",
        error_description: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});
