// Rejalashtirilgan xabarlarni yuboruvchi cron funksiyasi.
//
// MUHIM: bu funksiya service role bilan ishlaydi, ya'ni istalgan foydalanuvchi
// nomidan xabar yuborishi mumkin. Shuning uchun faqat cron chaqiruvi ruxsat etiladi:
//   x-cron-secret: <CRON_SECRET>   (yoki Authorization: Bearer <CRON_SECRET>)
//
// config.toml dagi verify_jwt = false ATAYLAB o'zgartirilmadi — cron chaqiruvi
// JWT yubormaydi. Himoya funksiya ichida.
//
// AUTH_ENFORCE=log bo'lganda: sir noto'g'ri bo'lsa ham ish bajariladi, lekin
// function_usage ga would_block yoziladi. AUTH_ENFORCE=on bo'lganda 401 qaytadi.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { preflight, jsonResponse, guardError, enforceMode, serviceClient, clientIp, sha256Hex } from "../_shared/guard.ts";

const FUNCTION_NAME = "send-scheduled-messages";

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

    const { data: dueMessages, error: fetchError } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .limit(500);

    if (fetchError) throw fetchError;

    console.log(`Found ${dueMessages?.length || 0} messages to send`);

    const results = { sent: 0, failed: 0 };

    for (const scheduledMsg of dueMessages || []) {
      try {
        const { error: insertError } = await supabase.from("messages").insert({
          conversation_id: scheduledMsg.conversation_id,
          sender_id: scheduledMsg.sender_id,
          content: scheduledMsg.content,
          media_url: scheduledMsg.media_url,
          media_type: scheduledMsg.media_type,
          reply_to_id: scheduledMsg.reply_to_id,
        });
        if (insertError) throw insertError;

        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", scheduledMsg.conversation_id);

        const { error: updateError } = await supabase
          .from("scheduled_messages")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", scheduledMsg.id);
        if (updateError) console.error("Error updating scheduled message status:", updateError);

        results.sent++;
      } catch (error) {
        console.error(`Failed to send message ${scheduledMsg.id}:`, error);
        await supabase
          .from("scheduled_messages")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : "Unknown error",
          })
          .eq("id", scheduledMsg.id);
        results.failed++;
      }
    }

    // Xato tafsilotlari javobda qaytarilmaydi — faqat loglarda.
    return jsonResponse(
      req,
      { success: true, processed: results.sent + results.failed, sent: results.sent, failed: results.failed },
      200,
    );
  } catch (error) {
    console.error("Error processing scheduled messages:", error);
    return guardError(req, "SERVER_ERROR", "Rejalashtirilgan xabarlarni yuborishda xatolik.", 500);
  }
});
