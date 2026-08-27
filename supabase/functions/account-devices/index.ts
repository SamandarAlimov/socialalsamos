// POST /account-devices
//
//   { action: "list" }                    -> { devices[] }
//   { action: "revoke", device_id }       -> { ok, revoked_tokens }
//   { action: "revoke_others", device_id? } -> { ok, revoked_devices }
//
// Requires a session JWT, verified manually with admin.getUser().
// Revoking a device also invalidates that account's refresh tokens through
// public.revoke_user_sessions(), so a stolen token cannot be replayed.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  audit,
  authError,
  corsHeaders,
  deviceHash,
  identityFromJwt,
  jsonResponse,
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

  let action = "";
  let deviceId: unknown = null;
  let clientDeviceId: unknown = null;
  try {
    const body = await req.json();
    action = typeof body?.action === "string" ? body.action : "list";
    deviceId = body?.device_id ?? null;
    clientDeviceId = body?.client_device_id ?? null;
  } catch {
    return authError(req, "INVALID_REQUEST", 400);
  }

  const caller = await identityFromJwt(admin, req);
  if (!caller) {
    return authError(req, "UNAUTHORIZED", 401);
  }

  if (action === "list") {
    const currentHash = await deviceHash(req, clientDeviceId);

    const { data: rows } = await admin
      .from("auth_devices")
      .select("id, user_id, slot_no, label, user_agent, ip, device_hash, created_at, last_seen_at")
      .eq("identity_id", caller.identityId)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false });

    const devices = (rows ?? []).map((row) => ({
      id: row.id as string,
      slot_no: row.slot_no as number,
      label: (row.label as string | null) ?? "Qurilma",
      user_agent: (row.user_agent as string | null) ?? null,
      ip: (row.ip as string | null) ?? null,
      created_at: row.created_at as string,
      last_seen_at: row.last_seen_at as string,
      is_current_account: (row.user_id as string) === caller.userId,
      is_current_device: (row.device_hash as string) === currentHash,
    }));

    return jsonResponse(req, { devices });
  }

  if (action === "revoke") {
    if (typeof deviceId !== "string" || !deviceId) {
      return authError(req, "INVALID_REQUEST", 400);
    }

    // Ownership check: the device must belong to the caller's identity.
    const { data: device } = await admin
      .from("auth_devices")
      .select("id, user_id, identity_id")
      .eq("id", deviceId)
      .eq("identity_id", caller.identityId)
      .is("revoked_at", null)
      .maybeSingle();

    if (!device) {
      return authError(req, "DEVICE_NOT_FOUND", 404);
    }

    await admin.rpc("revoke_auth_device", { _device_id: deviceId, _reason: "user" });

    // Invalidate the refresh tokens of that account.
    const { data: revokedTokens } = await admin.rpc("revoke_user_sessions", {
      _user_id: device.user_id,
    });
    await admin.auth.admin.signOut(device.user_id as string, "global").catch(() => {});

    await audit(admin, req, {
      eventType: "device_revoke",
      outcome: "success",
      identityId: caller.identityId,
      userId: device.user_id as string,
      metadata: { device_id: deviceId },
    });

    return jsonResponse(req, {
      ok: true,
      revoked_tokens: typeof revokedTokens === "number" ? revokedTokens : null,
    });
  }

  if (action === "revoke_others") {
    const keepHash = await deviceHash(req, clientDeviceId);

    const { data: rows } = await admin
      .from("auth_devices")
      .select("id, user_id, device_hash")
      .eq("identity_id", caller.identityId)
      .is("revoked_at", null);

    const targets = (rows ?? []).filter((row) => (row.device_hash as string) !== keepHash);

    for (const target of targets) {
      await admin.rpc("revoke_auth_device", { _device_id: target.id, _reason: "revoke_others" });
      await admin.rpc("revoke_user_sessions", { _user_id: target.user_id });
      await admin.auth.admin.signOut(target.user_id as string, "global").catch(() => {});
    }

    await audit(admin, req, {
      eventType: "device_revoke_others",
      outcome: "success",
      identityId: caller.identityId,
      userId: caller.userId,
      metadata: { revoked: targets.length },
    });

    return jsonResponse(req, { ok: true, revoked_devices: targets.length });
  }

  return authError(req, "INVALID_REQUEST", 400);
});
