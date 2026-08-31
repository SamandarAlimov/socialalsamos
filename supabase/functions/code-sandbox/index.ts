import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guard, preflight, jsonResponse, guardError } from "../_shared/guard.ts";
import { runJavaScript } from "../_shared/sandbox.ts";

const FUNCTION_NAME = "code-sandbox";
const RATE_LIMIT = 200;
const RATE_WINDOW_MINUTES = 60;
const MAX_CODE_CHARS = 60_000;
const MAX_TIMEOUT_MS = 10_000;

// AI yozgan (yoki foydalanuvchi yozgan) JavaScript/TypeScript kodini
// izolyatsiyalangan holda bajaradi va natijani qaytaradi.
serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return guardError(req, "METHOD_NOT_ALLOWED", "Faqat POST so'rovi qabul qilinadi.", 405);
  }

  try {
    const gate = await guard(req, {
      functionName: FUNCTION_NAME,
      limit: RATE_LIMIT,
      windowMinutes: RATE_WINDOW_MINUTES,
      requireAuth: true,
    });
    if (gate.response) return gate.response;

    const body = await req.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code : "";
    if (!code.trim()) {
      return guardError(req, "INVALID_REQUEST", "code matni talab qilinadi.", 400);
    }
    if (code.length > MAX_CODE_CHARS) {
      return guardError(req, "INVALID_REQUEST", "Kod juda uzun.", 400);
    }

    const timeoutMs = Math.min(Number(body?.timeoutMs) || 5000, MAX_TIMEOUT_MS);
    const result = await runJavaScript(code, timeoutMs);
    return jsonResponse(req, result, 200);
  } catch (error) {
    console.error("code-sandbox error:", error);
    return guardError(req, "SERVER_ERROR", "Kutilmagan xatolik yuz berdi.", 500);
  }
});
