// Edge funksiyalar uchun umumiy xavfsizlik qatlami.
//
// Tamoyillar:
//  1. config.toml dagi verify_jwt qiymatlari O'ZGARTIRILMAYDI. Hamma tekshiruv
//     funksiya ichida bo'ladi, shuning uchun xato javob tushunarli bo'ladi va
//     bitta funksiyadagi muammo boshqalariga ta'sir qilmaydi.
//  2. AUTH_ENFORCE env o'zgaruvchisi bilan boshqariladi:
//       off  - tekshiruv ham, jurnal ham yo'q (favqulodda o'chirish uchun)
//       log  - tekshiriladi va jurnalga yoziladi, LEKIN hech kim bloklanmaydi
//              (outcome = 'would_block'). Standart qiymat.
//       on   - to'liq majburiy: 401 / 429 qaytariladi.
//  3. Xato javoblari yagona shaklda: { error, code }.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type EnforceMode = "off" | "log" | "on";

export type GuardCode =
  | "UNAUTHORIZED"
  | "TOO_MANY_ATTEMPTS"
  | "INVALID_REQUEST"
  | "METHOD_NOT_ALLOWED"
  | "FORBIDDEN"
  | "SERVER_ERROR";

export function enforceMode(): EnforceMode {
  const raw = (Deno.env.get("AUTH_ENFORCE") ?? "log").trim().toLowerCase();
  return raw === "on" || raw === "off" ? raw : "log";
}

// ---------------------------------------------------------------- CORS

function allowedOrigins(): string[] {
  return (Deno.env.get("AUTH_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function corsHeaders(req: Request, methods = "POST, OPTIONS"): Record<string, string> {
  const list = allowedOrigins();
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = list.length === 0 ? "*" : list.includes(origin) ? origin : list[0];

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-device-id, x-cron-secret, x-api-key",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (list.length > 0) headers["Access-Control-Allow-Credentials"] = "true";
  return headers;
}

export function preflight(req: Request, methods?: string): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(req, methods) });
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      ...extraHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export function guardError(
  req: Request,
  code: GuardCode,
  message: string,
  status: number,
): Response {
  return jsonResponse(req, { error: message, code }, status);
}

// ---------------------------------------------------------------- utils

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

// Tokenni sarlavhadan yoki (WebSocket uchun) query paramdan oladi.
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  if (header.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  try {
    const url = new URL(req.url);
    const fromQuery = url.searchParams.get("access_token") ?? url.searchParams.get("token");
    if (fromQuery) return fromQuery.trim();
  } catch (_) {
    // noop
  }
  return null;
}

const anonKey = () => Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// JWT ni tekshirib, foydalanuvchi id sini qaytaradi. Anon key bilan chaqirilgan
// (ya'ni login qilinmagan) holatda null qaytadi.
export async function userFromRequest(req: Request): Promise<string | null> {
  const token = bearerToken(req);
  if (!token) return null;
  if (token === anonKey()) return null;
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, anonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return null;
    return data.user.id;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------- jurnal

async function log(
  admin: SupabaseClient,
  entry: {
    functionName: string;
    userId: string | null;
    ipHash: string | null;
    outcome: "allowed" | "blocked" | "would_block";
    reason?: string;
    mode: EnforceMode;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from("function_usage").insert({
      function_name: entry.functionName,
      user_id: entry.userId,
      ip_hash: entry.ipHash,
      outcome: entry.outcome,
      reason: entry.reason ?? null,
      mode: entry.mode,
      metadata: entry.metadata ?? {},
    });
  } catch (error) {
    // Jurnal yozilmasa ham asosiy ish to'xtamasligi kerak.
    console.error("function_usage log failed", error);
  }
}

// ---------------------------------------------------------------- guard

export type GuardOptions = {
  functionName: string;
  // Oyna ichida ruxsat etilgan chaqiruvlar soni (foydalanuvchi yoki IP bo'yicha).
  limit?: number;
  windowMinutes?: number;
  // false bo'lsa faqat limit tekshiriladi (ochiq endpointlar uchun).
  requireAuth?: boolean;
  metadata?: Record<string, unknown>;
};

export type GuardResult = {
  // Tekshiruvdan o'tgan foydalanuvchi (log/off rejimida null bo'lishi mumkin).
  userId: string | null;
  // null bo'lmasa — darhol shu javobni qaytarish kerak.
  response: Response | null;
  mode: EnforceMode;
  admin: SupabaseClient;
};

export async function guard(req: Request, options: GuardOptions): Promise<GuardResult> {
  const mode = enforceMode();
  const admin = serviceClient();
  const requireAuth = options.requireAuth !== false;
  const limit = options.limit ?? 0;
  const windowMinutes = options.windowMinutes ?? 60;

  if (mode === "off") {
    return { userId: await userFromRequest(req), response: null, mode, admin };
  }

  const userId = await userFromRequest(req);
  const ipHash = await sha256Hex(`${options.functionName}:${clientIp(req)}`);

  // 1) Autentifikatsiya
  if (requireAuth && !userId) {
    const outcome = mode === "on" ? "blocked" : "would_block";
    await log(admin, {
      functionName: options.functionName,
      userId: null,
      ipHash,
      outcome,
      reason: "UNAUTHORIZED",
      mode,
      metadata: options.metadata,
    });
    if (mode === "on") {
      return {
        userId: null,
        mode,
        admin,
        response: guardError(req, "UNAUTHORIZED", "Avval tizimga kirishingiz kerak.", 401),
      };
    }
    return { userId: null, response: null, mode, admin };
  }

  // 2) Limit
  if (limit > 0) {
    const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
    const query = admin
      .from("function_usage")
      .select("id", { count: "exact", head: true })
      .eq("function_name", options.functionName)
      .neq("outcome", "blocked")
      .gte("created_at", since);

    const { count } = userId
      ? await query.eq("user_id", userId)
      : await query.eq("ip_hash", ipHash);

    if ((count ?? 0) >= limit) {
      const outcome = mode === "on" ? "blocked" : "would_block";
      await log(admin, {
        functionName: options.functionName,
        userId,
        ipHash,
        outcome,
        reason: "TOO_MANY_ATTEMPTS",
        mode,
        metadata: { ...options.metadata, count, limit, windowMinutes },
      });
      if (mode === "on") {
        return {
          userId,
          mode,
          admin,
          response: guardError(
            req,
            "TOO_MANY_ATTEMPTS",
            "Juda ko'p so'rov yubordingiz. Birozdan so'ng qayta urinib ko'ring.",
            429,
          ),
        };
      }
    }
  }

  await log(admin, {
    functionName: options.functionName,
    userId,
    ipHash,
    outcome: "allowed",
    mode,
    metadata: options.metadata,
  });

  return { userId, response: null, mode, admin };
}
