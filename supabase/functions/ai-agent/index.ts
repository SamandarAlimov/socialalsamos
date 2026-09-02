// Alsamos AI — agentik yakuniy nuqta.
//
// Bitta so'rov ichida model bir necha marta vositalarni chaqirishi mumkin
// (web qidiruv -> sahifani o'qish -> kod ishga tushirish -> rasm yaratish ...).
// Barcha bosqichlar SSE orqali UI ga real vaqtda uzatiladi:
//
//   data: {"type":"meta","model":"...","task":"code","language":"uz"}
//   data: {"type":"tool_call","id":"...","name":"web_search","args":{...}}
//   data: {"type":"tool_result","id":"...","ok":true,"summary":"...","data":{...}}
//   data: {"type":"delta","text":"..."}
//   data: {"type":"error","message":"..."}
//   data: [DONE]
//
// AI so'rovlari ../_shared/geminiPool.ts orqali ketadi: bir nechta Gemini
// kaliti navbat bilan ishlatiladi, limitga urilgani chetga qo'yiladi, hammasi
// band bo'lsa Lovable gateway'iga qaytiladi.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { guard, preflight, corsHeaders, guardError } from "../_shared/guard.ts";
import { aiFetch, hasGeminiKeys, poolStatus } from "../_shared/geminiPool.ts";
import {
  executeTool,
  specsFor,
  toolsFromGroups,
  type ConnectorRow,
  type ToolContext,
} from "../_shared/aiTools.ts";

const FUNCTION_NAME = "ai-agent";
const RATE_LIMIT = 120;
const RATE_WINDOW_MINUTES = 60;
const MAX_ROUNDS = 8;

const MODEL_ROUTES: Record<string, string> = {
  auto: "google/gemini-3.6-flash",
  fast: "google/gemini-3.1-flash-lite",
  balanced: "google/gemini-3.6-flash",
  coding: "google/gemini-3.6-flash",
  reasoning: "google/gemini-3.1-pro-preview",
  vision: "google/gemini-3.6-flash",
};

const DEFAULT_GROUPS = ["web", "image", "code", "alsamos"];

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<Record<string, unknown>> | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

type PendingCall = { id: string; name: string; args: string };

function sysPrompt(opts: {
  language: string;
  model: string;
  toolNames: string[];
  userContext: string;
  memories: string;
  connectorNames: string[];
}): string {
  return `You are Alsamos AI — a professional, agentic assistant built into the Alsamos superapp (Posts, Marketplace, Map, Payments, Messages, Mini Apps).

LANGUAGE
- Always answer in the language the user wrote in (detected: ${opts.language}). Never force Uzbek.

CAPABILITIES (real tools, use them instead of guessing)
- Available tools this turn: ${opts.toolNames.join(", ") || "(none)"}
- Model in use: ${opts.model}
- Connected plugins: ${opts.connectorNames.join(", ") || "(none)"}

HOW TO WORK
1. Plan briefly, then act. Chain tools when needed (search -> fetch -> compute -> answer).
2. If a fact may be recent, uncertain, or numeric, verify it with web_search / web_fetch and cite sources as [1], [2] matching the tool output order.
3. For math, data transforms, parsing or algorithm checks, ALWAYS verify with run_code instead of computing mentally.
4. When writing code, produce complete, runnable files in fenced blocks with the language tag. Explain only what matters.
5. For images use generate_image; for videos use generate_video. Do not claim you cannot create media when those tools are listed.
6. Use connector tools (list_connector_tools, connector_call) for the user's external apps.
7. computer_task controls the user's own machine through the Alsamos Bridge agent. It is queued and requires the user's explicit approval on that device. Explain what you will run and why, and never queue destructive commands (rm -rf, disk formatting, credential exfiltration).
8. Never spend money, publish posts, or send messages without explicit user confirmation in the UI.
9. If a tool fails, say so plainly, then continue with the best alternative.
10. Be concise by default; expand when the user asks for depth. Use Markdown headings, lists and tables where they help.

USER CONTEXT
${opts.userContext}
${opts.memories}`;
}

