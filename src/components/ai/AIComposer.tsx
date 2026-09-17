import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Bot, Loader2, MessageCircle, RefreshCw, X } from 'lucide-react';
import { AIComposer as AIComposerV2 } from './AIComposerV2';
import type { ComposerAttachment } from './AIComposerV2';
import type { AIMode, AgentEvent } from '@/lib/ai/capabilities';
import { continueAgentRun } from '@/lib/ai/agentClient';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const MODE_KEY = 'alsamos.ai.mode';
const PENDING_KEY = 'alsamos.ai.pending-run';

type Props = ComponentProps<typeof AIComposerV2>;
type PendingRun = {
  runId: string;
  eventId: number;
  status: string;
  conversationId?: string | null;
};

function initialMode(): AIMode {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return value === 'chat' || value === 'agent' ? value : 'agent';
  } catch {
    return 'agent';
  }
}

function readPendingRun(): PendingRun | null {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    return value?.runId
      ? {
          runId: String(value.runId),
          eventId: Number(value.eventId) || 0,
          status: String(value.status || 'queued'),
          conversationId: value.conversationId ? String(value.conversationId) : null,
        }
      : null;
  } catch {
    return null;
  }
}

function runStatusText(status: string): string {
  if (status === 'awaiting_continue') return 'Agent checkpointda — davom ettirish mumkin';
  if (status === 'completed') return 'Fonda ishlagan agent vazifasi yakunlandi';
  if (status === 'failed') return 'Agent vazifasi xato bilan to‘xtadi';
  if (status === 'cancelled') return 'Agent vazifasi bekor qilindi';
  if (status === 'running') return 'Agent fonda ishlayapti';
  return 'Agent vazifasi navbatda';
}

export function AIComposer(props: Props) {
  const [internalMode, setInternalMode] = useState<AIMode>(initialMode);
  const mode = props.mode ?? internalMode;
  const changeMode = useCallback((nextMode: AIMode) => {
    setInternalMode(nextMode);
    props.onModeChange?.(nextMode);
  }, [props.onModeChange]);
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(readPendingRun);
  const [continuing, setContinuing] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // ignore storage failures
    }
  }, [mode]);

  const refreshPendingRun = useCallback(async () => {
    const local = readPendingRun();
    if (!local) {
      setPendingRun(null);
      setRunError(null);
      return null;
    }

    const { data, error } = await (supabase as any)
      .from('ai_agent_runs')
      .select('id,status,conversation_id,updated_at')
      .eq('id', local.runId)
      .maybeSingle();

    if (error || !data) {
      setPendingRun(local);
      return local;
    }

    const next: PendingRun = {
      ...local,
      status: String(data.status || local.status),
      conversationId: data.conversation_id ? String(data.conversation_id) : local.conversationId,
    };
    setPendingRun(next);
    return next;
  }, []);

  useEffect(() => {
    void refreshPendingRun();
    const timer = window.setInterval(() => void refreshPendingRun(), 2500);
    return () => window.clearInterval(timer);
  }, [refreshPendingRun]);

  const dismissPending = () => {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      // ignore storage failures
    }
    setPendingRun(null);
    setRunError(null);
  };

  const continuePending = async () => {
    if (!pendingRun || continuing) return;
    setContinuing(true);
    setRunError(null);
    try {
      await continueAgentRun(
        pendingRun.runId,
        (event: AgentEvent) => {
          if (event.type === 'run_state') {
            setPendingRun((current) =>
              current ? { ...current, status: event.status, eventId: event.eventId ?? current.eventId } : current,
            );
          }
        },
      );
      await refreshPendingRun();
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Agentni davom ettirib bo‘lmadi.');
    } finally {
      setContinuing(false);
    }
  };

  const terminal = pendingRun && ['completed', 'failed', 'cancelled'].includes(pendingRun.status);
  const showRunBanner = Boolean(pendingRun && !props.busy);

  return (
    <div className="w-full min-w-0">
      {showRunBanner && pendingRun && (
        <div className="mx-auto mb-1.5 w-full max-w-3xl px-2 sm:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-2 text-xs sm:px-3">
            {['queued', 'running'].includes(pendingRun.status) || continuing ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
            ) : (
              <Bot className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            )}
            <div className="min-w-[10rem] flex-1 basis-40">
              <p className="break-words font-medium">{runStatusText(pendingRun.status)}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                Run {pendingRun.runId.slice(0, 8)} · browser yopilsa ham server checkpointdan davom etadi
              </p>
              {runError && <p className="mt-0.5 break-words text-[10px] text-destructive">{runError}</p>}
            </div>
            <div className="ml-auto flex max-w-full shrink-0 items-center gap-1.5">
              {pendingRun.status === 'awaiting_continue' && (
                <button
                  type="button"
                  onClick={() => void continuePending()}
                  disabled={continuing}
                  className="flex h-7 shrink-0 items-center gap-1 rounded-lg border bg-background px-2 text-[10px] font-semibold hover:bg-muted disabled:opacity-50"
                >
                  {continuing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  <span className="hidden min-[380px]:inline">Davom ettirish</span>
                </button>
              )}
              {terminal && (
                <button
                  type="button"
                  onClick={() => {
                    dismissPending();
                    window.location.reload();
                  }}
                  className="h-7 shrink-0 rounded-lg border bg-background px-2 text-[10px] font-semibold hover:bg-muted"
                >
                  <span className="hidden min-[420px]:inline">Natijani </span>yangilash
                </button>
              )}
              <button
                type="button"
                onClick={dismissPending}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Agent run holatini yashirish"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto mb-1.5 flex w-full max-w-3xl justify-end px-2 sm:px-4">
        <div className="inline-flex rounded-full border border-border/60 bg-background/95 p-0.5 shadow-sm backdrop-blur">
          {([
            ['chat', 'Suhbat', MessageCircle],
            ['agent', 'Agent', Bot],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => changeMode(id)}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition-colors',
                mode === id
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              title={
                id === 'agent'
                  ? 'Ko‘p qadamli durable vazifa: plan, tools, checkpoint va background davom etish'
                  : 'Tez suhbat: minimal tool budget va qisqa orchestration'
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
      <AIComposerV2 {...props} mode={mode} onModeChange={changeMode} />
    </div>
  );
}

export type { ComposerAttachment };
