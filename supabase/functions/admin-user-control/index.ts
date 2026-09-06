import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authError,
  corsHeaders,
  jsonResponse,
  normalizeEmail,
  serviceClient,
} from "../_shared/auth-core.ts";

type Action =
  | "get_auth_user"
  | "update_email"
  | "ban"
  | "unban"
  | "delete_user";

const ACTION_PERMISSION: Record<Action, string> = {
  get_auth_user: "admin.users.view",
  update_email: "admin.users.email.manage",
  ban: "admin.users.suspend",
  unban: "admin.users.suspend",
  delete_user: "admin.users.delete",
};

function bearer(req: Request): string | null {
  const value = req.headers.get("authorization") ?? "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function safeAuthUser(user: any) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    email_confirmed_at: user.email_confirmed_at ?? null,
    phone_confirmed_at: user.phone_confirmed_at ?? null,
    confirmed_at: user.confirmed_at ?? null,
    last_sign_in_at: user.last_sign_in_at ?? null,
    created_at: user.created_at ?? null,
    updated_at: user.updated_at ?? null,
    banned_until: user.banned_until ?? null,
    is_anonymous: Boolean(user.is_anonymous),
    providers: Array.isArray(user.identities)
      ? user.identities.map((identity: any) => identity?.provider).filter(Boolean)
      : [],
  };
}

async function isAuthorized(admin: any, actorId: string, permission: string) {
  const { data: legacy } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", actorId)
    .eq("role", "admin")
    .maybeSingle();
  if (legacy) return true;

  const { data: assignments, error: assignmentError } = await admin
    .from("admin_role_assignments")
    .select("role_key")
    .eq("user_id", actorId)
    .is("revoked_at", null);
  if (assignmentError || !assignments?.length) return false;

  const roles = assignments.map((row: any) => String(row.role_key));
  if (roles.includes("super_admin")) return true;

  const { data: permissions } = await admin
    .from("admin_role_permissions")
    .select("permission_key")
    .in("role_key", roles)
    .in("permission_key", [permission, "*"])
    .limit(1);
  return Boolean(permissions?.length);
}

async function isProtectedTarget(admin: any, actorId: string, targetUserId: string) {
  if (actorId === targetUserId) return true;
  const { data } = await admin
    .from("admin_role_assignments")
    .select("role_key")
    .eq("user_id", targetUserId)
    .eq("role_key", "super_admin")
    .is("revoked_at", null)
    .maybeSingle();
  return Boolean(data);
}

async function audit(
  admin: any,
  actorId: string,
  action: string,
  targetUserId: string,
  reason: string | null,
  before: Record<string, unknown> = {},
  after: Record<string, unknown> = {},
  metadata: Record<string, unknown> = {},
) {
  const { error } = await admin.from("admin_audit_log").insert({
    actor_id: actorId,
    target_user_id: targetUserId,
    action,
    entity_type: "auth_user",
    entity_id: targetUserId,
    reason,
    before_state: before,
    after_state: after,
    metadata,
  });
  if (error) console.error("admin audit failed", error.message);
}

function cleanReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim();
  return reason ? reason.slice(0, 1000) : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return authError(req, "METHOD_NOT_ALLOWED", 405);

  const token = bearer(req);
  if (!token) return authError(req, "UNAUTHORIZED", 401);

  const admin = serviceClient();
  const { data: actorResult, error: actorError } = await admin.auth.getUser(token);
  const actor = actorResult?.user;
  if (actorError || !actor?.id) return authError(req, "UNAUTHORIZED", 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return authError(req, "INVALID_REQUEST", 400);
  }

  const action = body?.action as Action;
  const targetUserId = typeof body?.target_user_id === "string" ? body.target_user_id.trim() : "";
  if (!ACTION_PERMISSION[action] || !targetUserId) return authError(req, "INVALID_REQUEST", 400);

  if (!(await isAuthorized(admin, actor.id, ACTION_PERMISSION[action]))) {
    return authError(req, "FORBIDDEN", 403);
  }

  const destructive = action === "ban" || action === "delete_user";
  const reason = cleanReason(body?.reason);
  if (destructive && !reason) return authError(req, "REASON_REQUIRED", 400);
  if (destructive && (await isProtectedTarget(admin, actor.id, targetUserId))) {
    return authError(req, "PROTECTED_USER", 409);
  }

  const { data: currentResult, error: currentError } = await admin.auth.admin.getUserById(targetUserId);
  const current = currentResult?.user;
  if (currentError || !current) return authError(req, "USER_NOT_FOUND", 404);
  const before = safeAuthUser(current) ?? {};

  if (action === "get_auth_user") {
    await audit(admin, actor.id, "auth.user.read", targetUserId, reason, {}, {}, { source: "admin-user-control" });
    return jsonResponse(req, { user: safeAuthUser(current) });
  }

  if (action === "update_email") {
    const email = normalizeEmail(body?.email);
    if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
      return authError(req, "INVALID_EMAIL", 400);
    }
    if (!reason) return authError(req, "REASON_REQUIRED", 400);

    const { data, error } = await admin.auth.admin.updateUserById(targetUserId, {
      email,
      email_confirm: Boolean(body?.email_confirm ?? false),
    });
    if (error) {
      await audit(admin, actor.id, "auth.email.update.failed", targetUserId, reason, before, {}, { error: error.message });
      return authError(req, "EMAIL_UPDATE_FAILED", 409, error.message);
    }
    const after = safeAuthUser(data.user) ?? {};
    await audit(admin, actor.id, "auth.email.update", targetUserId, reason, before, after);
    return jsonResponse(req, { user: after });
  }

  if (action === "ban") {
    const duration = typeof body?.duration === "string" && /^\d+[smhd]$/.test(body.duration)
      ? body.duration
      : "876000h";
    const { data, error } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: duration });
    if (error) {
      await audit(admin, actor.id, "auth.user.ban.failed", targetUserId, reason, before, {}, { error: error.message });
      return authError(req, "BAN_FAILED", 409, error.message);
    }
    const after = safeAuthUser(data.user) ?? {};
    await audit(admin, actor.id, "auth.user.ban", targetUserId, reason, before, after, { duration });
    return jsonResponse(req, { user: after });
  }

  if (action === "unban") {
    const { data, error } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: "none" });
    if (error) return authError(req, "UNBAN_FAILED", 409, error.message);
    const after = safeAuthUser(data.user) ?? {};
    await audit(admin, actor.id, "auth.user.unban", targetUserId, reason, before, after);
    return jsonResponse(req, { user: after });
  }

  // Hard deletion is intentionally a staged operation. The DB creates an
  // immutable deletion job before Auth is touched, so partial failures remain visible.
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );

  const { data: jobId, error: jobError } = await caller.rpc("admin_prepare_user_deletion_v3", {
    p_user_id: targetUserId,
    p_reason: reason,
  });
  if (jobError || !jobId) return authError(req, "DELETE_PREPARE_FAILED", 409, jobError?.message);

  await admin.from("admin_user_deletion_jobs").update({ status: "auth_deleting", updated_at: new Date().toISOString() }).eq("id", jobId);
  const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId, false);

  await caller.rpc("admin_finalize_user_deletion_v3", {
    p_job_id: jobId,
    p_success: !deleteError,
    p_error: deleteError?.message ?? null,
  });

  if (deleteError) return authError(req, "DELETE_FAILED", 409, deleteError.message);
  return jsonResponse(req, { deleted: true, job_id: jobId });
});
