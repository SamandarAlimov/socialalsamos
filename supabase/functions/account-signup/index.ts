import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FN = "account-signup";
const LIMIT = 10;

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  let allowed = !origin;
  try {
    const u = new URL(origin);
    const h = u.hostname.toLowerCase();
    allowed = (u.protocol === "https:" && (h === "alsamos.com" || h.endsWith(".alsamos.com") || h.endsWith(".vercel.app") || h.endsWith(".lovable.app") || h.endsWith(".lovableproject.com"))) || (u.protocol === "http:" && (h === "localhost" || h === "127.0.0.1"));
  } catch {}
  return {
    "Access-Control-Allow-Origin": allowed ? (origin || "*") : "https://alsamos.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function out(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function hash(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
  const { count, error: usageError } = await admin.from("function_usage").select("id", { count: "exact", head: true }).eq("function_name", FN).eq("ip_hash", ipHash).in("outcome", ["allowed", "blocked"]).gte("created_at", since);
  if (usageError) return out(req, { error: "SERVER_ERROR", message: "Ro'yxatdan o'tish xizmati vaqtincha mavjud emas." }, 500);
  if ((count ?? 0) >= LIMIT) return out(req, { error: "TOO_MANY_ATTEMPTS", message: "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring." }, 429);
  await admin.from("function_usage").insert({ function_name: FN, user_id: null, ip_hash: ipHash, outcome: "allowed", reason: null, mode: "on", metadata: { stage: "signup_attempt" } });

  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return out(req, { error: "INVALID_REQUEST" }, 400);
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const username = typeof b.username === "string" ? b.username.trim().toLowerCase() : "";
  const digits = typeof b.phone === "string" ? b.phone.replace(/[^0-9]/g, "") : "";
  const phone = digits ? `+${digits}` : "";
  const displayName = typeof b.displayName === "string" ? b.displayName.trim().slice(0, 100) : username;
  const password = typeof b.password === "string" ? b.password : "";
  const tosVersion = typeof b.tosVersion === "string" ? b.tosVersion.trim().slice(0, 40) : null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || email.endsWith("@accounts.alsamos.com")) return out(req, { error: "INVALID_REQUEST", message: "Email manzilini to'g'ri kiriting." }, 400);
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) return out(req, { error: "INVALID_REQUEST", message: "Telefon raqamni xalqaro formatda kiriting." }, 400);
  if (!/^[a-z0-9_]{3,30}$/.test(username)) return out(req, { error: "INVALID_REQUEST", message: "Username 3-30 belgi, faqat a-z, 0-9 va _ bo'lishi kerak." }, 400);
  if (password.length < 10 || password.length > 128) return out(req, { error: "INVALID_REQUEST", message: "Parol kamida 10 ta belgidan iborat bo'lishi kerak." }, 400);
  if (b.acceptedTerms !== true) return out(req, { error: "INVALID_REQUEST", message: "Foydalanish shartlarini qabul qilish talab etiladi." }, 400);

  const { data: conflict, error: conflictError } = await admin.rpc("signup_conflict_code", { p_email: email, p_username: username, p_phone: phone });
  if (conflictError) return out(req, { error: "SERVER_ERROR", message: "Ro'yxatdan o'tish tekshiruvi bajarilmadi." }, 500);
  if (conflict === "EMAIL_TAKEN") return out(req, { error: "ACCOUNT_EXISTS", message: "Bu email bilan akkaunt allaqachon mavjud." }, 409);
  if (conflict === "USERNAME_TAKEN") return out(req, { error: "USERNAME_TAKEN", message: "Bu username band." }, 409);
  if (conflict === "PHONE_TAKEN") return out(req, { error: "PHONE_TAKEN", message: "Bu telefon raqami allaqachon ishlatilgan." }, 409);

  const { data: created, error: authError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username, display_name: displayName || username, phone, tos_version: tosVersion } });
  if (authError || !created?.user) {
    const msg = (authError?.message ?? "").toLowerCase();
    if (/already|registered|exists/.test(msg)) return out(req, { error: "ACCOUNT_EXISTS", message: "Bu email bilan akkaunt allaqachon mavjud." }, 409);
    if (/weak|password|comprom/.test(msg) && (authError?.status ?? 500) < 500) return out(req, { error: "WEAK_PASSWORD", message: "Kuchliroq parol kiriting." }, 400);
    return out(req, { error: "SIGNUP_FAILED", message: "Akkaunt yaratilmadi. Qaytadan urinib ko'ring." }, 500);
  }

  const { data: rows, error: stateError } = await admin.rpc("signup_bootstrap_state", { p_user_id: created.user.id });
  const s = Array.isArray(rows) ? rows[0] : rows;
  const ok = !stateError && !!s?.profile_ok && !!s?.identity_ok && !!s?.account_ok && !!s?.wallet_ok;
  if (!ok) {
    await admin.auth.admin.deleteUser(created.user.id);
    return out(req, { error: "SIGNUP_FAILED", message: "Akkaunt to'liq yaratilmaganligi uchun bekor qilindi. Qaytadan urinib ko'ring." }, 500);
  }

  return out(req, { ok: true, user_id: created.user.id, email_confirmed: true, phone_verified: false }, 201);
});
