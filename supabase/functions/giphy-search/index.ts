import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guard, preflight, jsonResponse, guardError } from "../_shared/guard.ts";

const FUNCTION_NAME = "giphy-search";
// Bu endpoint tashqi pullik API ni chaqiradi — shuning uchun limit qat'iy.
const RATE_LIMIT = 300;
const RATE_WINDOW_MINUTES = 60;

// Faqat ruxsat etilgan turlar: aks holda `type` orqali ixtiyoriy yo'l yasash mumkin edi.
const ALLOWED_TYPES = new Set(["gifs", "stickers"]);
const MAX_LIMIT = 50;
const MAX_QUERY_CHARS = 100;

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

    const body = (await req.json().catch(() => ({}))) as {
      query?: unknown;
      type?: unknown;
      limit?: unknown;
    };

    const type = typeof body.type === "string" && ALLOWED_TYPES.has(body.type) ? body.type : "gifs";
    const query =
      typeof body.query === "string" ? body.query.trim().slice(0, MAX_QUERY_CHARS) : "";
    const parsedLimit = Number(body.limit ?? 20);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.trunc(parsedLimit), 1), MAX_LIMIT)
      : 20;

    const GIPHY_API_KEY = Deno.env.get("GIPHY_API_KEY");
    if (!GIPHY_API_KEY) {
      console.error("GIPHY_API_KEY is not configured");
      return guardError(req, "SERVER_ERROR", "GIF xizmati sozlanmagan.", 500);
    }

    // Kalit faqat serverda qoladi — URL klientga hech qachon qaytarilmaydi.
    const endpoint = query ? "search" : "trending";
    const url = new URL(`https://api.giphy.com/v1/${type}/${endpoint}`);
    url.searchParams.set("api_key", GIPHY_API_KEY);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("rating", "g");
    if (query) {
      url.searchParams.set("q", query);
      url.searchParams.set("lang", "en");
    }

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Diqqat: xato matni klientga qaytarilmaydi, chunki unda URL va kalit bo'lishi mumkin.
      console.error("GIPHY API error:", response.status, errorText.slice(0, 500));
      if (response.status === 429) {
        return jsonResponse(
          req,
          { error: "GIF xizmati limiti oshdi. Birozdan so'ng urinib ko'ring.", code: "TOO_MANY_ATTEMPTS" },
          429,
        );
      }
      return guardError(req, "SERVER_ERROR", "GIF qidiruvida xatolik.", 502);
    }

    const data = await response.json();
    const items = Array.isArray(data?.data) ? data.data : [];

    const gifs = items
      .map((gif: any) => {
        const images = gif?.images ?? {};
        const original = images.original ?? {};
        return {
          id: String(gif?.id ?? ""),
          url: original.url ?? null,
          preview:
            images.fixed_width_small?.url ||
            images.preview_gif?.url ||
            images.fixed_width?.url ||
            original.url ||
            null,
          width: Number.parseInt(original.width ?? "0", 10) || 0,
          height: Number.parseInt(original.height ?? "0", 10) || 0,
          title: String(gif?.title ?? ""),
        };
      })
      .filter((gif: { id: string; url: string | null }) => gif.id && gif.url);

    // GIF ro'yxati maxfiy emas: qisqa muddat keshlash tashqi API xarajatini kamaytiradi.
    return jsonResponse(req, { gifs }, 200, { "Cache-Control": "public, max-age=300" });
  } catch (error) {
    console.error("giphy-search error:", error);
    return guardError(req, "SERVER_ERROR", "Kutilmagan xatolik yuz berdi.", 500);
  }
});
