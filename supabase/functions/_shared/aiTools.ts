// Alsamos AI — vositalar reyestri (tool registry).
//
// Har bir vosita OpenAI-uslubidagi function schema bilan e'lon qilinadi va
// `executeTool` orqali bajariladi. `ai-agent` funksiyasi shu reyestrni
// ishlatadi. Yangi imkoniyat qo'shish = shu faylga bitta yozuv qo'shish.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchPageText, isPublicHttpUrl } from "./net.ts";
import { runSandboxCode } from "./sandbox.ts";
import { duckDuckGoSearch, type WebHit } from "./webFallback.ts";
import {
  generateImageBytes,
  startVideo,
  uploadGeneratedImage,
  waitForVideo,
  type MediaJobRow,
} from "./geminiMedia.ts";

export type ToolSpec = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ConnectorRow = {
  id: string;
  name: string;
  kind: string; // 'mcp' | 'http'
  base_url: string;
  auth_type: string | null;
  auth_token: string | null;
  enabled: boolean;
};

export type ToolContext = {
  userId: string | null;
  admin: SupabaseClient;
  lovableKey: string;
  connectors: ConnectorRow[];
  /** Foydalanuvchi UI da yoqqan vositalar. */
  enabled: Set<string>;
};

export type ToolOutcome = {
  ok: boolean;
  /** Modelga qaytadigan matn. */
  text: string;
  /** UI ga yuboriladigan qo'shimcha ma'lumot (rasm, manbalar, loglar...). */
  data?: Record<string, unknown>;
};

// ------------------------------------------------------------------ schemas

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });

