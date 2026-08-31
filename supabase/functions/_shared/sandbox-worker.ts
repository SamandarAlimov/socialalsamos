// Ruxsatlari yo'q Worker ichida ishlaydigan kod bajaruvchisi.
// Bu fayl HECH QANDAY tashqi importga ega bo'lmasligi kerak.

const MAX_LOGS = 200;
const MAX_LOG_CHARS = 4000;

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch (_) {
    return String(value);
  }
}

self.onmessage = async (event: MessageEvent) => {
  const { code, timeoutMs } = (event.data ?? {}) as { code: string; timeoutMs: number };
  const logs: string[] = [];
  const push = (level: string, args: unknown[]) => {
    if (logs.length >= MAX_LOGS) return;
    logs.push(`[${level}] ${args.map(stringify).join(" ")}`.slice(0, MAX_LOG_CHARS));
  };

  const sandboxConsole = {
    log: (...a: unknown[]) => push("log", a),
    info: (...a: unknown[]) => push("info", a),
    warn: (...a: unknown[]) => push("warn", a),
    error: (...a: unknown[]) => push("error", a),
    debug: (...a: unknown[]) => push("debug", a),
  };

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction("console", `"use strict";\n${code}`);
    const raw = await Promise.race([
      fn(sandboxConsole),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Vaqt tugadi (${timeoutMs ?? 5000} ms).`)), timeoutMs ?? 5000)
      ),
    ]);
    let result: unknown = null;
    try {
      result = raw === undefined ? null : JSON.parse(JSON.stringify(raw ?? null));
    } catch (_) {
      result = stringify(raw);
    }
    self.postMessage({ ok: true, logs, result, error: null });
  } catch (error) {
    self.postMessage({
      ok: false,
      logs,
      result: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
