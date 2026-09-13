// POST /account-signup
//
// Creates the primary Alsamos identity without depending on email or SMS
// delivery. The phone is stored as application metadata until phone OTP is
// enabled; it is intentionally not attached to Supabase Auth as a verified
// login identity.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const FUNCTION_NAME = "account-signup";
const SIGNUP_LIMIT_PER_HOUR = 10;

type SignupBody = {
  email?: unknown;
  password?: unknown;
  phone?: unknown;
  displayName?: unknown;
  username?: unknown;
  acceptedTerms?: unknown;
  tosVersion?: unknown;
};

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (url.protocol === "https:" && (host === "alsamos.com" || host.endsWith(".alsamos.com"))) return true;
    if (url.protocol === "https:" && (host.endsWith(".vercel.app") || host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com"))) return true;
    return (host === "localhost" || host === "127.0.0.1") && url.protocol === "http:";
  } catch {
    return false;
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = isAllowedOrigin(origin) ? (origin || "*") : "https://alsamos.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isIdentityEmail(value: string): boolean {
  if (!value || value.length > 254 || value.endsWith("@accounts.alsamos.com")) return false;
  return /^[^\s@]+@alsamos\.com$/.test(value);
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const phone = `+${digits}`;
  return /^\+[1-9][0-9]{7,14}$/.test(phone) ? phone : null;
}

function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json(req, { error: "METHOD_NOT_ALLOWED", message: "Faqat POST so'rovi qabul qilinadi." }, 405);
  }

  try {
    const body = (await req.json().catch(() => null)) as SignupBody | null;
    if (!body || typeof body !== "object") {
      return json(req, { error: "INVALID_REQUEST", message: "Ro'yxatdan o'tish ma'lumotlari topilmadi." }, 400);
    }

    const email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);
    const username = normalizeUsername(body.username);
    const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 100) : "";
    const password = typeof body.password === "string" ? body.password : "";
    const acceptedTerms = body.acceptedTerms === true;
    const tosVersion = typeof body.tosVersion === "string" ? body.tosVersion.trim().slice(0, 40) : null;

    if (!isIdentityEmail(email)) {
      return json(req, { error: "INVALID_REQUEST", message: "Faqat @alsamos.com email manzilidan foydalaning." }, 400);
    }
    if (!phone) {
      return json(req, { error: "INVALID_REQUEST", message: "Telefon raqamni xalqaro formatda kiriting." }, 400);
    }
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return json(req, { error: "INVALID_REQUEST", message: "Username 3-30 belgi, faqat a-z, 0-9 va _ bo'lishi kerak." }, 400);
    }
    if (password.length < 10 || password.length > 128) {
      return json(req, { error: "INVALID_REQUEST", message: "Parol kamida 10 ta belgidan iborat bo'lishi kerak." }, 400);
    }
    if (!acceptedTerms) {
      return json(req, { error: "INVALID_REQUEST", message: "Foydalanish shartlarini qabul qilish talab etiladi." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error(`[${FUNCTION_NAME}] required Supabase environment variables are missing`);
      return json(req, { error: "SERVER_ERROR", message: "Auth xizmati sozlanmagan." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const ipHash = await sha256Hex(`${FUNCTION_NAME}:${clientIp(req)}`);
    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count: recentAttempts, error: rateReadError } = await admin
      .from("function_usage")
      .select("id", { count: "exact", head: true })
      .eq("function_name", FUNCTION_NAME)
      .eq("ip_hash", ipHash)
      .in("outcome", ["allowed", "blocked"])
      .gte("created_at", since);

    // Telemetry must never make authentication unavailable. If the usage table
    // is temporarily unavailable, continue signup and log the diagnostics.
    if (rateReadError) {
      console.warn(`[${FUNCTION_NAME}] rate-limit telemetry unavailable`, rateReadError.message);
    } else if ((recentAttempts ?? 0) >= SIGNUP_LIMIT_PER_HOUR) {
      const { error: logError } = await admin.from("function_usage").insert({
        function_name: FUNCTION_NAME,
        user_id: null,
        ip_hash: ipHash,
        outcome: "blocked",
        reason: "TOO_MANY_ATTEMPTS",
        mode: "on",
        metadata: { limit: SIGNUP_LIMIT_PER_HOUR, windowMinutes: 60 },
      });
      if (logError) console.warn(`[${FUNCTION_NAME}] blocked-attempt log failed`, logError.message);
      return json(req, { error: "TOO_MANY_ATTEMPTS", message: "Juda ko'p ro'yxatdan o'tish urinishlari. Birozdan so'ng qayta urinib ko'ring." }, 429);
    }

    const { error: usageWriteError } = await admin.from("function_usage").insert({
      function_name: FUNCTION_NAME,
      user_id: null,
      ip_hash: ipHash,
      outcome: "allowed",
      reason: null,
      mode: "on",
      metadata: { stage: "signup_attempt" },
    });
    if (usageWriteError) console.warn(`[${FUNCTION_NAME}] attempt telemetry failed`, usageWriteError.message);

    const [usernameLookup, phoneLookup] = await Promise.all([
      admin.from("profiles").select("id").eq("username", username).maybeSingle(),
      admin.from("auth_identities").select("id").eq("phone", phone).maybeSingle(),
    ]);

    if (usernameLookup.error) {
      console.error(`[${FUNCTION_NAME}] username lookup failed`, usernameLookup.error.message);
      return json(req, { error: "SERVER_ERROR", message: "Ro'yxatdan o'tish xizmatida vaqtinchalik xato." }, 500);
    }
    if (phoneLookup.error) {
      console.error(`[${FUNCTION_NAME}] phone lookup failed`, phoneLookup.error.message);
      return json(req, { error: "SERVER_ERROR", message: "Ro'yxatdan o'tish xizmatida vaqtinchalik xato." }, 500);
    }

    if (usernameLookup.data) {
      return json(req, { error: "USERNAME_TAKEN", message: "Bu username band." }, 409);
    }
    if (phoneLookup.data) {
      return json(req, { error: "PHONE_TAKEN", message: "Bu telefon raqami allaqachon ishlatilgan." }, 409);
    }

    // Do not pass phone/phone_confirm here. The project's phone Auth provider is
    // not the canonical phone-verification flow yet. The DB identity trigger
    // persists this normalized value from user_metadata into auth_identities.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        display_name: displayName || username,
        phone,
        tos_version: tosVersion,
      },
    });

    if (createError || !created?.user) {
      const rawMessage = createError?.message ?? "missing_user";
      console.error(`[${FUNCTION_NAME}] createUser failed`, {
        code: (createError as { code?: string } | null)?.code ?? null,
        message: rawMessage,
      });

      const duplicate = /already|registered|exists|duplicate/i.test(rawMessage);
      return json(req, {
        error: duplicate ? "ACCOUNT_EXISTS" : "SIGNUP_FAILED",
        message: duplicate
          ? "Bu email bilan akkaunt allaqachon mavjud."
          : "Akkaunt yaratilmadi. Qaytadan urinib ko'ring.",
      }, duplicate ? 409 : 500);
    }

    return json(req, {
      ok: true,
      user_id: created.user.id,
      email_confirmed: true,
      phone_verified: false,
    }, 201);
  } catch (error) {
    console.error(`[${FUNCTION_NAME}] unhandled failure`, error instanceof Error ? error.message : String(error));
    return json(req, {
      error: "SERVER_ERROR",
      message: "Ro'yxatdan o'tish xizmatida vaqtinchalik xato. Qaytadan urinib ko'ring.",
    }, 500);
  }
});
