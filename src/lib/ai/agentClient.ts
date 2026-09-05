// Alsamos AI agent klienti.
// Asosiy yo'l Oracle/K3s serveridagi AI gateway + real Kubernetes sandbox.
// Supabase Edge agent/assistant faqat zaxira compatibility yo'li bo'lib qoladi.

import { supabase } from '@/integrations/supabase/client';
import type { AgentEvent, AIMode, ModelId, ToolGroupId } from './capabilities';

export type StreamAgentOptions = {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode: AIMode;
  model: ModelId;
  toolGroups: ToolGroupId[];
  conversationId?: string | null;
  context?: string;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
};

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const AGENT_SERVER_BASE = (
  (import.meta.env.VITE_ALSAMOS_AGENT_SERVER_URL as string | undefined) ||
  'https://api.alsamos.com/ai'
).replace(/\/+$/, '');

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

/** Supabase Edge'dagi eski to'liq agent — server ishlamasa zaxira. */
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
    throw new AgentUnavailableError('ai-agent mavjud emas');
  }

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

  let sawText = false;
  let sawSuccessfulMedia = false;
  let lastToolFailure: string | null = null;

  await readSse(res.body, (raw) => {
    try {
      const event = JSON.parse(raw) as AgentEvent;

      if (event.type === 'delta' && event.text.trim()) sawText = true;

      if (event.type === 'tool_result') {
        if (!event.ok) {
          const summary = event.summary?.trim();
          lastToolFailure = summary
            ? `${event.name === 'generate_video' ? 'Video yaratilmadi' : 'Vosita bajarilmadi'}: ${summary}`
            : `${event.name} bajarilmadi.`;
        } else {
          const data = event.data as Record<string, unknown> | null;
          if (typeof data?.imageUrl === 'string' || typeof data?.videoUrl === 'string') {
            sawSuccessfulMedia = true;
          }
        }
      }

      onEvent(event);
    } catch (error) {
      if (error instanceof SyntaxError) return;
      throw error;
    }
  });

  if (!sawText && !sawSuccessfulMedia && lastToolFailure) {
    onEvent({ type: 'error', message: lastToolFailure });
  }
}

/** Eng oxirgi zaxira — oddiy Supabase ai-assistant chat oqimi. */
async function streamFromAssistant(options: StreamAgentOptions): Promise<void> {
  const { messages, context, signal, onEvent } = options;

  const res = await fetch(`${FUNCTIONS_BASE}/ai-assistant`, {
    method: 'POST',
    headers: await authHeaders(),
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

/** Oracle/K3s server agenti: real server vositalari va Kubernetes sandbox. */
async function streamFromOracleAgent(options: StreamAgentOptions): Promise<void> {
  const { messages, mode, model, toolGroups, conversationId, context, signal, onEvent } = options;

  let res: Response;
  try {
    res = await fetch(`${AGENT_SERVER_BASE}/api/alsamos/agent`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ messages, mode, model, toolGroups, conversationId, context }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AgentUnavailableError('Alsamos server agentiga ulanib bo\'lmadi');
  }

  if ([404, 501, 502, 503, 504].includes(res.status)) {
    throw new AgentUnavailableError(`oracle agent HTTP ${res.status}`);
  }

  if (!res.ok || !res.body) {
    let message = `Alsamos agent serveriga ulanib bo'lmadi (HTTP ${res.status}).`;
    try {
      const json = await res.json();
      if (json?.message) message = json.message;
      else if (json?.detail) message = json.detail;
      else if (json?.error) message = json.error;
    } catch {
      // e'tiborsiz
    }
    throw new Error(message);
  }

  let streamedText = '';
  let lastToolFailure: string | null = null;
  let sawSuccessfulMedia = false;
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
          const id = String(event.id ?? crypto.randomUUID());
          oracleToolIds.set(name, id);
          onEvent({
            type: 'tool_call',
            id,
            name,
            args: (event.args ?? {}) as Record<string, unknown>,
          });
        } else if (event.phase === 'result') {
          const id = String(event.id ?? oracleToolIds.get(name) ?? crypto.randomUUID());
          oracleToolIds.delete(name);
          const data = (event.data ?? null) as Record<string, unknown> | null;
          const ok = Boolean(event.ok);
          const summary =
            typeof event.summary === 'string'
              ? event.summary
              : typeof data?.error === 'string'
                ? String(data.error)
                : JSON.stringify(event.data ?? {}).slice(0, 600);

          if (!ok) {
            lastToolFailure = `${name === 'generate_video' ? 'Video yaratilmadi' : 'Vosita bajarilmadi'}: ${summary}`;
          }
          if (ok && (typeof data?.videoUrl === 'string' || typeof data?.imageUrl === 'string')) {
            sawSuccessfulMedia = true;
          }

          onEvent({
            type: 'tool_result',
            id,
            name,
            ok,
            summary,
            data,
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
        if (output && !streamedText) {
          streamedText += output;
          onEvent({ type: 'delta', text: output });
        }
        break;
      }
      case 'error':
        throw new Error(String(event.message ?? 'Alsamos agent server xatosi.'));
      default:
        break;
    }
  });

  if (!streamedText && !sawSuccessfulMedia && lastToolFailure) {
    onEvent({ type: 'error', message: lastToolFailure });
  }
}

/** Server birinchi; Edge funksiyalar faqat server vaqtincha yo'q bo'lsa. */
export async function streamAgent(options: StreamAgentOptions): Promise<void> {
  try {
    await streamFromOracleAgent(options);
    return;
  } catch (serverError) {
    if (!(serverError instanceof AgentUnavailableError)) throw serverError;
  }

  try {
    await streamFromAgent(options);
  } catch (edgeError) {
    if (!(edgeError instanceof AgentUnavailableError)) throw edgeError;
    await streamFromAssistant(options);
  }
}

export type SandboxRun = {
  ok: boolean;
  logs: string[];
  result: unknown;
  error: string | null;
  durationMs: number;
  isolated: boolean;
  runtime?: string;
  language?: string;
};

async function sandboxError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body?.detail || body?.message || body?.error || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/**
 * Artifact panelidagi "Ishga tushirish" tugmasi.
 * Birinchi yo'l — serverdagi network-isolated, non-root Kubernetes Job.
 * Eski Edge sandbox faqat JavaScript uchun vaqtinchalik fallback.
 */
export async function runInSandbox(
  code: string,
  timeoutMs = 5000,
  language: 'javascript' | 'typescript' | 'python' = 'javascript',
): Promise<SandboxRun> {
  try {
    const response = await fetch(`${AGENT_SERVER_BASE}/v1/sandbox/run`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ code, timeoutMs, language }),
    });

    if (response.ok) return (await response.json()) as SandboxRun;
    if (![404, 501, 502, 503, 504].includes(response.status)) {
      throw new Error(`Server sandbox xatosi: ${await sandboxError(response)}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Server sandbox xatosi:')) {
      throw error;
    }
    // Server deployment o'tish davrida bo'lsa JS uchun eski Edge fallback qoladi.
  }

  if (language !== 'javascript') {
    throw new Error('Server sandbox vaqtincha mavjud emas; TypeScript/Python Edge fallbackda bajarilmaydi.');
  }

  const res = await fetch(`${FUNCTIONS_BASE}/code-sandbox`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ code, timeoutMs }),
  });
  if (!res.ok) {
    throw new Error(`Sandbox xatosi (HTTP ${res.status}). Server va Edge sandboxni tekshiring.`);
  }
  return (await res.json()) as SandboxRun;
}
