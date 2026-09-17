// Alsamos AI — agentik yakuniy nuqta.
//
// Bitta so'rov ichida model bir necha marta vositalarni chaqirishi mumkin.
// Barcha bosqichlar SSE orqali UI ga real vaqtda uzatiladi.

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
import {
  executePlatformTool,
  platformSpecsFor,
  PLATFORM_TOOL_NAMES,
} from "../_shared/aiPlatformTools.ts";
import {
  enableGithubTools,
  executeGithubTool,
  githubSpecsFor,
} from "../_shared/githubAgentTools.ts";

const FUNCTION_NAME = "ai-agent";
const RATE_LIMIT = 120;
const RATE_WINDOW_MINUTES = 60;
// Coding tasks need enough room for: inspect -> read files -> branch -> commit -> PR -> CI.
const MAX_ROUNDS = 14;

const MODEL_ROUTES: Record<string, string> = {
  auto: "google/gemini-3.6-flash",
  fast: "google/gemini-3.1-flash-lite",
  balanced: "google/gemini-3.6-flash",
  coding: "google/gemini-3.6-flash",
  reasoning: "google/gemini-3.1-pro-preview",
  vision: "google/gemini-3.6-flash",
};

const DEFAULT_GROUPS = [
  "web",
  "image",
  "video",
  "code",
  "alsamos",
  "connectors",
  "computer",
];

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

FIRST-PARTY USER DATA
- my_search_insights reads ONLY the signed-in user's Alsamos search history. Use it for questions about what they searched most/recently; never guess from memory.
- my_payment_history reads ONLY the signed-in user's Wallet ledger. Use it for their payment/transfer history, date ranges and counterparties. It is read-only and can never move money.
- get_recommendation_preferences reads explicit feed preferences.
- update_recommendation_preferences changes the REAL recommendation profile. Use it only when the user explicitly asks to change what Home/Videos recommend. Do not substitute remember() for a feed-tuning request.
- If AI personalization is disabled, private first-party tools will refuse access; respect that decision.

HOW TO WORK
1. Plan briefly, then act. Chain tools when needed (search -> fetch -> compute -> answer).
2. If a fact may be recent, uncertain, or numeric, verify it with web_search / web_fetch and cite sources as [1], [2] matching the tool output order.
3. For math, data transforms, parsing or algorithm checks, verify with run_code when useful. A broken/unavailable sandbox is NOT a blocker for GitHub engineering because native GitHub tools work through the GitHub API and CI can validate repository changes.
4. For a GitHub coding request, act like a coding agent: identify the exact repo -> inspect tree/search -> read relevant files -> create a feature/fix branch -> commit complete file changes with github_commit_files -> open a PR -> check github_get_commit_checks. Do not merely paste a patch when the user asked you to implement it.
5. Never invent repository contents, changed files, commit SHAs, PRs, deployments, or test results. Use the GitHub tools and report their real results.
6. github_commit_files refuses the default branch by design. Never try to bypass that. Do not commit credentials, tokens, .env secrets, private keys, generated build output, or unrelated files. Keep changes scoped to the user's request.
7. Native GitHub tools are preferred for repository engineering. Use list_connector_tools / connector_call for other external apps or when the user explicitly needs an MCP plugin.
8. When writing code only as an answer (not editing a connected repo), produce complete runnable code in fenced blocks. When editing a repo, use the actual repository tools instead of duplicating every file in chat.
9. MEDIA: when the user asks for a picture, logo, poster, illustration, mockup, or an edit of an image, call generate_image immediately. When they ask for a video, clip or animation, call generate_video; if it returns a running job id, poll media_job_status.
10. computer_task controls the user's own machine through the Alsamos Bridge agent. It is queued and requires the user's explicit approval on that device. Never queue destructive commands or credential exfiltration.
11. Never spend money, publish posts, send messages, merge a pull request, or perform an irreversible destructive action without explicit user authorization. Native GitHub coding tools intentionally stop at a PR; they do not expose merge/delete-repository operations.
12. If a tool fails, say so plainly with the error, then continue with the best alternative. Be concise by default; expand when the user asks for depth.

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

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!hasGeminiKeys() && !lovableKey) {
      console.error("No AI credentials: set GEMINI_API_KEYS or LOVABLE_API_KEY");
      return guardError(req, "SERVER_ERROR", "AI xizmati sozlanmagan.", 500);
    }
    const pool = poolStatus();

    const userId = gate.userId;
    const admin = gate.admin;

    const requestedGroups: string[] = Array.isArray(body.toolGroups) && body.toolGroups.length
      ? body.toolGroups.map(String)
      : DEFAULT_GROUPS;
    const enabled = toolsFromGroups(requestedGroups);
    if (requestedGroups.includes("alsamos")) {
      for (const name of PLATFORM_TOOL_NAMES) enabled.add(name);
    }
    // Native repository engineering is part of the code/connectors capability.
    enableGithubTools(enabled, requestedGroups);

    let connectors: ConnectorRow[] = [];
    if (userId && (enabled.has("connector_call") || enabled.has("list_connector_tools"))) {
      const { data } = await admin
        .from("ai_connectors")
        .select("id, name, kind, base_url, auth_type, auth_token, enabled")
        .eq("user_id", userId)
        .eq("enabled", true);
      connectors = (data ?? []) as ConnectorRow[];
    }

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

    const toolSpecs = [
      ...specsFor(enabled),
      ...platformSpecsFor(enabled),
      ...githubSpecsFor(enabled),
    ];
    const ctx: ToolContext = {
      userId,
      admin,
      lovableKey: lovableKey ?? "",
      connectors,
      enabled,
    };

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

            const results = await Promise.all(
              calls.map(async (call) => {
                let args: Record<string, unknown> = {};
                try {
                  args = call.args ? JSON.parse(call.args) : {};
                } catch (_) {
                  args = {};
                }
                send({ type: "tool_call", id: call.id, name: call.name, args });

                const githubOutcome = await executeGithubTool(call.name, args, ctx);
                const platformOutcome = githubOutcome ?? await executePlatformTool(call.name, args, ctx);
                const outcome = platformOutcome ?? await executeTool(call.name, args, ctx);

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