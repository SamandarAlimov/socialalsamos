// ai-agent yakuniy nuqtasi bilan ishlaydigan SSE klienti.
// Kontrakt: docs/AI_PLATFORM_SPEC.md

import { supabase } from '@/integrations/supabase/client';
import type { AgentEvent, AIMode, ModelId, ToolGroupId } from './capabilities';

export type StreamAgentOptions = {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode: AIMode;
  model: ModelId;
  toolGroups: ToolGroupId[];
  conversationId?: string | null;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
};

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  };
}

/** Agentni ishga tushiradi va hodisalarni real vaqtda uzatadi. */
export async function streamAgent(options: StreamAgentOptions): Promise<void> {
  const { messages, mode, model, toolGroups, conversationId, signal, onEvent } = options;

  const res = await fetch(`${FUNCTIONS_BASE}/ai-agent`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ messages, mode, model, toolGroups, conversationId }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `AI xizmatiga ulanib bo'lmadi (HTTP ${res.status}).`;
    try {
      const json = await res.json();
      if (json?.message) message = json.message;
    } catch {
      // e'tiborsiz
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
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

      try {
        onEvent(JSON.parse(raw) as AgentEvent);
      } catch {
        // yarim kelgan bo'lak — e'tiborsiz
      }
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
    throw new Error(`Sandbox xatosi (HTTP ${res.status}).`);
  }
  return (await res.json()) as SandboxRun;
}
