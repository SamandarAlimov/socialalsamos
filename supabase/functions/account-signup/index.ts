import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FN = "account-signup";
const LIMIT = 10;
const MANAGED_MARKER = "account-signup-v2";

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  let allowed = !origin;
  try {
    const u = new URL(origin);
    const h = u.hostname.toLowerCase();
    allowed =
      (u.protocol === "https:" &&
        (h === "alsamos.com" ||
          h === "www.alsamos.com" ||
          h.endsWith(".alsamos.com") ||
          h.endsWith(".vercel.app") ||
          h.endsWith(".lovable.app") ||
          h.endsWith(".lovableproject.com"))) ||
      (u.protocol === "http:" && (h === "localhost" || h === "127.0.0.1"));
  } catch {}
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
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function hash(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeEmail(v: unknown) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}
function normalizeUsername(v: unknown) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}
function normalizePhone(v: unknown) {
  if (typeof v !== "string") return "";
  const digits = v.replace(/[^0-9]/g, "");
  return digits ? `+${digits}` : "";
}

function safeAuthError(error: any) {
  return {
    message: typeof error?.message === "string" ? error.message.slice(0, 300) : null,
    code: typeof error?.code === "string" ? error.code.slice(0, 100) : null,
    status: typeof error?.status === "number" ? error.status : null,
    name: typeof error?.name === "string" ? error.name.slice(0, 100) : null,
  };
}

function classifyAuthError(error: any) {
  const d = safeAuthError(error);
  const text = `${d.code ?? ""} ${d.message ?? ""}`.toLowerCase();
  if (/already|registered|exists|user_already_exists/.test(text)) {
    return { status: 409, error: "ACCOUNT_EXISTS", message: "Bu email bilan akkaunt allaqachon mavjud." };
  }
  if (/weak.?password|password.*weak|password.*least|password.*character|password.*pwn|password.*comprom/.test(text)) {
    return { status: 400, error: "WEAK_PASSWORD", message: "Parol xavfsizlik talablariga javob bermaydi. Kuchliroq parol kiriting." };
  }
  if (/invalid.*email|email.*invalid/.test(text)) {
    return { status: 400, error: "INVALID_EMAIL", message: "Email manzilini to'g'ri kiriting." };
  }
  if (d.status === 429 || /rate.?limit|too many/.test(text)) {
    return { status: 429, error: "TOO_MANY_ATTEMPTS", message: "Juda ko'p urinish bo'ldi. Birozdan so'ng qayta urinib ko'ring." };
  }
  return { status: 500, error: "SIGNUP_FAILED", message: "Akkaunt yaratilmadi. Qaytadan urinib ko'ring." };
}

