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
    // @ts-ignore: Supabase Edge Runtime kengaytmasi
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
