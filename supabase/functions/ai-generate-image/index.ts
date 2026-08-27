import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guard, preflight, jsonResponse, guardError } from "../_shared/guard.ts";

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return guardError(req, "SERVER_ERROR", "AI xizmati sozlanmagan.", 500);
    }

    const messages: Array<Record<string, unknown>> = [
      {
        role: "user",
        content: editImage
          ? [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: editImage } },
            ]
          : prompt,
      },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages,
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return jsonResponse(
          req,
          { error: "So'rovlar limiti oshdi. Birozdan so'ng qayta urinib ko'ring.", code: "TOO_MANY_ATTEMPTS" },
          429,
        );
      }
      if (response.status === 402) {
        return jsonResponse(
          req,
          { error: "AI kreditlari tugagan. Billing bo'limida kredit qo'shing.", code: "SERVER_ERROR" },
          402,
        );
      }
      const errorText = await response.text();
      console.error("Image generation error:", response.status, errorText);
      return guardError(req, "SERVER_ERROR", "Rasm yaratishda xatolik.", 500);
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? null;
    const textContent = data.choices?.[0]?.message?.content ?? null;

    if (!imageUrl) {
      return guardError(req, "SERVER_ERROR", "Rasm qaytmadi. Boshqa matn bilan urinib ko'ring.", 502);
    }

    return jsonResponse(req, { imageUrl, text: textContent }, 200);
  } catch (error) {
    console.error("Image generation error:", error);
    return guardError(req, "SERVER_ERROR", "Kutilmagan xatolik yuz berdi.", 500);
  }
});