function mapPreflight(code: string, reason?: string | null) {
  if (code === "EMAIL_TAKEN") return { status: 409, error: "ACCOUNT_EXISTS", message: "Bu email bilan akkaunt allaqachon mavjud." };
  if (code === "PHONE_TAKEN") return { status: 409, error: "PHONE_TAKEN", message: "Bu telefon raqami allaqachon ishlatilgan." };
  if (code === "INVALID_EMAIL") return { status: 400, error: "INVALID_EMAIL", message: "Email manzilini to'g'ri kiriting." };
  if (code === "INVALID_PHONE") return { status: 400, error: "PHONE_INVALID", message: "Telefon raqamni xalqaro formatda kiriting." };
  if (code === "USERNAME_UNAVAILABLE") {
    const reserved = typeof reason === "string" && reason.startsWith("reserved");
    return {
      status: 409,
      error: reserved ? "USERNAME_RESERVED" : "USERNAME_TAKEN",
      message: reserved ? "Bu username rezerv qilingan. Boshqa username tanlang." : "Bu username band. Boshqa username tanlang.",
    };
  }
  return { status: 500, error: "SIGNUP_FAILED", message: "Ro'yxatdan o'tish tekshiruvi bajarilmadi." };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return out(req, { error: "METHOD_NOT_ALLOWED" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return out(req, { error: "SERVER_ERROR", message: "Auth xizmati sozlanmagan." }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
  const ipHash = await hash(`${FN}:${ip}`);
  const since = new Date(Date.now() - 3600000).toISOString();
  const { count, error: usageError } = await admin
    .from("function_usage")
    .select("id", { count: "exact", head: true })
    .eq("function_name", FN)
    .eq("ip_hash", ipHash)
    .in("outcome", ["allowed", "blocked"])
    .gte("created_at", since);
  if (usageError) return out(req, { error: "SERVER_ERROR", message: "Ro'yxatdan o'tish xizmati vaqtincha mavjud emas." }, 500);
  if ((count ?? 0) >= LIMIT) return out(req, { error: "TOO_MANY_ATTEMPTS", message: "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring." }, 429);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return out(req, { error: "INVALID_REQUEST", message: "Ro'yxatdan o'tish ma'lumotlari topilmadi." }, 400);

  const email = normalizeEmail((body as any).email);
  const username = normalizeUsername((body as any).username);
  const phone = normalizePhone((body as any).phone);
  const displayName = typeof (body as any).displayName === "string" ? (body as any).displayName.trim().slice(0, 100) : username;
  const password = typeof (body as any).password === "string" ? (body as any).password : "";
  const tosVersion = typeof (body as any).tosVersion === "string" ? (body as any).tosVersion.trim().slice(0, 40) : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || email.endsWith("@accounts.alsamos.com")) {
    return out(req, { error: "INVALID_EMAIL", message: "Email manzilini to'g'ri kiriting." }, 400);
  }
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) return out(req, { error: "PHONE_INVALID", message: "Telefon raqamni xalqaro formatda kiriting." }, 400);
  if (!/^[a-z0-9_]{3,32}$/.test(username)) return out(req, { error: "USERNAME_INVALID", message: "Username 3-32 belgi, faqat a-z, 0-9 va _ bo'lishi kerak." }, 400);
  if (password.length < 10 || password.length > 128) return out(req, { error: "INVALID_PASSWORD", message: "Parol kamida 10 ta belgidan iborat bo'lishi kerak." }, 400);
  if ((body as any).acceptedTerms !== true) return out(req, { error: "TERMS_REQUIRED", message: "Foydalanish shartlarini qabul qilish talab etiladi." }, 400);

  await admin.from("function_usage").insert({
    function_name: FN,
    user_id: null,
    ip_hash: ipHash,
    outcome: "allowed",
    reason: null,
    mode: "on",
    metadata: { stage: "signup_attempt" },
  });

  const { data: preflight, error: preflightError } = await admin.rpc("signup_preflight", {
    p_email: email,
    p_username: username,
    p_phone: phone,
    p_user_id: null,
  });

  if (preflightError) {
    await admin.from("function_usage").insert({
      function_name: FN, user_id: null, ip_hash: ipHash, outcome: "would_block", reason: "SIGNUP_PREFLIGHT_FAILED", mode: "log",
      metadata: { stage: "preflight", code: preflightError.code ?? null, message: preflightError.message?.slice(0, 250) ?? null },
    });
    return out(req, { error: "SERVER_ERROR", message: "Ro'yxatdan o'tish tekshiruvi bajarilmadi." }, 500);
  }

  if (!preflight?.ok) {
    const mapped = mapPreflight(String(preflight?.code ?? ""), preflight?.reason ?? null);
    return out(req, { error: mapped.error, message: mapped.message }, mapped.status);
  }

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      display_name: displayName || username,
      phone,
      tos_version: tosVersion || null,
      signup_managed: MANAGED_MARKER,
    },
  });

  if (authError || !created?.user) {
    const d = safeAuthError(authError);
    const mapped = classifyAuthError(authError);
    await admin.from("function_usage").insert({
      function_name: FN, user_id: null, ip_hash: ipHash, outcome: "would_block", reason: "AUTH_CREATE_FAILED", mode: "log",
      metadata: { stage: "auth_create", auth_error: d, classified_error: mapped.error },
    });
    return out(req, { error: mapped.error, message: mapped.message }, mapped.status);
  }

  const userId = created.user.id;
  const { data: finalized, error: finalizeError } = await admin.rpc("finalize_primary_signup", {
    p_user_id: userId,
    p_email: email,
    p_username: username,
    p_display_name: displayName || username,
    p_phone: phone,
    p_tos_version: tosVersion,
  });

  if (finalizeError || !finalized?.ok) {
    const code = String(finalized?.code ?? "FINALIZE_FAILED");
    const reason = typeof finalized?.reason === "string" ? finalized.reason : null;
    const mapped = mapPreflight(code, reason);

    await admin.auth.admin.deleteUser(userId);
    await admin.from("function_usage").insert({
      function_name: FN,
      user_id: null,
      ip_hash: ipHash,
      outcome: "would_block",
      reason: "SIGNUP_FINALIZE_FAILED",
      mode: "log",
      metadata: {
        stage: "finalize",
        code,
        reason,
        sqlstate: finalized?.sqlstate ?? finalizeError?.code ?? null,
        constraint: finalized?.constraint ?? null,
      },
    });

    return out(req, { error: mapped.error, message: mapped.message }, mapped.status);
  }

  return out(req, { ok: true, user_id: userId, email_confirmed: true, phone_verified: false }, 201);
});
