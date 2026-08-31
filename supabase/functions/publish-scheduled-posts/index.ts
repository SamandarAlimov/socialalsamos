// Rejalashtirilgan postlarni chiqaruvchi cron funksiyasi (P1).
//
// MUHIM: bu funksiya service role bilan ishlaydi va istalgan foydalanuvchining
// postini chiqarishi mumkin. Shuning uchun faqat cron chaqiruvi ruxsat etiladi:
//   x-cron-secret: <CRON_SECRET>   (yoki Authorization: Bearer <CRON_SECRET>)
//
// Nashr mantig'i ATAYLAB bu yerda emas, bazadagi publish_due_scheduled_posts
// funksiyasida turadi. Sababi: web va superapp bitta shartnomani ishlatishi
// kerak, aks holda ikki mijoz bir-biriga nomutanosib bo'lib qoladi.
//
// AUTH_ENFORCE=log bo'lganda: sir noto'g'ri bo'lsa ham ish bajariladi, lekin
// function_usage ga would_block yoziladi. AUTH_ENFORCE=on bo'lganda 401 qaytadi.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { preflight, jsonResponse, guardError, enforceMode, serviceClient, clientIp, sha256Hex } from "../_shared/guard.ts";

const FUNCTION_NAME = "publish-scheduled-posts";

// Bir chaqiruvda nechta post chiqariladi. Cron har daqiqada ishlagani uchun
// katta orqada qolish ham bir necha daqiqada yopiladi.
const BATCH_LIMIT = 200;

function providedSecret(req: Request): string | null {
  const header = req.headers.get("x-cron-secret");
  if (header) return header.trim();
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

// Vaqt bo'yicha hujumga qarshi doimiy vaqtli solishtirish.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST" && req.method !== "GET") {
    return guardError(req, "METHOD_NOT_ALLOWED", "Faqat POST qabul qilinadi.", 405);
  }

  const mode = enforceMode();
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  const given = providedSecret(req) ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorized =
    expected.length > 0 &&
    (constantTimeEqual(given, expected) || (serviceKey.length > 0 && constantTimeEqual(given, serviceKey)));

  if (mode !== "off" && !authorized) {
    try {
      const admin = serviceClient();
      await admin.from("function_usage").insert({
        function_name: FUNCTION_NAME,
        user_id: null,
        ip_hash: await sha256Hex(`${FUNCTION_NAME}:${clientIp(req)}`),
        outcome: mode === "on" ? "blocked" : "would_block",
        reason: expected.length === 0 ? "CRON_SECRET_NOT_SET" : "UNAUTHORIZED",
        mode,
        metadata: { has_secret_header: given.length > 0 },
      });
    } catch (error) {
      console.error("cron guard log failed", error);
    }

    if (mode === "on") {
      return guardError(req, "UNAUTHORIZED", "Bu endpoint faqat cron uchun.", 401);
    }
    console.warn(`${FUNCTION_NAME}: ruxsatsiz chaqiruv (log rejimi — bloklanmadi)`);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Butun navbat bitta tranzaksiyada, SKIP LOCKED bilan olinadi.
    const { data, error } = await supabase.rpc("publish_due_scheduled_posts", {
      p_limit: BATCH_LIMIT,
    });

    if (error) throw error;

    const published = Array.isArray(data) ? data : [];
    console.log(`${FUNCTION_NAME}: ${published.length} post chiqarildi`);

    // Xato tafsilotlari javobda qaytarilmaydi — faqat loglarda.
    return jsonResponse(
      req,
      {
        success: true,
        published: published.length,
        // Navbat to'lib qolganini cron monitoringi ko'rishi uchun.
        batchFull: published.length >= BATCH_LIMIT,
      },
      200,
    );
  } catch (error) {
    console.error("Error publishing scheduled posts:", error);
    return guardError(req, "SERVER_ERROR", "Rejalashtirilgan postlarni chiqarishda xatolik.", 500);
  }
});
