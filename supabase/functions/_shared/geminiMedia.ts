// Alsamos AI — media generatsiyasi (rasm va video).
//
// QOIDA: hech qanday AI chaqiruv to'g'ridan-to'g'ri gateway'ga ketmaydi.
// Hammasi ./geminiPool.ts dagi kalitlar hovuzi orqali o'tadi.
//
// Model nomlari tez o'zgaradi (2.5 yopildi, 3.x chiqdi...), shuning uchun bir
// nechta nomzod ketma-ket sinaladi. Kerak bo'lsa secrets orqali beriladi:
//   supabase secrets set GEMINI_IMAGE_MODELS="gemini-3-pro-image-preview,imagen-4.0-generate-001"
//   supabase secrets set GEMINI_VIDEO_MODELS="veo-3.1-generate-preview,veo-3.0-generate-001"

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { googleFetch } from "./geminiPool.ts";

const LOVABLE_GATEWAY = "https://" + "ai.gateway.lovable.dev" + "/v1/chat/completions";

const DEFAULT_IMAGE_MODELS = [
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation",
  "imagen-4.0-generate-001",
];

const DEFAULT_VIDEO_MODELS = [
  "veo-3.1-generate-preview",
  "veo-3.0-generate-001",
  "veo-2.0-generate-001",
];

/** Video tayyor bo'lishini kutish oralig'i. */
const POLL_INTERVAL_MS = 6_000;

function listFromEnv(name: string, fallback: string[]): string[] {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const items = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
}

export function imageModels(): string[] {
  return listFromEnv("GEMINI_IMAGE_MODELS", DEFAULT_IMAGE_MODELS);
}

export function videoModels(): string[] {
  return listFromEnv("GEMINI_VIDEO_MODELS", DEFAULT_VIDEO_MODELS);
}

/* --------------------------------- base64 --------------------------------- */

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

type InlineData = { mimeType: string; data: string };

/** Data URL yoki https rasmni Gemini uchun inlineData ko'rinishiga keltirish. */
async function toInlineData(url: string): Promise<InlineData | null> {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    if (comma === -1) return null;
    const header = url.slice(5, comma);
    if (!header.includes("base64")) return null;
    const mimeType = header.split(";")[0] || "image/png";
    return { mimeType, data: url.slice(comma + 1) };
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = (res.headers.get("content-type") ?? "image/png").split(";")[0];
    return { mimeType, data: bytesToBase64(new Uint8Array(await res.arrayBuffer())) };
  } catch (_) {
    return null;
  }
}

function extForMime(mimeType: string): string {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "png";
}

/* ---------------------------------- rasm ---------------------------------- */

export type GeneratedImage = { base64: string; mimeType: string; model: string };

/** Oxirgi chora: eski Lovable gateway (agar kaliti hali mavjud bo'lsa). */
async function lovableImage(prompt: string, lovableKey: string): Promise<GeneratedImage> {
  const res = await fetch(LOVABLE_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      modalities: ["image", "text"],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`lovable: HTTP ${res.status}`);
  const json = await res.json();
  const dataUrl: string | null = json.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? null;
  if (!dataUrl) throw new Error("lovable: rasm qaytmadi");
  const inline = await toInlineData(dataUrl);
  if (!inline) throw new Error("lovable: rasm formati tushunarsiz");
  return { base64: inline.data, mimeType: inline.mimeType, model: "lovable/gemini-2.5-flash-image" };
}

/**
 * Matndan (yoki mavjud rasmdan) rasm yaratadi. Model nomzodlari ketma-ket
 * sinaladi: `:generateContent` (Gemini image) va `:predict` (Imagen).
 */
