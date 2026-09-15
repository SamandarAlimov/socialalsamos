import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  let allowed = !origin;

  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    allowed =
      (url.protocol === "https:" &&
        (host === "alsamos.com" ||
          host === "www.alsamos.com" ||
          host.endsWith(".alsamos.com") ||
          host.endsWith(".vercel.app"))) ||
      (url.protocol === "http:" && (host === "localhost" || host === "127.0.0.1"));
  } catch {
    // Keep the default for requests without a browser origin.
  }

  return {
    "Access-Control-Allow-Origin": allowed ? origin || "*" : "https://alsamos.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function out(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function bearerToken(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

async function purgeSoftDeletedAccount(admin: ReturnType<typeof createClient>, userId: string) {
  const personalTables: Array<[string, string]> = [
    ["auth_devices", "user_id"],
    ["privacy_settings", "user_id"],
    ["privacy_zones", "user_id"],
    ["location_history", "user_id"],
    ["location_share_tokens", "user_id"],
    ["frequent_places", "user_id"],
    ["saved_places", "user_id"],
    ["saved_place_lists", "user_id"],
    ["saved_routes", "user_id"],
    ["route_history", "user_id"],
    ["search_history", "user_id"],
    ["search_activity_events", "user_id"],
    ["drafts", "user_id"],
    ["message_drafts", "user_id"],
    ["user_preferences", "user_id"],
    ["user_activity_preferences", "user_id"],
    ["user_recovery_codes", "user_id"],
    ["user_security", "user_id"],
    ["user_totp", "user_id"],
    ["user_push_tokens", "user_id"],
    ["user_sessions", "user_id"],
    ["user_settings", "user_id"],
  ];

  await Promise.allSettled(
    personalTables.map(([table, column]) => admin.from(table).delete().eq(column, userId)),
  );

  const { error: profileDeleteError } = await admin.from("profiles").delete().eq("id", userId);
  if (!profileDeleteError) return;

  const now = new Date().toISOString();
  const { error: anonymizeError } = await admin
    .from("profiles")
    .update({
      username: null,
      display_name: "Deleted account",
      avatar_url: null,
      cover_url: null,
      bio: null,
      location: null,
      website: null,
      country: null,
      birth_date: null,
      is_verified: false,
      is_online: false,
      is_admin: false,
      role: "user",
      preferences: {},
      signatures: {},
      email_filters: {},
      notification_preferences: {},
      last_seen: now,
      last_seen_at: now,
    })
    .eq("id", userId);

  if (anonymizeError) {
    console.error("[account-delete] profile anonymization failed", anonymizeError.message);
    throw new Error("PROFILE_CLEANUP_FAILED");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req) });
  }

  if (req.method !== "POST") {
    return out(req, { error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || (body as { confirm?: unknown }).confirm !== "DELETE") {
    return out(req, { error: "CONFIRMATION_REQUIRED", message: "Hisobni o‘chirish tasdiqlanmadi." }, 400);
  }

  const token = bearerToken(req);
  if (!token) {
    return out(req, { error: "AUTH_REQUIRED", message: "Hisobni o‘chirish uchun qaytadan kiring." }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    return out(req, { error: "SERVER_ERROR", message: "Hisob xizmati sozlanmagan." }, 500);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) {
    return out(req, { error: "INVALID_SESSION", message: "Sessiya eskirgan. Qaytadan kiring va yana urinib ko‘ring." }, 401);
  }

  const { error: hardDeleteError } = await admin.auth.admin.deleteUser(user.id, false);
  if (!hardDeleteError) {
    return out(req, { ok: true, deletion: "hard" });
  }

  console.warn("[account-delete] hard delete blocked; using retained-record fallback", hardDeleteError.message);

  const { error: softDeleteError } = await admin.auth.admin.deleteUser(user.id, true);
  if (softDeleteError) {
    console.error("[account-delete] soft delete failed", softDeleteError.message);
    return out(req, { error: "DELETE_FAILED", message: "Hisobni o‘chirib bo‘lmadi. Qaytadan urinib ko‘ring." }, 500);
  }

  try {
    await purgeSoftDeletedAccount(admin, user.id);
  } catch (error) {
    console.error("[account-delete] cleanup failed", error);
    return out(req, { error: "DELETE_CLEANUP_FAILED", message: "Hisob yopildi, lekin ma’lumotlarni tozalash yakunlanmadi." }, 500);
  }

  return out(req, { ok: true, deletion: "soft-anonymized" });
});
