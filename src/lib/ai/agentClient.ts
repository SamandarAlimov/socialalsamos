// Alsamos AI agent klienti.
// Browser faqat Supabase Edge endpointlariga murojaat qiladi. Real sandbox yoki
// boshqa private AI infratuzilmasiga chiqish server-to-server bajariladi; shu
// bilan browser CORS xatolari va infratuzilma originining clientga sizishi yo'q.

import { supabase } from '@/integrations/supabase/client';
import type { AgentEvent, AIMode, ModelId, ToolGroupId } from './capabilities';
import { withAlsamosSearchGrounding } from './alsamosSearchGrounding';

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

class AgentUnavailableError extends Error {}

/**
 * Backward-compatible routing contract used by regression tests. Browser code
 * must never choose the private runner directly; code execution is a tool of
 * the Supabase Edge agent and its remote sandbox hop is server-to-server.
 */
export function shouldPreferServerAgent(
  _options: Pick<StreamAgentOptions, 'messages' | 'model' | 'toolGroups'>,
): boolean {
  return false;
}

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

    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (!line.startsWith('data: ')) continue;

      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;
      onLine(raw);
    }
  }
}

/** Supabase Edge'dagi to'liq agent: web/image/video/code/connectors/computer. */
async function streamFromAgent(options: StreamAgentOptions): Promise<void> {
  const { messages, mode, model, toolGroups, conversationId, context, signal, onEvent } = options;

  let response: Response;
  try {
    response = await fetch(`${FUNCTIONS_BASE}/ai-agent`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ messages, mode, model, toolGroups, conversationId, context }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AgentUnavailableError('ai-agent mavjud emas');
  }

  if ([404, 501, 502, 503, 504].includes(response.status)) {
    throw new AgentUnavailableError(`ai-agent HTTP ${response.status}`);
  }

  if (!response.ok || !response.body) {
    let message = `AI xizmatiga ulanib bo'lmadi (HTTP ${response.status}).`;
    try {
      const json = await response.json();
      if (json?.message) message = json.message;
      else if (json?.error) message = json.error;
    } catch {
      // JSON bo'lmasa umumiy HTTP xabarini saqlaymiz.
    }
    throw new Error(message);
  }

  let sawText = false;
  let sawSuccessfulMedia = false;
  let lastToolFailure: string | null = null;

  await readSse(response.body, (raw) => {
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

  const response = await fetch(`${FUNCTIONS_BASE}/ai-assistant`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ messages, context }),
    signal,
  });

  if (!response.ok || !response.body) {
    let message = `AI xizmatiga ulanib bo'lmadi (HTTP ${response.status}).`;
    try {
      const json = await response.json();
      if (json?.error) message = json.error;
      else if (json?.message) message = json.message;
    } catch {
      // JSON bo'lmasa umumiy HTTP xabarini saqlaymiz.
    }
    throw new Error(message);
  }

  onEvent({
    type: 'meta',
    model: response.headers.get('X-AI-Model') ?? 'auto',
    task: response.headers.get('X-AI-Task') ?? 'general',
    language: response.headers.get('X-AI-Language') ?? 'uz',
    tools: [],
  });

  await readSse(response.body, (raw) => {
    try {
      const json = JSON.parse(raw) as {
        choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? '';
      if (text) onEvent({ type: 'delta', text });
    } catch {
      // Noto'g'ri SSE bo'lagi keyingi paket bilan davom etadi.
    }
  });
}

/**
 * Barcha agent vazifalari Supabase Edge agentga boradi. Edge agentning run_code
 * vositasi private remote sandboxga server-to-server chiqadi va shu sabab
 * browser hech qachon api.alsamos.com bilan cross-origin gaplashmaydi.
 */
export async function streamAgent(options: StreamAgentOptions): Promise<void> {
  const prepared = await withAlsamosSearchGrounding(options);

  try {
    await streamFromAgent(prepared);
  } catch (error) {
    if (!(error instanceof AgentUnavailableError)) throw error;
    await streamFromAssistant(prepared);
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
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: string | null;
  timedOut?: boolean;
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
 * Artifact panelidagi "Ishga tushirish" ham aynan Supabase code-sandbox orqali
 * ishlaydi. code-sandbox remote runner sozlangan bo'lsa JS/TS/Python/Bashni
 * izolyatsiyada bajaradi; JS uchun restricted Edge fallback ham mavjud.
 */
export async function runInSandbox(
  code: string,
  timeoutMs = 5000,
  language: 'javascript' | 'typescript' | 'python' = 'javascript',
): Promise<SandboxRun> {
  const response = await fetch(`${FUNCTIONS_BASE}/code-sandbox`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ code, timeoutMs, language }),
  });

  if (!response.ok) {
    throw new Error(`Sandbox xatosi: ${await sandboxError(response)}`);
  }
  return (await response.json()) as SandboxRun;
}
