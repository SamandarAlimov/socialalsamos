// Alsamos AI — alohida rasm yaratish endpointi.
//
// MUHIM: barcha AI chaqiruvlari ../_shared/geminiMedia.ts (u esa
// ../_shared/geminiPool.ts kalitlar hovuzi) orqali ketadi. To'g'ridan-to'g'ri
// gateway chaqiruvi qilinmaydi — avval shu sabab 401/402 xatolar chiqardi.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guard, preflight, jsonResponse, guardError } from "../_shared/guard.ts";
import { hasGeminiKeys } from "../_shared/geminiPool.ts";
import { generateImageBytes, uploadGeneratedImage } from "../_shared/geminiMedia.ts";

const FUNCTION_NAME = "ai-generate-image";
// Rasm yaratish qimmat: kuniga foydalanuvchi bo'yicha cheklaymiz.
const RATE_LIMIT = 40;
const RATE_WINDOW_MINUTES = 24 * 60;
const MAX_PROMPT_CHARS = 2000;
// data:image/... base64 uchun taxminiy yuqori chegara (~8 MB).
const MAX_IMAGE_CHARS = 11_000_000;

// editImage faqat data URL yoki ishonchli HTTPS manba bo'lishi kerak (SSRF oldini olish).
function validateEditImage(value: unknown): { ok: true; value: string | null } | { ok: false; reason: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, reason: "editImage matn bo'lishi kerak." };
  if (value.length > MAX_IMAGE_CHARS) return { ok: false, reason: "Rasm hajmi juda katta." };

  if (value.startsWith("data:image/")) return { ok: true, value };

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return { ok: false, reason: "Rasm manzili https bo'lishi kerak." };
    const host = url.hostname.toLowerCase();
    const isLocal =
      host === "localhost" ||
      host.endsWith(".local") ||
      host === "metadata.google.internal" ||
      /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(host) ||
      host === "0.0.0.0" ||
      host.startsWith("[");
    if (isLocal) return { ok: false, reason: "Bu rasm manzili ruxsat etilmagan." };
    return { ok: true, value };
  } catch (_) {
    return { ok: false, reason: "Rasm manzili noto'g'ri." };
  }
}

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
    if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
      return guardError(req, "INVALID_REQUEST", "prompt matni talab qilinadi.", 400);
    }

    const prompt = String(body.prompt).slice(0, MAX_PROMPT_CHARS);
    const imageCheck = validateEditImage(body.editImage);
    if (!imageCheck.ok) {
      return guardError(req, "INVALID_REQUEST", imageCheck.reason, 400);
    }
    const editImage = imageCheck.value;

    // Asosiy yo'l — Gemini kalitlari hovuzi. Lovable faqat zaxira, majburiy emas.
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") ?? undefined;
    if (!hasGeminiKeys() && !lovableKey) {
      console.error("No AI credentials: set GEMINI_API_KEYS or LOVABLE_API_KEY");
      return guardError(req, "SERVER_ERROR", "AI xizmati sozlanmagan.", 500);
    }

    let image;
    try {
      image = await generateImageBytes({ prompt, imageUrl: editImage, lovableKey });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Image generation failed:", message);
      return jsonResponse(req, { error: message.slice(0, 400), code: "SERVER_ERROR" }, 502);
    }

    // Imkon bo'lsa storage'ga yuklaymiz — data URL juda og'ir bo'ladi.
    let imageUrl = `data:${image.mimeType};base64,${image.base64}`;
    if (gate.userId) {
      try {
        imageUrl = await uploadGeneratedImage(gate.admin, gate.userId, image);
      } catch (uploadError) {
        console.warn("generated image upload failed", uploadError);
      }
    }

    return jsonResponse(req, { imageUrl, text: null, model: image.model }, 200);
  } catch (error) {
    console.error("Image generation error:", error);
    return guardError(req, "SERVER_ERROR", "Kutilmagan xatolik yuz berdi.", 500);
  }
});