async function classify(
  lovableKey: string | undefined,
  lastUserText: string,
): Promise<{ task: string; language: string }> {
  const sys = `Router. Output JSON only: {"task":"fast|balanced|coding|reasoning|vision","language":"BCP-47 code of the user's message"}.
coding = programming/debugging. reasoning = math, multi-step logic, deep analysis, planning, research. vision = about an image/media. fast = trivial lookups or one-liners. balanced = everything else.`;
  try {
    const { response } = await aiFetch({
      lovableKey,
      body: {
        model: MODEL_ROUTES.fast,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: lastUserText.slice(0, 2000) },
        ],
        response_format: { type: "json_object" },
      },
    });
    if (!response.ok) throw new Error(String(response.status));
    const json = await response.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    const task = typeof parsed.task === "string" && MODEL_ROUTES[parsed.task] ? parsed.task : "balanced";
    const language = typeof parsed.language === "string" && parsed.language ? parsed.language : "uz";
    return { task, language };
  } catch (_) {
    return { task: "balanced", language: "uz" };
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
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return guardError(req, "INVALID_REQUEST", "messages massivi talab qilinadi.", 400);
    }

    // Kalit manbalari: GEMINI_API_KEYS / GEMINI_API_KEY_1..10 (asosiy) yoki
    // LOVABLE_API_KEY (zaxira). Ilgari LOVABLE_API_KEY majburiy edi — endi
    // faqat Gemini kalitlari bilan ham to'liq ishlaydi.
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!hasGeminiKeys() && !lovableKey) {
      console.error("No AI credentials: set GEMINI_API_KEYS or LOVABLE_API_KEY");
      return guardError(req, "SERVER_ERROR", "AI xizmati sozlanmagan.", 500);
    }
    const pool = poolStatus();

    const userId = gate.userId;
    const admin = gate.admin;

    // --- vositalar to'plami -------------------------------------------------
    const requestedGroups: string[] = Array.isArray(body.toolGroups) && body.toolGroups.length
      ? body.toolGroups.map(String)
      : DEFAULT_GROUPS;
    const enabled = toolsFromGroups(requestedGroups);

    // --- konnektorlar -------------------------------------------------------
    let connectors: ConnectorRow[] = [];
    if (userId && (enabled.has("connector_call") || enabled.has("list_connector_tools"))) {
      const { data } = await admin
        .from("ai_connectors")
        .select("id, name, kind, base_url, auth_type, auth_token, enabled")
        .eq("user_id", userId)
        .eq("enabled", true);
      connectors = (data ?? []) as ConnectorRow[];
    }

    // --- foydalanuvchi konteksti -------------------------------------------
    let userContext = "(mehmon foydalanuvchi)";
    let memories = "";
    if (userId) {
      const [{ data: profile }, { data: wallet }, { data: mem }] = await Promise.all([
        admin.from("profiles").select("display_name, username").eq("id", userId).maybeSingle(),
        admin.from("wallets").select("balance, currency").eq("user_id", userId).maybeSingle(),
        admin.from("ai_memories").select("key, value").eq("user_id", userId).limit(40),
      ]);
      userContext = `Name: ${profile?.display_name ?? "?"} (@${profile?.username ?? "?"})\nWallet: ${
        wallet?.balance ?? 0
      } ${wallet?.currency ?? "UZS"}`;
      if (mem?.length) {
        memories = `\nREMEMBERED FACTS\n${mem.map((m) => `- ${m.key}: ${m.value}`).join("\n")}`;
      }
    }

    const lastUser = [...body.messages].reverse().find((m: ChatMessage) => m.role === "user");
    const lastUserText = typeof lastUser?.content === "string" ? lastUser.content : "";

    const requestedModel = typeof body.model === "string" ? body.model : "auto";
    const cls = requestedModel === "auto"
      ? await classify(lovableKey, lastUserText)
      : { task: requestedModel, language: "uz" };
    const model = MODEL_ROUTES[cls.task] ?? MODEL_ROUTES.balanced;

    const toolSpecs = specsFor(enabled);
    const ctx: ToolContext = { userId, admin, lovableKey, connectors, enabled };

    const conversation: ChatMessage[] = [
      {
        role: "system",
        content: sysPrompt({
          language: cls.language,
          model,
          toolNames: [...enabled],
          userContext,
          memories,
          connectorNames: connectors.map((c) => c.name),
        }),
      },
      ...(body.messages as ChatMessage[]).map((m) => ({
        role: m.role,
        content: m.content ?? "",
      })),
    ];

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        try {
          send({
            type: "meta",
            model,
            task: cls.task,
            language: cls.language,
            tools: [...enabled],
            keyPool: `${pool.ready}/${pool.total}`,
          });

          for (let round = 0; round < MAX_ROUNDS; round += 1) {
            // Har raund navbatdagi kalit bilan ketadi — uzun agentik zanjirlarda
            // yuk kalitlar orasida tarqaladi va limitga urilish kamayadi.
            const { response: res, provider } = await aiFetch({
              lovableKey,
              body: {
                model,
                messages: conversation,
                stream: true,
                ...(toolSpecs.length ? { tools: toolSpecs, tool_choice: "auto" } : {}),
              },
            });

            if (!res.ok || !res.body) {
              const detail = await res.text().catch(() => "");
              send({
                type: "error",
                message:
                  res.status === 429
                    ? "Juda ko'p so'rov. Birozdan so'ng qayta urinib ko'ring."
                    : res.status === 402
                      ? "AI kreditlari tugagan."
                      : `AI xizmatida xatolik (HTTP ${res.status}).`,
              });
              console.error(`provider error (${provider})`, res.status, detail.slice(0, 500));
              break;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let assistantText = "";
            const pending = new Map<number, PendingCall>();
            let finishReason: string | null = null;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });

              let nl: number;
              while ((nl = buffer.indexOf("\n")) !== -1) {
                let line = buffer.slice(0, nl);
                buffer = buffer.slice(nl + 1);
                if (line.endsWith("\r")) line = line.slice(0, -1);
                if (!line.startsWith("data: ")) continue;
                const raw = line.slice(6).trim();
                if (raw === "[DONE]") continue;

                let parsed: Record<string, any>;
                try {
                  parsed = JSON.parse(raw);
                } catch (_) {
                  continue;
                }

                const choice = parsed.choices?.[0];
                if (!choice) continue;
                if (choice.finish_reason) finishReason = choice.finish_reason;

                const delta = choice.delta ?? {};
                if (typeof delta.content === "string" && delta.content) {
                  assistantText += delta.content;
                  send({ type: "delta", text: delta.content });
                }

                for (const call of delta.tool_calls ?? []) {
                  const index = Number(call.index ?? 0);
                  const slot = pending.get(index) ?? { id: "", name: "", args: "" };
                  if (call.id) slot.id = call.id;
                  if (call.function?.name) slot.name = call.function.name;
                  if (call.function?.arguments) slot.args += call.function.arguments;
                  pending.set(index, slot);
                }
              }
            }

            const calls = [...pending.values()].filter((c) => c.name);

            if (!calls.length) {
              // Yakuniy javob tugadi.
              if (finishReason === "length") {
                send({ type: "notice", message: "Javob uzunlik chegarasiga yetdi." });
              }
              break;
            }

            conversation.push({
              role: "assistant",
              content: assistantText || null,
              tool_calls: calls.map((c) => ({
                id: c.id || crypto.randomUUID(),
                type: "function",
                function: { name: c.name, arguments: c.args || "{}" },
              })),
            });

            // Vositalarni parallel bajaramiz.
            const results = await Promise.all(
              calls.map(async (call) => {
                let args: Record<string, unknown> = {};
                try {
                  args = call.args ? JSON.parse(call.args) : {};
                } catch (_) {
                  args = {};
                }
                send({ type: "tool_call", id: call.id, name: call.name, args });
                const outcome = await executeTool(call.name, args, ctx);
                send({
                  type: "tool_result",
                  id: call.id,
                  name: call.name,
                  ok: outcome.ok,
                  summary: outcome.text.slice(0, 600),
                  data: outcome.data ?? null,
                });
                return { call, outcome };
              }),
            );

            for (const { call, outcome } of results) {
              conversation.push({
                role: "tool",
                tool_call_id: call.id || crypto.randomUUID(),
                content: `${outcome.ok ? "OK" : "ERROR"}: ${outcome.text}`.slice(0, 24000),
              });
            }

            if (round === MAX_ROUNDS - 1) {
              send({
                type: "notice",
                message: "Vositalar chaqirig'i chegarasiga yetdi — mavjud natijalar bilan javob berildi.",
              });
            }
          }
        } catch (error) {
          console.error("ai-agent stream error", error);
          send({
            type: "error",
            message: error instanceof Error ? error.message : "Kutilmagan xatolik.",
          });
        } finally {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders(req),
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "X-AI-Model": model,
        "X-AI-Task": cls.task,
        "X-AI-Key-Pool": `${pool.ready}/${pool.total}`,
      },
    });
  } catch (error) {
    console.error("ai-agent error:", error);
    return guardError(req, "SERVER_ERROR", "Kutilmagan xatolik yuz berdi.", 500);
  }
});
