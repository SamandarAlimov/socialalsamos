// Alsamos AI agent client.
// Chat mode streams one short request. Agent mode uses durable server runs and
// transparently reconnects to the same run until it reaches a terminal state.

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
const PENDING_KEY = 'alsamos.ai.pending-run';
const CLIENT_CAPABILITIES = ['clarification_v1'];

class AgentUnavailableError extends Error {}

export function shouldPreferServerAgent(
  _options: Pick<StreamAgentOptions, 'messages' | 'model' | 'toolGroups'>,
): boolean {
  return false;
}

function savePending(value: { runId: string; eventId: number; status: string; conversationId?: string | null } | null) {
  try {
    if (!value) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, JSON.stringify(value));
  } catch {
    // storage may be unavailable in private mode
  }
}

export function readPendingAgentRun(): {
  runId: string;
  eventId: number;
  status: string;
  conversationId?: string | null;
} | null {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    return raw?.runId ? raw : null;
  } catch {
    return null;
  }
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

async function createProvisionalConversation(
  messages: StreamAgentOptions['messages'],
): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId || messages.length === 0) return null;
  const now = new Date().toISOString();
  const durableMessages = messages.map((message) => ({
    id: crypto.randomUUID(),
    role: message.role,
    content: message.content,
    timestamp: now,
  }));
  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({ user_id: userId, messages: durableMessages as any, context: 'agent-durable' })
    .select('id')
    .single();
  if (error || !data?.id) return null;
  return String(data.id);
}

async function removeProvisionalConversation(id: string | null): Promise<void> {
  if (!id) return;
  await supabase.from('ai_conversations').delete().eq('id', id);
}

async function readSse(
  body: ReadableStream<Uint8Array>,
  onLine: (payload: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const consumeLine = (input: string) => {
    let line = input;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (!line.startsWith('data: ')) return;
    const raw = line.slice(6).trim();
    if (!raw || raw === '[DONE]') return;
    onLine(raw);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      consumeLine(line);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) consumeLine(buffer);
}

async function requestAgent(
  payload: Record<string, unknown>,
  signal: AbortSignal | undefined,
  onEvent: (event: AgentEvent) => void,
  options: { deferErrors?: boolean } = {},
): Promise<{ runId: string | null; eventId: number; status: string | null; sawText: boolean; sawMedia: boolean; sawClarification: boolean; failure: string | null }> {
  let response: Response;
  try {
    response = await fetch(`${FUNCTIONS_BASE}/ai-agent`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(payload),
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
      // keep HTTP message
    }
    throw new Error(message);
  }

  let runId: string | null = response.headers.get('X-AI-Run');
  let eventId = 0;
  let status: string | null = null;
  let sawText = false;
  let sawMedia = false;
  let sawClarification = false;
  let failure: string | null = null;

  await readSse(response.body, (raw) => {
    try {
      const event = JSON.parse(raw) as AgentEvent;
      const anyEvent = event as AgentEvent & { eventId?: number; runId?: string };
      if (typeof anyEvent.eventId === 'number') eventId = Math.max(eventId, anyEvent.eventId);
      if (anyEvent.runId) runId = anyEvent.runId;
      if (event.type === 'delta' && event.text.trim()) sawText = true;
      if (event.type === 'clarification') sawClarification = true;
      if (event.type === 'run_state') {
        status = event.status;
        runId = event.runId;
        savePending(
          ['completed', 'failed', 'cancelled'].includes(event.status)
            ? null
            : { runId: event.runId, eventId, status: event.status, conversationId: payload.conversationId as string | null | undefined },
        );
      }
      if (event.type === 'error') {
        failure = event.message;
        if (options.deferErrors) return;
      }
      if (event.type === 'tool_result') {
        if (!event.ok) {
          failure = event.summary?.trim()
            ? `${event.name === 'generate_video' ? 'Video yaratilmadi' : 'Vosita bajarilmadi'}: ${event.summary.trim()}`
            : `${event.name} bajarilmadi.`;
        } else {
          const data = event.data as Record<string, unknown> | null;
          if (typeof data?.imageUrl === 'string' || typeof data?.videoUrl === 'string') sawMedia = true;
        }
      }
      onEvent(event);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  });

  return { runId, eventId, status, sawText, sawMedia, sawClarification, failure };
}

async function streamDurableAgent(options: StreamAgentOptions): Promise<void> {
  // For a brand-new chat we create a small provisional conversation before the
  // long run starts. If the browser disappears, the background worker can still
  // attach its final answer to this row. On a normal foreground completion the
  // provisional row is deleted and AIPage writes its richer message payload as
  // usual, so existing UI behavior is unchanged.
  const provisionalId = options.conversationId ? null : await createProvisionalConversation(options.messages);
  const effectiveConversationId = options.conversationId ?? provisionalId;
  const prepared = await withAlsamosSearchGrounding({ ...options, conversationId: effectiveConversationId });
  let completedForeground = false;

  try {
    let state = await requestAgent(
      {
        messages: prepared.messages,
        mode: 'agent',
        model: prepared.model,
        toolGroups: prepared.toolGroups,
        conversationId: effectiveConversationId,
        context: prepared.context,
        clientCapabilities: CLIENT_CAPABILITIES,
      },
      prepared.signal,
      prepared.onEvent,
    );

    let sawText = state.sawText;
    let sawMedia = state.sawMedia;
    let sawClarification = state.sawClarification;
    let failure = state.failure;
    let reconnects = 0;

    while (
      state.runId &&
      !prepared.signal?.aborted &&
      state.status &&
      !['completed', 'failed', 'cancelled', 'awaiting_continue'].includes(state.status)
    ) {
      reconnects += 1;
      if (reconnects > 40) throw new Error('Agent stream reconnect limitiga yetdi. Run serverda saqlangan.');
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      state = await requestAgent(
        { action: 'resume', runId: state.runId, afterEventId: state.eventId, mode: 'agent', conversationId: effectiveConversationId },
        prepared.signal,
        prepared.onEvent,
      );
      sawText ||= state.sawText;
      sawMedia ||= state.sawMedia;
      sawClarification ||= state.sawClarification;
      failure = state.failure ?? failure;
    }

    if (!sawText && !sawMedia && failure && state.status !== 'awaiting_continue') {
      prepared.onEvent({ type: 'error', message: failure });
    }
    if (state.status === 'awaiting_continue' && state.runId && !sawClarification) {
      prepared.onEvent({
        type: 'notice',
        message: `Agent checkpoint qilindi. Run ${state.runId.slice(0, 8)} uchun davom ettirish mumkin.`,
        runId: state.runId,
      });
    }
    completedForeground = state.status === 'completed' && !prepared.signal?.aborted;
  } finally {
    if (completedForeground) await removeProvisionalConversation(provisionalId);
  }
}

async function streamDirectChat(options: StreamAgentOptions): Promise<void> {
  const prepared = await withAlsamosSearchGrounding(options);
  const state = await requestAgent(
    {
      messages: prepared.messages,
      mode: 'chat',
      model: prepared.model,
      toolGroups: prepared.toolGroups,
      conversationId: prepared.conversationId,
      context: prepared.context,
      clientCapabilities: CLIENT_CAPABILITIES,
    },
    prepared.signal,
    prepared.onEvent,
    { deferErrors: true },
  );

  if (state.sawText || state.sawMedia || state.sawClarification) return;

  try {
    await streamFromAssistant(prepared);
  } catch (fallbackError) {
    prepared.onEvent({
      type: 'error',
      message:
        state.failure ||
        (fallbackError instanceof Error ? fallbackError.message : '') ||
        'AI javobi olinmadi. Qayta urinib ko‘ring.',
    });
  }
}

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
      // keep default
    }
    throw new Error(message);
  }
  onEvent({
    type: 'meta',
    model: response.headers.get('X-AI-Model') ?? 'auto',
    task: response.headers.get('X-AI-Task') ?? 'general',
    language: response.headers.get('X-AI-Language') ?? 'uz',
    tools: [],
    mode: 'chat',
  });
  let sawText = false;
  await readSse(response.body, (raw) => {
    try {
      const json = JSON.parse(raw) as {
        choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? '';
      if (text) {
        sawText = true;
        onEvent({ type: 'delta', text });
      }
    } catch {
      // malformed chunk; next packet may complete it
    }
  });
  if (!sawText) {
    onEvent({ type: 'error', message: 'AI assistant stream tugadi, lekin matn qaytmadi.' });
  }
}

