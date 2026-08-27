// API kalit limitiga yaqinlashganda email yuboruvchi funksiya.
//
// Ilgari: har kim so'rov tanasida istalgan userEmail ni yuborib, Alsamos nomidan
// email jo'natishi mumkin edi (spam/phishing vektori).
//
// Endi:
//  1. Faqat CRON_SECRET (yoki service role key) bilan chaqiriladi.
//  2. userEmail so'rovdan olinmaydi — api_keys egasining haqiqiy emaili bazadan olinadi.
//  3. currentUsage/limit ham bazadan tasdiqlanadi.
//  4. AUTH_ENFORCE=log bo'lganda bloklamaydi, faqat function_usage ga yozadi.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { preflight, jsonResponse, guardError, enforceMode, serviceClient, clientIp, sha256Hex } from "../_shared/guard.ts";

const FUNCTION_NAME = "rate-limit-notification";

function providedSecret(req: Request): string {
  const header = req.headers.get("x-cron-secret");
  if (header) return header.trim();
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return guardError(req, "METHOD_NOT_ALLOWED", "Faqat POST qabul qilinadi.", 405);
  }

  const mode = enforceMode();
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const given = providedSecret(req);
  const authorized =
    (expected.length > 0 && constantTimeEqual(given, expected)) ||
    (serviceKey.length > 0 && constantTimeEqual(given, serviceKey));

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
      return guardError(req, "UNAUTHORIZED", "Bu endpoint faqat ichki chaqiruvlar uchun.", 401);
    }
    console.warn(`${FUNCTION_NAME}: ruxsatsiz chaqiruv (log rejimi — bloklanmadi)`);
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return guardError(req, "SERVER_ERROR", "Email xizmati sozlanmagan.", 500);
    }

    const body = await req.json().catch(() => null);
    const apiKeyId = typeof body?.apiKeyId === "string" ? body.apiKeyId : "";
    const thresholdRaw = Number(body?.thresholdPercent);
    const thresholdPercent = Number.isFinite(thresholdRaw) ? Math.trunc(thresholdRaw) : NaN;

    if (!apiKeyId || !Number.isFinite(thresholdPercent) || thresholdPercent < 1 || thresholdPercent > 100) {
      return guardError(req, "INVALID_REQUEST", "apiKeyId va thresholdPercent (1-100) talab qilinadi.", 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const resend = new Resend(resendApiKey);

    // Kalit ma'lumotlari bazadan olinadi — so'rovdagi qiymatlarga ishonilmaydi.
    const { data: apiKey, error: keyError } = await supabase
      .from("api_keys")
      .select("id, name, user_id, rate_limit, requests_today")
      .eq("id", apiKeyId)
      .maybeSingle();

    if (keyError) throw keyError;
    if (!apiKey) {
      return guardError(req, "INVALID_REQUEST", "API kalit topilmadi.", 404);
    }

    // Email egasining haqiqiy manzili auth.users dan olinadi.
    const { data: ownerData, error: ownerError } = await supabase.auth.admin.getUserById(apiKey.user_id);
    if (ownerError) throw ownerError;
    const userEmail = ownerData?.user?.email ?? "";
    if (!userEmail) {
      return guardError(req, "INVALID_REQUEST", "Kalit egasining emaili topilmadi.", 422);
    }

    const limit = Number(apiKey.rate_limit ?? body?.limit ?? 0) || 0;
    const currentUsage = Number(apiKey.requests_today ?? body?.currentUsage ?? 0) || 0;
    const apiKeyName = String(apiKey.name ?? "API key").slice(0, 120);

    // Bir kunda bir threshold uchun bitta email.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: existingNotification } = await supabase
      .from("rate_limit_notifications")
      .select("id")
      .eq("api_key_id", apiKeyId)
      .eq("threshold_percent", thresholdPercent)
      .gte("sent_at", today.toISOString())
      .maybeSingle();

    if (existingNotification) {
      return jsonResponse(req, { message: "Notification already sent today" }, 200);
    }

    const usagePercent = limit > 0 ? Math.round((currentUsage / limit) * 100) : 0;
    const remaining = Math.max(limit - currentUsage, 0);

    const { error: emailError } = await resend.emails.send({
      from: "Alsamos API <onboarding@resend.dev>",
      to: [userEmail],
      subject: `⚠️ API Key "${apiKeyName}" approaching rate limit (${usagePercent}% used)`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #f59e0b; margin-bottom: 20px;">⚠️ Rate Limit Warning</h2>

          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            Your API key <strong>"${apiKeyName}"</strong> has reached <strong>${usagePercent}%</strong> of its daily rate limit.
          </p>

          <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e;">
              <strong>Current Usage:</strong> ${currentUsage.toLocaleString()} / ${limit.toLocaleString()} requests<br>
              <strong>Remaining:</strong> ${remaining.toLocaleString()} requests
            </p>
          </div>

          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            Once you hit the limit, additional requests will be rejected until the counter resets at midnight UTC.
          </p>

          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
            Consider upgrading your rate limit or optimizing your API usage to avoid interruptions.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

          <p style="color: #9ca3af; font-size: 12px;">
            This is an automated notification from Alsamos API Gateway.
          </p>
        </div>
      `,
    });

    if (emailError) {
      console.error("Failed to send email:", emailError);
      return guardError(req, "SERVER_ERROR", "Email yuborilmadi.", 502);
    }

    await supabase.from("rate_limit_notifications").insert({
      api_key_id: apiKeyId,
      user_id: apiKey.user_id,
      threshold_percent: thresholdPercent,
    });

    return jsonResponse(req, { success: true, message: "Notification sent" }, 200);
  } catch (error: unknown) {
    console.error("Error in rate-limit-notification:", error);
    return guardError(req, "SERVER_ERROR", "Bildirishnoma yuborishda xatolik.", 500);
  }
});
