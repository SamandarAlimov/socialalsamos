import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guard, preflight, jsonResponse, corsHeaders, guardError } from "../_shared/guard.ts";

const FUNCTION_NAME = "ai-assistant";
// Bir foydalanuvchi uchun soatda ruxsat etilgan suhbat chaqiruvlari.
const RATE_LIMIT = 60;
const RATE_WINDOW_MINUTES = 60;

// Task-based model routing across free Lovable AI models.
// Fast/general is default; heavier tasks upgrade to Pro; simple/high-volume downgrade to Lite.
const MODEL_ROUTES: Record<string, string> = {
  general: "google/gemini-3-flash-preview",
  fast: "google/gemini-3.1-flash-lite",
  code: "google/gemini-3.5-flash",
  reasoning: "google/gemini-2.5-pro",
  vision: "google/gemini-2.5-flash",
  creative: "google/gemini-3-flash-preview",
};

async function classifyRequest(
  apiKey: string,
  lastUserText: string,
  currentTopics: string[] | null,
): Promise<{
  task: keyof typeof MODEL_ROUTES;
  language: string;
  update_recommendations: string[] | null;
  clear_recommendations: boolean;
}> {
  // Cheap, fast classifier — returns strict JSON.
  const sys = `You are a router. Given a user message, output JSON only with keys:
{"task":"general|fast|code|reasoning|vision|creative",
 "language":"BCP-47 code of the user's message (e.g. uz, en, ru, tr, es, ar, zh, ...)",
 "update_recommendations": string[] | null,
 "clear_recommendations": boolean}

Rules:
- task=code for programming/debugging/algorithms.
- task=reasoning for math, multi-step logic, deep analysis, planning.
- task=vision if the user asks about an image or media.
- task=creative for content writing, posts, marketing copy.
- task=fast for simple lookups, one-liners, translations.
- task=general otherwise.
- update_recommendations = an array of new topics ONLY if the user explicitly asks to change/set their recommendation topics/interests. Otherwise null.
- clear_recommendations = true only if the user asks to reset/remove all recommendation topics.
Current topics: ${JSON.stringify(currentTopics ?? [])}.
Return ONLY the JSON object.`;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-lite",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: lastUserText.slice(0, 2000) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const txt = j.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(txt);
    return {
      task: (parsed.task in MODEL_ROUTES ? parsed.task : "general") as keyof typeof MODEL_ROUTES,
      language: typeof parsed.language === "string" && parsed.language ? parsed.language : "uz",
      update_recommendations: Array.isArray(parsed.update_recommendations) ? parsed.update_recommendations : null,
      clear_recommendations: Boolean(parsed.clear_recommendations),
    };
  } catch (_) {
    return { task: "general", language: "uz", update_recommendations: null, clear_recommendations: false };
  }
}

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return guardError(req, "METHOD_NOT_ALLOWED", "Faqat POST so'rovi qabul qilinadi.", 405);
  }

  try {
    // Autentifikatsiya + foydalanuvchi bo'yicha limit.
    // AUTH_ENFORCE=log bo'lganda bloklamaydi, faqat function_usage ga yozadi.
    const gate = await guard(req, {
      functionName: FUNCTION_NAME,
      limit: RATE_LIMIT,
      windowMinutes: RATE_WINDOW_MINUTES,
      requireAuth: true,
    });
    if (gate.response) return gate.response;

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.messages)) {
      return guardError(req, "INVALID_REQUEST", "messages massivi talab qilinadi.", 400);
    }
    const { messages, context } = body as { messages: Array<Record<string, unknown>>; context?: string };

    // MUHIM: userId endi so'rov tanasidan OLINMAYDI. Ilgari body.userId ishlatilgani
    // uchun har kim boshqa foydalanuvchining profili, hamyoni va AI sozlamalarini
    // o'qib/o'zgartirib yuborishi mumkin edi.
    const userId = gate.userId;
    const admin = gate.admin;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return guardError(req, "SERVER_ERROR", "AI xizmati sozlanmagan.", 500);
    }

    let userContext = "";
    let currentTopics: string[] | null = null;

    if (userId) {
      const [{ data: profile }, { data: wallet }, { data: aiPrefs }] = await Promise.all([
        admin.from("profiles").select("display_name, username, followers_count").eq("id", userId).maybeSingle(),
        admin.from("wallets").select("balance, currency").eq("user_id", userId).maybeSingle(),
        admin.from("ai_preferences").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      currentTopics = (aiPrefs as { recommendation_topics?: string[] } | null)?.recommendation_topics ?? null;

      const prefs = aiPrefs as {
        content_filter?: string[];
        daily_time_limit_minutes?: number;
      } | null;

      userContext = `
User profile: ${profile?.display_name || "?"} (@${profile?.username || "?"}), followers ${profile?.followers_count || 0}
Wallet balance: ${wallet?.balance || 0} ${wallet?.currency || "UZS"}
Recommendation topics: ${currentTopics?.join(", ") || "all"}
Content filters: ${prefs?.content_filter?.join(", ") || "none"}
Daily time limit: ${prefs?.daily_time_limit_minutes || "unlimited"} min`;
    }

    const lastUser = [...messages].reverse().find((m: any) => m.role === "user")?.content ?? "";

    // Classify: route model + detect language + detect recommendation changes.
    const cls = await classifyRequest(LOVABLE_API_KEY, String(lastUser), currentTopics);

    // Apply recommendation changes if requested — faqat JWT dan olingan userId uchun.
    let recNote = "";
    if (userId && (cls.update_recommendations || cls.clear_recommendations)) {
      const newTopics = cls.clear_recommendations ? [] : (cls.update_recommendations ?? []);
      const { error: upErr } = await admin
        .from("ai_preferences")
        .upsert({ user_id: userId, recommendation_topics: newTopics }, { onConflict: "user_id" });
      if (!upErr) {
        recNote = `\n[System: user recommendation topics updated to: ${newTopics.length ? newTopics.join(", ") : "cleared"}]`;
      }
    }

    const model = MODEL_ROUTES[cls.task] ?? MODEL_ROUTES.general;

    const systemPrompt = `You are Alsamos AI — an assistant deeply integrated into the Alsamos superapp (Posts, Marketplace, Map, Payments, Messages, AI).

CRITICAL LANGUAGE RULE:
- Detected user language: "${cls.language}".
- ALWAYS reply in the SAME language the user wrote in. If they switch languages, you switch too.
- Never force Uzbek. Support every language naturally (uz, en, ru, tr, kk, ky, es, fr, de, ar, zh, hi, ...).

Selected task profile: "${cls.task}" (model: ${model}).

Your abilities:
1. Answer questions about the user's wallet, transactions, posts, messages, marketplace items.
2. Help find/compare marketplace products and recommend the best/cheapest/nearest.
3. Generate content: post copy, image prompts, video scripts.
4. Manage the recommendation feed — when the user asks to change what they see, apply it (already handled server-side).
5. Warn on time limits or restricted content.

Safety rules (never break):
- Never spend money, send payments, publish posts, or send messages autonomously — always ask the user to confirm in the UI.
- Never leak another user's private data.
- Flag scam/phishing patterns when you notice them.

Transparency: when you fetch or act on data from a specific module, briefly say which (e.g. "Marketplace'dan qidiryapman..." in the user's language).

SEARCH GROUNDING RULE:\n- If Extra context starts with [SEARCH_GROUNDING], treat it as Alsamos Search indexed web evidence.\n- Prefer that evidence for factual web-dependent claims.\n- Cite supplied sources inline with bracket numbers such as [1], [2].\n- Never invent a source number, URL, fact, or quotation not supported by the supplied context.\n- If indexed evidence is insufficient, say so clearly and distinguish general model knowledge from indexed web evidence.\n
${userContext}${recNote}

Extra context: ${context || "none"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return jsonResponse(
          req,
          { error: "Juda ko'p so'rov. Birozdan so'ng qayta urinib ko'ring.", code: "TOO_MANY_ATTEMPTS" },
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
      console.error("AI gateway error:", response.status, errorText);
      return guardError(req, "SERVER_ERROR", "AI xizmatida xatolik.", 500);
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders(req),
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "X-AI-Model": model,
        "X-AI-Task": cls.task,
        "X-AI-Language": cls.language,
      },
    });
  } catch (error) {
    console.error("AI assistant error:", error);
    return guardError(req, "SERVER_ERROR", "Kutilmagan xatolik yuz berdi.", 500);
  }
});