export const TOOL_SPECS: Record<string, ToolSpec> = {
  web_search: {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the public web for current information, news, prices, documentation. Use whenever the answer depends on facts that may have changed or that you are unsure about.",
      parameters: {
        type: "object",
        properties: {
          query: str("Search query in the most useful language for the topic."),
          max_results: num("How many results to return (1-8, default 5)."),
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  web_fetch: {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Open a specific public URL and read its text content. Use after web_search when you need the full page, or when the user gives you a link.",
      parameters: {
        type: "object",
        properties: { url: str("Absolute http(s) URL.") },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  generate_image: {
    type: "function",
    function: {
      name: "generate_image",
      description:
        "Generate or edit an image from a text description. Call this whenever the user asks for a picture, logo, poster, illustration, mockup or asks you to change an existing image — do not ask them to enable anything first. The image is shown to the user automatically.",
      parameters: {
        type: "object",
        properties: {
          prompt: str("Detailed English description of the desired image."),
          edit_image_url: str("Optional source image URL to edit instead of creating from scratch."),
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  },
  generate_video: {
    type: "function",
    function: {
      name: "generate_video",
      description:
        "Generate a short video from a text prompt (optionally from a start image). Rendering takes about 1-3 minutes: this tool waits as long as it can and returns the finished video URL, or a job id you must poll with media_job_status. Call it whenever the user asks for a video, clip or animation.",
      parameters: {
        type: "object",
        properties: {
          prompt: str("Detailed English description of the video."),
          seconds: num("Desired duration in seconds (2-12, default 5)."),
          image_url: str("Optional first-frame image URL."),
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  },
  media_job_status: {
    type: "function",
    function: {
      name: "media_job_status",
      description:
        "Check (and keep waiting for) a media generation job started by generate_video. Returns the finished media URL when rendering completes.",
      parameters: {
        type: "object",
        properties: { job_id: str("Job id returned by generate_video.") },
        required: ["job_id"],
        additionalProperties: false,
      },
    },
  },
  run_code: {
    type: "function",
    function: {
      name: "run_code",
      description:
        "Execute code in an isolated Ubuntu Docker sandbox when configured, otherwise JavaScript in a restricted Deno fallback. Use for calculations, data transforms, algorithm checks and verifying code you wrote.",
      parameters: {
        type: "object",
        properties: {
          language: {
            type: "string",
            enum: ["javascript", "typescript", "python", "bash"],
            description: "Programming language to run.",
          },
          code: str("Source code to run."),
          stdin: str("Optional stdin passed to the program."),
          timeout_ms: num("Timeout in ms (max 30000 on remote sandbox)."),
        },
        required: ["code"],
        additionalProperties: false,
      },
    },
  },
  search_posts: {
    type: "function",
    function: {
      name: "search_posts",
      description: "Search Alsamos social posts by keyword. Newest matches first.",
      parameters: {
        type: "object",
        properties: { query: str("Keyword or phrase."), limit: num("Max results (1-25).") },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  search_marketplace: {
    type: "function",
    function: {
      name: "search_marketplace",
      description: "Search Alsamos marketplace products, optionally with a maximum price.",
      parameters: {
        type: "object",
        properties: {
          query: str("Product keyword."),
          max_price: num("Optional maximum price."),
          limit: num("Max results (1-25)."),
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  remember: {
    type: "function",
    function: {
      name: "remember",
      description:
        "Store a durable fact or preference about the signed-in user so future conversations can use it. Only store things the user clearly wants remembered.",
      parameters: {
        type: "object",
        properties: { key: str("Short slug, e.g. 'preferred_language'."), value: str("The fact to remember.") },
        required: ["key", "value"],
        additionalProperties: false,
      },
    },
  },
  list_connector_tools: {
    type: "function",
    function: {
      name: "list_connector_tools",
      description:
        "List the tools exposed by the user's connected plugins (MCP servers). Call this before connector_call when you do not know the tool names.",
      parameters: {
        type: "object",
        properties: { connector: str("Optional connector name or id to inspect.") },
        additionalProperties: false,
      },
    },
  },
  connector_call: {
    type: "function",
    function: {
      name: "connector_call",
      description:
        "Call a tool on one of the user's connected MCP plugins (Notion, GitHub, Google Drive, custom servers...).",
      parameters: {
        type: "object",
        properties: {
          connector: str("Connector name or id."),
          tool: str("Tool name as returned by list_connector_tools."),
          arguments: { type: "object", description: "Tool arguments object.", additionalProperties: true },
        },
        required: ["connector", "tool"],
        additionalProperties: false,
      },
    },
  },
  computer_task: {
    type: "function",
    function: {
      name: "computer_task",
      description:
        "Queue an action for the user's own computer through the Alsamos Bridge agent: run a shell command, read/write a local file, open an app or URL, take a screenshot, or click/type. The action only runs after the user approves it on that device. Always explain why you need it.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "shell",
              "read_file",
              "write_file",
              "list_dir",
              "open",
              "screenshot",
              "click",
              "type_text",
              "key",
            ],
            description: "What the local agent should do.",
          },
          payload: {
            type: "object",
            description:
              "Action arguments: shell -> {command}, read_file/list_dir -> {path}, write_file -> {path, content}, open -> {target}, click -> {x, y}, type_text -> {text}, key -> {combo}.",
            additionalProperties: true,
          },
          reason: str("Short user-facing reason for this action."),
          device_id: str("Optional target device id; defaults to the user's last active device."),
        },
        required: ["action", "reason"],
        additionalProperties: false,
      },
    },
  },
  computer_task_result: {
    type: "function",
    function: {
      name: "computer_task_result",
      description:
        "Read the current status/output of a previously queued computer_task. Poll this after computer_task; if it is still pending, tell the user to approve it on their device.",
      parameters: {
        type: "object",
        properties: { task_id: str("Task id returned by computer_task.") },
        required: ["task_id"],
        additionalProperties: false,
      },
    },
  },
};

/** UI dagi imkoniyat guruhi -> vositalar. */
export const TOOL_GROUPS: Record<string, string[]> = {
  web: ["web_search", "web_fetch"],
  image: ["generate_image"],
  video: ["generate_video", "media_job_status"],
  code: ["run_code"],
  alsamos: ["search_posts", "search_marketplace", "remember"],
  connectors: ["list_connector_tools", "connector_call"],
  computer: ["computer_task", "computer_task_result"],
};

export function specsFor(enabled: Set<string>): ToolSpec[] {
  return Object.entries(TOOL_SPECS)
    .filter(([name]) => enabled.has(name))
    .map(([, spec]) => spec);
}

export function toolsFromGroups(groups: string[]): Set<string> {
  const out = new Set<string>();
  for (const group of groups) {
    for (const tool of TOOL_GROUPS[group] ?? []) out.add(tool);
  }
  return out;
}

// ------------------------------------------------------------------ helpers

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.round(n), min), max);
}

function fail(text: string): ToolOutcome {
  return { ok: false, text };
}

// ------------------------------------------------------------------ web

async function tavilySearch(key: string, query: string, max: number): Promise<WebHit[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: max,
      search_depth: "basic",
      include_answer: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const json = await res.json();
  return (json.results ?? []).map((r: Record<string, unknown>) => ({
    title: String(r.title ?? ""),
    url: String(r.url ?? ""),
    snippet: String(r.content ?? "").slice(0, 600),
  }));
}

async function braveSearch(key: string, query: string, max: number): Promise<WebHit[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(max));
  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
  });
  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
  const json = await res.json();
  return (json.web?.results ?? []).map((r: Record<string, unknown>) => ({
    title: String(r.title ?? ""),
    url: String(r.url ?? ""),
    snippet: String(r.description ?? "").slice(0, 600),
  }));
}

async function webSearch(args: Record<string, unknown>): Promise<ToolOutcome> {
  const query = String(args.query ?? "").trim();
  if (!query) return fail("query bo'sh.");
  const max = clamp(args.max_results, 1, 8, 5);

  const tavily = Deno.env.get("TAVILY_API_KEY");
  const brave = Deno.env.get("BRAVE_SEARCH_API_KEY");

  const attempts: Array<() => Promise<WebHit[]>> = [];
  if (tavily) attempts.push(() => tavilySearch(tavily, query, max));
  if (brave) attempts.push(() => braveSearch(brave, query, max));
  attempts.push(() => duckDuckGoSearch(query, max));

  let hits: WebHit[] = [];
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      hits = await attempt();
      if (hits.length) break;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (!hits.length) {
    return fail(`Web qidiruv natija bermadi. ${errors.join("; ")}`.trim());
  }

  const text = hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.url}\n${h.snippet}`).join("\n\n");
  return { ok: true, text, data: { sources: hits } };
}

async function webFetch(args: Record<string, unknown>): Promise<ToolOutcome> {
  const url = String(args.url ?? "").trim();
  if (!url) return fail("url bo'sh.");
  try {
    const page = await fetchPageText(url);
    return {
      ok: true,
      text: `# ${page.title ?? page.url}\nURL: ${page.url}\n\n${page.text}${
        page.truncated ? "\n\n[...qisqartirildi]" : ""
      }`,
      data: {
        sources: [
          { title: page.title ?? page.url, url: page.url, snippet: page.text.slice(0, 300) },
        ],
      },
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

// ------------------------------------------------------------------ media
//
// MUHIM: rasm/video chaqiruvlari _shared/geminiMedia.ts orqali, u esa
// _shared/geminiPool.ts kalitlar hovuzi orqali ketadi. To'g'ridan-to'g'ri
// gateway chaqiruvi qilinmaydi (avval shu sabab 401/402 xatolar chiqardi).

async function generateImage(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const prompt = String(args.prompt ?? "").trim();
  if (!prompt) return fail("prompt bo'sh.");
  const editUrl = typeof args.edit_image_url === "string" ? args.edit_image_url : null;
  if (editUrl && !editUrl.startsWith("data:image/") && !isPublicHttpUrl(editUrl)) {
    return fail("edit_image_url ruxsat etilmagan.");
  }

  let image;
  try {
    image = await generateImageBytes({
      prompt,
      imageUrl: editUrl,
      lovableKey: ctx.lovableKey || undefined,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  // Imkon bo'lsa storage'ga yuklaymiz — data URL chatda juda katta bo'lib ketadi.
  let imageUrl = `data:${image.mimeType};base64,${image.base64}`;
  if (ctx.userId) {
    try {
      imageUrl = await uploadGeneratedImage(ctx.admin, ctx.userId, image);
    } catch (error) {
      console.warn("generated image upload failed", error);
    }
  }

  return {
    ok: true,
    text: "Rasm muvaffaqiyatli yaratildi va foydalanuvchiga ko'rsatildi. Qisqacha izoh bering.",
    data: { imageUrl, prompt, model: image.model },
  };
}

async function generateVideo(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const prompt = String(args.prompt ?? "").trim();
  if (!prompt) return fail("prompt bo'sh.");
  if (!ctx.userId) return fail("Video yaratish uchun tizimga kirish kerak.");
  const seconds = clamp(args.seconds, 2, 12, 5);
  const imageUrl =
    typeof args.image_url === "string" && isPublicHttpUrl(args.image_url) ? args.image_url : null;

  const { data: job, error } = await ctx.admin
    .from("ai_media_jobs")
    .insert({
      user_id: ctx.userId,
      kind: "video",
      status: "running",
      prompt,
      params: { seconds, image_url: imageUrl },
    })
    .select("id, user_id, params")
    .single();

  if (error || !job) {
    return fail(`Video vazifasi yaratilmadi: ${error?.message ?? "noma'lum xato"}`);
  }

  let started;
  try {
    started = await startVideo({ prompt, seconds, imageUrl });
  } catch (startError) {
    const message = startError instanceof Error ? startError.message : String(startError);
    await ctx.admin.from("ai_media_jobs").update({ status: "failed", error: message }).eq("id", job.id);
    return fail(message);
  }

  const params = { seconds, image_url: imageUrl, operation: started.operation, model: started.model };
  await ctx.admin.from("ai_media_jobs").update({ params }).eq("id", job.id);

  const outcome = await waitForVideo(ctx.admin, { id: job.id, user_id: ctx.userId, params });

  if (outcome.status === "done" && outcome.url) {
    return {
      ok: true,
      text: "Video tayyor bo'ldi va foydalanuvchiga ko'rsatildi. Qisqacha izoh bering.",
      data: { videoUrl: outcome.url, jobId: job.id, kind: "video", prompt, seconds, model: started.model },
    };
  }

  if (outcome.status === "failed") {
    return fail(`Video yaratilmadi: ${outcome.error ?? "noma'lum xato"}`);
  }

  return {
    ok: true,
    text:
      `Video hali render qilinmoqda. job_id=${job.id}. ` +
      "Foydalanuvchiga bir daqiqacha kutishini aytib, so'ng media_job_status(job_id) bilan tekshiring.",
    data: { jobId: job.id, kind: "video", status: "running", prompt, seconds },
  };
}

async function mediaJobStatus(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  if (!ctx.userId) return fail("Tizimga kirish kerak.");
  const jobId = String(args.job_id ?? "").trim();
  if (!jobId) return fail("job_id talab qilinadi.");

  const { data, error } = await ctx.admin
    .from("ai_media_jobs")
    .select("id, user_id, kind, status, prompt, params, output_url, error")
    .eq("id", jobId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("Vazifa topilmadi.");

  if (data.status === "done" && data.output_url) {
    return {
      ok: true,
      text: "Media tayyor va foydalanuvchiga ko'rsatildi.",
      data:
        data.kind === "video"
          ? { videoUrl: data.output_url, jobId: data.id, kind: data.kind }
          : { imageUrl: data.output_url, jobId: data.id, kind: data.kind },
    };
  }

  if (data.status === "failed") {
    return fail(`Media yaratilmadi: ${data.error ?? "noma'lum xato"}`);
  }

  // Hali ishlayapti — pollingni davom ettiramiz.
  const job = data as MediaJobRow;
  const outcome = await waitForVideo(ctx.admin, job, 60_000);

  if (outcome.status === "done" && outcome.url) {
    return {
      ok: true,
      text: "Video tayyor bo'ldi va foydalanuvchiga ko'rsatildi.",
      data: { videoUrl: outcome.url, jobId: job.id, kind: "video" },
    };
  }
  if (outcome.status === "failed") {
    return fail(`Video yaratilmadi: ${outcome.error ?? "noma'lum xato"}`);
  }
  return {
    ok: true,
    text: `Video hali tayyor emas (job_id=${job.id}). Yana bir marta tekshirish mumkin.`,
    data: { jobId: job.id, status: "running", kind: "video" },
  };
}

// ------------------------------------------------------------------ code

async function runCode(args: Record<string, unknown>): Promise<ToolOutcome> {
  const code = String(args.code ?? "");
  if (!code.trim()) return fail("code bo'sh.");
  const timeout = clamp(args.timeout_ms, 200, 30000, 5000);
  const result = await runSandboxCode(code, {
    language: args.language,
    timeoutMs: timeout,
    stdin: typeof args.stdin === "string" ? args.stdin : "",
  });
  const parts = [
    `ok: ${result.ok}`,
    `language: ${result.language ?? args.language ?? "javascript"}`,
    result.stdout !== undefined
      ? `stdout:\n${result.stdout || "(bo'sh)"}`
      : result.logs.length
        ? `stdout:\n${result.logs.join("\n")}`
        : "stdout: (bo'sh)",
    result.stderr ? `stderr:\n${result.stderr}` : "",
    typeof result.exitCode === "number" ? `exit_code: ${result.exitCode}` : "",
    result.result !== null && result.result !== undefined
      ? `return: ${JSON.stringify(result.result).slice(0, 4000)}`
      : "return: undefined",
    result.error ? `error: ${result.error}` : "",
    `duration: ${result.durationMs} ms`,
  ].filter(Boolean);
  return { ok: result.ok, text: parts.join("\n"), data: { execution: result, code } };
}

// ------------------------------------------------------------------ alsamos

async function searchPosts(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const query = String(args.query ?? "").trim();
  if (!query) return fail("query bo'sh.");
  const limit = clamp(args.limit, 1, 25, 10);
  const { data, error } = await ctx.admin
    .from("posts")
    .select("id, content, created_at, likes_count, comments_count")
    .ilike("content", `%${query}%`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return fail(error.message);
  if (!data?.length) return { ok: true, text: "Mos post topilmadi." };
  return { ok: true, text: JSON.stringify(data), data: { posts: data } };
}

async function searchMarketplace(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const query = String(args.query ?? "").trim();
  const limit = clamp(args.limit, 1, 25, 12);
  let q = ctx.admin
    .from("products")
    .select("id, title, description, price, currency, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (query) q = q.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
  if (Number.isFinite(Number(args.max_price))) q = q.lte("price", Number(args.max_price));
  const { data, error } = await q;
  if (error) return fail(error.message);
  if (!data?.length) return { ok: true, text: "Mos mahsulot topilmadi." };
  return { ok: true, text: JSON.stringify(data), data: { products: data } };
}

async function remember(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  if (!ctx.userId) return fail("Eslab qolish uchun tizimga kirish kerak.");
  const key = String(args.key ?? "").trim().slice(0, 80);
  const value = String(args.value ?? "").trim().slice(0, 2000);
  if (!key || !value) return fail("key va value talab qilinadi.");
  const { error } = await ctx.admin
    .from("ai_memories")
    .upsert({ user_id: ctx.userId, key, value }, { onConflict: "user_id,key" });
  if (error) return fail(error.message);
  return { ok: true, text: `Eslab qoldim: ${key} = ${value}`, data: { key, value } };
}

// ------------------------------------------------------------------ connectors (MCP)

function findConnector(ctx: ToolContext, ref: unknown): ConnectorRow | null {
  const needle = String(ref ?? "").trim().toLowerCase();
  if (!needle) return ctx.connectors[0] ?? null;
  return (
    ctx.connectors.find((c) => c.id.toLowerCase() === needle) ??
    ctx.connectors.find((c) => c.name.toLowerCase() === needle) ??
    ctx.connectors.find((c) => c.name.toLowerCase().includes(needle)) ??
    null
  );
}

async function mcpRpc(
  connector: ConnectorRow,
  method: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!isPublicHttpUrl(connector.base_url)) throw new Error("Connector URL ruxsat etilmagan.");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (connector.auth_token) {
    headers.Authorization =
      !connector.auth_type || connector.auth_type === "bearer"
        ? `Bearer ${connector.auth_token}`
        : connector.auth_token;
  }

  const res = await fetch(connector.base_url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Connector HTTP ${res.status}: ${raw.slice(0, 300)}`);

  // Ba'zi MCP serverlari SSE bilan javob beradi.
  let payloadText = raw;
  if (raw.startsWith("event:") || raw.includes("\ndata: ")) {
    const line = raw.split("\n").find((l) => l.startsWith("data: "));
    payloadText = line ? line.slice(6) : raw;
  }
  const json = JSON.parse(payloadText);
  if (json.error) throw new Error(json.error.message ?? "Connector xatosi.");
  return json.result ?? {};
}

async function listConnectorTools(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  if (!ctx.connectors.length) {
    return {
      ok: true,
      text:
        "Foydalanuvchida ulangan plugin yo'q. AI sahifasidagi 'Konnektorlar' oynasidan MCP server qo'shish mumkin.",
    };
  }
  const targets = args.connector
    ? ([findConnector(ctx, args.connector)].filter(Boolean) as ConnectorRow[])
    : ctx.connectors;
  const lines: string[] = [];
  const catalog: Record<string, unknown>[] = [];
  for (const connector of targets) {
    try {
      const result = await mcpRpc(connector, "tools/list", {});
      const tools = (result.tools ?? []) as Array<Record<string, unknown>>;
      lines.push(
        `## ${connector.name} (id: ${connector.id})\n` +
          tools
            .map((t) => `- ${t.name}: ${String(t.description ?? "").slice(0, 200)}`)
            .join("\n"),
      );
      catalog.push({ connector: connector.name, id: connector.id, tools });
    } catch (error) {
      lines.push(
        `## ${connector.name}: XATO — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { ok: true, text: lines.join("\n\n"), data: { connectors: catalog } };
}

async function connectorCall(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const connector = findConnector(ctx, args.connector);
  if (!connector) return fail("Bunday connector topilmadi.");
  const tool = String(args.tool ?? "").trim();
  if (!tool) return fail("tool nomi talab qilinadi.");
  const toolArgs = (args.arguments ?? {}) as Record<string, unknown>;
  try {
    const result = await mcpRpc(connector, "tools/call", { name: tool, arguments: toolArgs });
    const content = (result.content ?? []) as Array<Record<string, unknown>>;
    const text =
      content
        .map((item) => (item.type === "text" ? String(item.text ?? "") : `[${item.type}]`))
        .join("\n")
        .slice(0, 12000) || JSON.stringify(result).slice(0, 12000);
    return { ok: !result.isError, text, data: { connector: connector.name, tool, result } };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

// ------------------------------------------------------------------ computer control

async function computerTask(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  if (!ctx.userId) return fail("Kompyuterni boshqarish uchun tizimga kirish kerak.");
  const action = String(args.action ?? "").trim();
  const reason = String(args.reason ?? "").trim().slice(0, 500);
  if (!action) return fail("action talab qilinadi.");
  if (!reason) return fail("reason talab qilinadi — foydalanuvchi sababini ko'rishi kerak.");

  const deviceId = typeof args.device_id === "string" && args.device_id ? args.device_id : null;
  const { data, error } = await ctx.admin
    .from("ai_computer_tasks")
    .insert({
      user_id: ctx.userId,
      device_id: deviceId,
      action,
      payload: (args.payload ?? {}) as Record<string, unknown>,
      reason,
      status: "pending_approval",
    })
    .select("id, status")
    .single();
  if (error) return fail(`Vazifa yaratilmadi: ${error.message}`);

  return {
    ok: true,
    text:
      `Vazifa navbatga qo'yildi. task_id=${data.id}, status=${data.status}. ` +
      "Foydalanuvchi Alsamos Bridge ilovasida tasdiqlamaguncha bajarilmaydi. " +
      "Tasdiqlashni so'rang, so'ng computer_task_result bilan natijani tekshiring.",
    data: { taskId: data.id, action, status: data.status, reason },
  };
}

async function computerTaskResult(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  if (!ctx.userId) return fail("Tizimga kirish kerak.");
  const taskId = String(args.task_id ?? "").trim();
  if (!taskId) return fail("task_id talab qilinadi.");
  const { data, error } = await ctx.admin
    .from("ai_computer_tasks")
    .select("id, action, status, result, error, updated_at")
    .eq("id", taskId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("Vazifa topilmadi.");
  return { ok: true, text: JSON.stringify(data).slice(0, 12000), data: { task: data } };
}

// ------------------------------------------------------------------ dispatcher

const EXECUTORS: Record<
  string,
  (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolOutcome>
> = {
  web_search: (a) => webSearch(a),
  web_fetch: (a) => webFetch(a),
  generate_image: generateImage,
  generate_video: generateVideo,
  media_job_status: mediaJobStatus,
  run_code: (a) => runCode(a),
  search_posts: searchPosts,
  search_marketplace: searchMarketplace,
  remember: remember,
  list_connector_tools: listConnectorTools,
  connector_call: connectorCall,
  computer_task: computerTask,
  computer_task_result: computerTaskResult,
};

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const executor = EXECUTORS[name];
  if (!executor) return fail(`"${name}" nomli vosita mavjud emas.`);
  if (!ctx.enabled.has(name)) return fail(`"${name}" vositasi bu suhbatda o'chirilgan.`);
  try {
    return await executor(args, ctx);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
