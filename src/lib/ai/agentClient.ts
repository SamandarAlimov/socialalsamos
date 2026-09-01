// ai-agent yakuniy nuqtasi bilan ishlaydigan SSE klienti.
// Kontrakt: docs/AI_PLATFORM_SPEC.md
//
// MUHIM: `ai-agent` funksiyasi Supabase'ga hali deploy qilinmagan bo'lsa,
// brauzer "Failed to fetch" xatosini beradi. Shuning uchun bu klient avtomatik
// ravishda allaqachon deploy qilingan `ai-assistant` funksiyasiga qaytadi
// (fallback): chat doim ishlaydi, vositalar esa deploy'dan keyin qo'shiladi.
//
// `context` maydoni — "miya" kanali (src/lib/ai/brain.ts). Ikkala funksiya ham
// uni o'z system prompti ichiga qo'shadi, shuning uchun AI ning imkoniyatlari,
// xotirasi va skillari deploy talab qilmasdan kengaytiriladi.

import { supabase } from '@/integrations/supabase/client';
import type { AgentEvent, AIMode, ModelId, ToolGroupId } from './capabilities';

export type StreamAgentOptions = {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode: AIMode;
  model: ModelId;
  toolGroups: ToolGroupId[];
  conversationId?: string | null;
  /** Qo'shimcha system konteksti: master prompt, xotira, skillar. */
  context?: string;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
};

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const AGENT_SERVER_BASE = (
  (import.meta.env.VITE_ALSAMOS_AGENT_SERVER_URL as string | undefined) ||
  'https://ai.alsamos.com'
).replace(/\/+$/, '');

/** Agent funksiyasi mavjud emasligini bildiradi (deploy qilinmagan yoki o'chirilgan). */
class AgentUnavailableError extends Error {}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  };
}

/** SSE oqimini satrma-satr o'qib, `data: ` qatorlarini qaytaradi. */
async function readSse(
  body: ReadableStream<Uint8Array>,
  onLine: (payload: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (!line.startsWith('data: ')) continue;

      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;
      onLine(raw);
    }
  }
}

/** To'liq agent (vositalar bilan) — `ai-agent` funksiyasi. */
async function streamFromAgent(options: StreamAgentOptions): Promise<void> {
  const { messages, mode, model, toolGroups, conversationId, context, signal, onEvent } = options;

  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/ai-agent`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ messages, mode, model, toolGroups, conversationId, context }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    // Tarmoq xatosi / funksiya mavjud emas — fallback'ga o'tamiz.
    throw new AgentUnavailableError('ai-agent mavjud emas');
  }

  // 404/501/502/503/504 — funksiya deploy qilinmagan yoki vaqtincha ishlamayapti.
  if ([404, 501, 502, 503, 504].includes(res.status)) {
    throw new AgentUnavailableError(`ai-agent HTTP ${res.status}`);
  }

  if (!res.ok || !res.body) {
    let message = `AI xizmatiga ulanib bo'lmadi (HTTP ${res.status}).`;
    try {
      const json = await res.json();
      if (json?.message) message = json.message;
      else if (json?.error) message = json.error;
    } catch {
      // e'tiborsiz
    }
    throw new Error(message);
  }

  await readSse(res.body, (raw) => {
    try {
      onEvent(JSON.parse(raw) as AgentEvent);
    } catch {
      // yarim kelgan bo'lak — e'tiborsiz
    }
  });
}