export async function streamAgent(options: StreamAgentOptions): Promise<void> {
  const mode = options.mode;
  const effective = { ...options, mode };
  try {
    if (mode === 'agent') await streamDurableAgent(effective);
    else await streamDirectChat(effective);
  } catch (error) {
    if (!(error instanceof AgentUnavailableError)) throw error;
    await streamFromAssistant(effective);
  }
}

export async function generateConversationTitle(
  prompt: string,
  conversationId?: string | null,
): Promise<string | null> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) return null;

  try {
    const response = await fetch(`${FUNCTIONS_BASE}/ai-agent`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        action: 'title',
        prompt: cleanPrompt,
        conversationId: conversationId || null,
      }),
    });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null) as { title?: string } | null;
    const title = body?.title?.trim() || '';
    return title || null;
  } catch (error) {
    console.warn('AI conversation title generation failed', error);
    return null;
  }
}
export async function answerAgentClarification(
  runId: string,
  clarificationId: string,
  answers: Record<string, string | string[]>,
  onEvent: (event: AgentEvent) => void,
  afterEventId = 0,
  signal?: AbortSignal,
): Promise<void> {
  let state = await requestAgent(
    {
      action: 'answer_clarification',
      runId,
      clarificationId,
      answers,
      afterEventId,
      mode: 'agent',
    },
    signal,
    onEvent,
  );

  while (
    state.runId &&
    !signal?.aborted &&
    state.status &&
    !['completed', 'failed', 'cancelled', 'awaiting_continue'].includes(state.status)
  ) {
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    state = await requestAgent(
      { action: 'resume', runId: state.runId, afterEventId: state.eventId, mode: 'agent' },
      signal,
      onEvent,
    );
  }
}

export async function continueAgentRun(
  runId: string,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let state = await requestAgent({ action: 'continue', runId, mode: 'agent' }, signal, onEvent);
  while (
    state.runId &&
    !signal?.aborted &&
    state.status &&
    !['completed', 'failed', 'cancelled', 'awaiting_continue'].includes(state.status)
  ) {
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    state = await requestAgent({ action: 'resume', runId: state.runId, afterEventId: state.eventId, mode: 'agent' }, signal, onEvent);
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
  if (!response.ok) throw new Error(`Sandbox xatosi: ${await sandboxError(response)}`);
  return (await response.json()) as SandboxRun;
}