export async function generateImageBytes(opts: {
  prompt: string;
  imageUrl?: string | null;
  lovableKey?: string;
}): Promise<GeneratedImage> {
  const inline = opts.imageUrl ? await toInlineData(opts.imageUrl) : null;
  const errors: string[] = [];

  for (const model of imageModels()) {
    try {
      if (model.startsWith("imagen")) {
        // Imagen tahrirlashni bu yo'l bilan qo'llamaydi — faqat toza generatsiya.
        if (inline) continue;
        const { response } = await googleFetch(`/v1beta/models/${model}:predict`, {
          body: { instances: [{ prompt: opts.prompt }], parameters: { sampleCount: 1 } },
        });
        if (!response.ok) {
          errors.push(`${model}: HTTP ${response.status} ${(await response.text().catch(() => "")).slice(0, 160)}`);
          continue;
        }
        const json = await response.json();
        const prediction = json.predictions?.[0];
        if (prediction?.bytesBase64Encoded) {
          return {
            base64: String(prediction.bytesBase64Encoded),
            mimeType: String(prediction.mimeType ?? "image/png"),
            model,
          };
        }
        errors.push(`${model}: rasm qaytmadi`);
        continue;
      }

      const parts: Array<Record<string, unknown>> = [{ text: opts.prompt }];
      if (inline) parts.push({ inlineData: inline });

      const { response } = await googleFetch(`/v1beta/models/${model}:generateContent`, {
        body: {
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        },
      });
      if (!response.ok) {
        errors.push(`${model}: HTTP ${response.status} ${(await response.text().catch(() => "")).slice(0, 160)}`);
        continue;
      }
      const json = await response.json();
      const candidateParts = (json.candidates?.[0]?.content?.parts ?? []) as Array<Record<string, any>>;
      for (const part of candidateParts) {
        const blob = part.inlineData ?? part.inline_data;
        if (blob?.data) {
          return {
            base64: String(blob.data),
            mimeType: String(blob.mimeType ?? blob.mime_type ?? "image/png"),
            model,
          };
        }
      }
      errors.push(`${model}: rasm qaytmadi`);
    } catch (error) {
      errors.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (opts.lovableKey) {
    try {
      return await lovableImage(opts.prompt, opts.lovableKey);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`Rasm yaratilmadi. ${errors.join("; ")}`.slice(0, 600));
}

/* --------------------------------- storage -------------------------------- */

/** Yaratilgan medianing baytlarini ommaviy `media` bucketga yuklaydi. */
export async function uploadGeneratedMedia(
  admin: SupabaseClient,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const { error } = await admin.storage.from("media").upload(path, bytes, {
    contentType,
    cacheControl: "3600",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  const { data } = admin.storage.from("media").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Public URL olinmadi.");
  return data.publicUrl;
}

export async function uploadGeneratedImage(
  admin: SupabaseClient,
  userId: string,
  image: GeneratedImage,
): Promise<string> {
  const path = `${userId}/ai-image/${crypto.randomUUID()}.${extForMime(image.mimeType)}`;
  return uploadGeneratedMedia(admin, path, base64ToBytes(image.base64), image.mimeType);
}

/* --------------------------------- video ---------------------------------- */

export type StartedVideo = { operation: string; model: string };

/** Veo bilan video renderni boshlaydi (uzoq ishlovchi operatsiya). */
export async function startVideo(opts: {
  prompt: string;
  seconds: number;
  imageUrl?: string | null;
}): Promise<StartedVideo> {
  const inline = opts.imageUrl ? await toInlineData(opts.imageUrl) : null;
  const errors: string[] = [];

  for (const model of videoModels()) {
    const instance: Record<string, unknown> = { prompt: opts.prompt };
    if (inline) {
      instance.image = { bytesBase64Encoded: inline.data, mimeType: inline.mimeType };
    }
    try {
      const { response } = await googleFetch(`/v1beta/models/${model}:predictLongRunning`, {
        body: {
          instances: [instance],
          parameters: { durationSeconds: opts.seconds, aspectRatio: "16:9" },
        },
      });
      if (!response.ok) {
        errors.push(`${model}: HTTP ${response.status} ${(await response.text().catch(() => "")).slice(0, 160)}`);
        continue;
      }
      const json = await response.json();
      if (typeof json.name === "string" && json.name) {
        return { operation: json.name, model };
      }
      errors.push(`${model}: operation qaytmadi`);
    } catch (error) {
      errors.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Video generatsiya boshlanmadi. ${errors.join("; ")}`.slice(0, 600));
}

export type VideoPoll = { done: boolean; uri?: string; error?: string };

/** Operatsiya holatini tekshiradi. */
export async function pollVideo(operation: string): Promise<VideoPoll> {
  const { response } = await googleFetch(`/v1beta/${operation}`, { method: "GET" });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    // Vaqtinchalik xato bo'lishi mumkin — tugagan deb hisoblamaymiz.
    return { done: false, error: `HTTP ${response.status} ${detail}`.trim() };
  }
  const json = await response.json();
  if (json.error) {
    return { done: true, error: String(json.error.message ?? "video generatsiya xatosi") };
  }
  if (!json.done) return { done: false };

  const result = json.response ?? {};
  const uri =
    result.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ??
    result.generatedVideos?.[0]?.video?.uri ??
    result.generatedSamples?.[0]?.video?.uri ??
    null;
  if (!uri) return { done: true, error: "video havolasi qaytmadi" };
  return { done: true, uri: String(uri) };
}

/** Tayyor videoni yuklab oladi (havola ham kalit bilan so'raladi). */
export async function downloadVideo(uri: string): Promise<Uint8Array> {
  const url = uri.includes("alt=media") ? uri : uri + (uri.includes("?") ? "&" : "?") + "alt=media";
  const { response } = await googleFetch(url, { method: "GET" });
  if (!response.ok) throw new Error(`Video yuklab olinmadi (HTTP ${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

export type MediaJobRow = {
  id: string;
  user_id: string;
  prompt?: string | null;
  status?: string | null;
  output_url?: string | null;
  params?: Record<string, unknown> | null;
};

export type VideoWaitResult = { status: "done" | "failed" | "running"; url?: string; error?: string };

/**
 * Videoni belgilangan vaqt ichida kutadi; tayyor bo'lsa storage'ga yuklab,
 * `ai_media_jobs` yozuvini yangilaydi. Vaqt tugasa "running" qaytadi va
 * keyinroq `media_job_status` bilan davom ettirish mumkin.
 */
export async function waitForVideo(
  admin: SupabaseClient,
  job: MediaJobRow,
  budgetMs = 80_000,
): Promise<VideoWaitResult> {
  const operation = String(job.params?.operation ?? "");
  if (!operation) return { status: "failed", error: "operation topilmadi" };

  const deadline = Date.now() + budgetMs;
  let lastNotice = "";

  while (Date.now() < deadline) {
    const poll = await pollVideo(operation);

    if (poll.done && poll.uri) {
      try {
        const bytes = await downloadVideo(poll.uri);
        const url = await uploadGeneratedMedia(
          admin,
          `${job.user_id}/ai-video/${job.id}.mp4`,
          bytes,
          "video/mp4",
        );
        await admin
          .from("ai_media_jobs")
          .update({ status: "done", output_url: url, error: null })
          .eq("id", job.id);
        return { status: "done", url };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await admin.from("ai_media_jobs").update({ status: "failed", error: message }).eq("id", job.id);
        return { status: "failed", error: message };
      }
    }

    if (poll.done && poll.error) {
      await admin.from("ai_media_jobs").update({ status: "failed", error: poll.error }).eq("id", job.id);
      return { status: "failed", error: poll.error };
    }

    if (poll.error) lastNotice = poll.error;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return { status: "running", error: lastNotice || undefined };
}