/** Zaxira yo'l — allaqachon deploy qilingan `ai-assistant` (oddiy chat oqimi). */
async function streamFromAssistant(options: StreamAgentOptions): Promise<void> {
  const { messages, context, signal, onEvent } = options;

  const res = await fetch(`${FUNCTIONS_BASE}/ai-assistant`, {
    method: 'POST',
    headers: await authHeaders(),
    // `context` server system promptiga qo'shiladi — miya qatlami shu orqali ishlaydi.
    body: JSON.stringify({ messages, context }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `AI xizmatiga ulanib bo'lmadi (HTTP ${res.status}).`;
    try {
      const json = await res.json();
      if (json?.error) message = json.error;
      else if (json?.message) message = json.message;
    } catch {
      // e'tiborsiz
    }
    throw new Error(message);
  }

  onEvent({
    type: 'meta',
    model: res.headers.get('X-AI-Model') ?? 'auto',
    task: res.headers.get('X-AI-Task') ?? 'general',
    language: res.headers.get('X-AI-Language') ?? 'uz',
    tools: [],
  });

  await readSse(res.body, (raw) => {
    try {
      const json = JSON.parse(raw) as {
        choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? '';
      if (text) onEvent({ type: 'delta', text });
    } catch {
      // e'tiborsiz
    }
  });
}

/** Oracle server fallback: adapts https://ai.alsamos.com/api/alsamos/agent to UI events. */
async function streamFromOracleAgent(options: StreamAgentOptions): Promise<void> {
  const { messages, mode, model, toolGroups, conversationId, context, signal, onEvent } = options;

  const res = await fetch(`${AGENT_SERVER_BASE}/api/alsamos/agent`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ messages, mode, model, toolGroups, conversationId, context }),
    signal,
  });

  if ([401, 403, 404, 501, 502, 503, 504].includes(res.status)) {
    throw new AgentUnavailableError(`oracle agent HTTP ${res.status}`);
  }

  if (!res.ok || !res.body) {
    let message = `Alsamos agent serveriga ulanib bo'lmadi (HTTP ${res.status}).`;
    try {
      const json = await res.json();
      if (json?.message) message = json.message;
      else if (json?.error) message = json.error;
    } catch {
      // e'tiborsiz
    }
    throw new Error(message);
  }

  let streamedText = '';
  const oracleToolIds = new Map<string, string>();
  onEvent({ type: 'meta', model, task: mode, language: 'uz', tools: toolGroups });

  await readSse(res.body, (raw) => {
    let event: Record<string, any>;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    switch (event.type) {
      case 'meta':
        onEvent({
          type: 'meta',
          model: String(event.model ?? model),
          task: String(event.task ?? mode),
          language: String(event.language ?? 'uz'),
          tools: Array.isArray(event.tools) ? event.tools.map(String) : toolGroups,
        });
        break;
      case 'token': {
        const text = String(event.text ?? '');
        if (text) {
          streamedText += text;
          onEvent({ type: 'delta', text });
        }
        break;
      }
      case 'tool': {
        const name = String(event.name ?? 'tool');
        if (event.phase === 'call') {
          const id = crypto.randomUUID();
          oracleToolIds.set(name, id);
          onEvent({
            type: 'tool_call',
            id,
            name,
            args: (event.args ?? {}) as Record<string, unknown>,
          });
        } else if (event.phase === 'result') {
          const id = oracleToolIds.get(name) ?? crypto.randomUUID();
          oracleToolIds.delete(name);
          onEvent({
            type: 'tool_result',
            id,
            name,
            ok: Boolean(event.ok),
            summary: JSON.stringify(event.data ?? {}).slice(0, 600),
            data: (event.data ?? null) as Record<string, unknown> | null,
          });
        }
        break;
      }
      case 'stage':
      case 'iteration':
        if (event.label) onEvent({ type: 'notice', message: String(event.label) });
        break;
      case 'final': {
        const output = String(event.output ?? '');
        if (output && !streamedText) onEvent({ type: 'delta', text: output });
        break;
      }
      case 'error':
        throw new Error(String(event.message ?? 'Alsamos agent server xatosi.'));
      default:
        break;
    }
  });
}

/** Agentni ishga tushiradi va hodisalarni real vaqtda uzatadi. */
export async function streamAgent(options: StreamAgentOptions): Promise<void> {
  try {
    await streamFromAgent(options);
  } catch (err) {
    if (!(err instanceof AgentUnavailableError)) throw err;
    try {
      await streamFromOracleAgent(options);
    } catch (fallbackErr) {
      if (!(fallbackErr instanceof AgentUnavailableError)) throw fallbackErr;
      // Agent yo'q — oddiy chatga o'tamiz, foydalanuvchi hech narsa yo'qotmaydi.
      await streamFromAssistant(options);
    }
  }
}

export type SandboxRun = {
  ok: boolean;
  logs: string[];
  result: unknown;
  error: string | null;
  durationMs: number;
  isolated: boolean;
};

/** Artifact panelidagi "Ishga tushirish" tugmasi uchun. */
export async function runInSandbox(code: string, timeoutMs = 5000): Promise<SandboxRun> {
  const res = await fetch(`${FUNCTIONS_BASE}/code-sandbox`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ code, timeoutMs }),
  });
  if (!res.ok) {
    throw new Error(`Sandbox xatosi (HTTP ${res.status}). Funksiya deploy qilinganini tekshiring.`);
  }
  return (await res.json()) as SandboxRun;
}
