// Ishonchsiz JavaScript kodini ishga tushirish uchun minimal sandbox.
//
// 1-urinish: ruxsatlari o'chirilgan Deno Web Worker (tarmoq/fayl yo'q).
// 2-urinish (worker qo'llab-quvvatlanmasa): xavfli globallar berkitilgan
//    `AsyncFunction` + qattiq timeout.
// Ikkala holatda ham console chiqishi to'planadi va natija JSON qilinadi.

export type SandboxResult = {
  ok: boolean;
  logs: string[];
  result: unknown;
  error: string | null;
  durationMs: number;
  isolated: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: string | null;
  timedOut?: boolean;
  language?: string;
};

const MAX_LOGS = 200;
const MAX_LOG_CHARS = 4000;

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch (_) {
    return String(value);
  }
}

async function runInWorker(code: string, timeoutMs: number): Promise<SandboxResult> {
  const started = Date.now();
  const workerUrl = new URL("./sandbox-worker.ts", import.meta.url).href;
  // deno.permissions: "none" -> tarmoq, fayl, env yo'q.
  const worker = new Worker(workerUrl, {
    type: "module",
    // @ts-expect-error: Supabase Edge Runtime kengaytmasi
    deno: { permissions: "none" },
  });

  return await new Promise<SandboxResult>((resolve) => {
    let settled = false;
    const finish = (payload: Partial<SandboxResult>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        worker.terminate();
      } catch (_) {
        // noop
      }
      resolve({
        ok: false,
        logs: [],
        result: null,
        error: null,
        durationMs: Date.now() - started,
        isolated: true,
        ...payload,
      });
    };

    const timer = setTimeout(
      () => finish({ ok: false, error: `Vaqt tugadi (${timeoutMs} ms).` }),
      timeoutMs,
    );

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data ?? {};
      finish({
        ok: Boolean(data.ok),
        logs: Array.isArray(data.logs) ? data.logs.slice(0, MAX_LOGS) : [],
        result: data.result ?? null,
        error: data.error ?? null,
      });
    };
    worker.onerror = (event: ErrorEvent) => {
      finish({ ok: false, error: event.message || "Worker xatosi." });
    };

    worker.postMessage({ code, timeoutMs });
  });
}

async function runInline(code: string, timeoutMs: number): Promise<SandboxResult> {
  const started = Date.now();
  const logs: string[] = [];
  const push = (level: string, args: unknown[]) => {
    if (logs.length >= MAX_LOGS) return;
    logs.push(`[${level}] ${args.map(safeStringify).join(" ")}`.slice(0, MAX_LOG_CHARS));
  };
  const sandboxConsole = {
    log: (...a: unknown[]) => push("log", a),
    info: (...a: unknown[]) => push("info", a),
    warn: (...a: unknown[]) => push("warn", a),
    error: (...a: unknown[]) => push("error", a),
    debug: (...a: unknown[]) => push("debug", a),
  };

  const blocked = [
    "fetch",
    "Deno",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "importScripts",
    "Worker",
    "localStorage",
    "sessionStorage",
    "caches",
    "navigator",
    "process",
    "globalThis",
    "self",
    "window",
  ];

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(
      "console",
      ...blocked,
      `"use strict";\n${code}`,
    );
    const result = await Promise.race([
      fn(sandboxConsole, ...blocked.map(() => undefined)),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Vaqt tugadi (${timeoutMs} ms).`)), timeoutMs)
      ),
    ]);
    return {
      ok: true,
      logs,
      result: result === undefined ? null : JSON.parse(safeStringify(result) === undefined ? "null" : JSON.stringify(result ?? null)),
      error: null,
      durationMs: Date.now() - started,
      isolated: false,
    };
  } catch (error) {
    return {
      ok: false,
      logs,
      result: null,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
      isolated: false,
    };
  }
}

export async function runJavaScript(code: string, timeoutMs = 5000): Promise<SandboxResult> {
  try {
    return await runInWorker(code, timeoutMs);
  } catch (_) {
    // Worker mavjud bo'lmasa — cheklangan inline rejim.
    return await runInline(code, timeoutMs);
  }
}

function normalizeLanguage(language: unknown): string {
  const raw = String(language ?? "javascript").toLowerCase();
  if (raw === "js" || raw === "jsx") return "javascript";
  if (raw === "ts" || raw === "tsx") return "typescript";
  if (raw === "py") return "python";
  if (raw === "sh" || raw === "shell") return "bash";
  return raw;
}

function splitLogs(stdout: string, stderr: string): string[] {
  const lines = [
    ...stdout.split("\n").filter(Boolean),
    ...stderr.split("\n").filter(Boolean).map((line) => `[stderr] ${line}`),
  ];
  return lines.slice(0, MAX_LOGS).map((line) => line.slice(0, MAX_LOG_CHARS));
}

async function runRemoteSandbox(
  code: string,
  language: string,
  timeoutMs: number,
  stdin = "",
): Promise<SandboxResult | null> {
  const baseUrl = Deno.env.get("SANDBOX_API_URL")?.replace(/\/+$/, "");
  const key = Deno.env.get("SANDBOX_API_KEY");
  if (!baseUrl || !key) return null;

  const started = Date.now();
  const res = await fetch(`${baseUrl}/run`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ language, code, stdin, timeoutMs }),
  });
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(raw);
  } catch (_) {
    data = { stderr: raw };
  }

  const stdout = String(data.stdout ?? "");
  const stderr = String(data.stderr ?? data.error ?? "");
  const exitCode = typeof data.exitCode === "number" ? data.exitCode : null;
  const timedOut = Boolean(data.timedOut);

  return {
    ok: res.ok && !timedOut && (exitCode === 0 || exitCode === null),
    logs: splitLogs(stdout, stderr),
    result: null,
    error: res.ok ? (stderr || null) : String(data.error ?? `Sandbox HTTP ${res.status}`),
    durationMs: typeof data.durationMs === "number" ? data.durationMs : Date.now() - started,
    isolated: true,
    stdout,
    stderr,
    exitCode,
    signal: typeof data.signal === "string" ? data.signal : null,
    timedOut,
    language,
  };
}

export async function runSandboxCode(
  code: string,
  options: { language?: unknown; timeoutMs?: number; stdin?: string } = {},
): Promise<SandboxResult> {
  const language = normalizeLanguage(options.language);
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || 5000, 200), 30_000);
  const stdin = options.stdin ?? "";

  const remote = await runRemoteSandbox(code, language, timeoutMs, stdin);
  if (remote) return remote;

  if (language !== "javascript") {
    return {
      ok: false,
      logs: [],
      result: null,
      error: `${language} uchun SANDBOX_API_URL va SANDBOX_API_KEY kerak.`,
      durationMs: 0,
      isolated: false,
      language,
    };
  }
  return await runJavaScript(code, Math.min(timeoutMs, 10_000));
}
