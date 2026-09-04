import { useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import type { AIToolEvent } from './types';
import { cn } from '@/lib/utils';

interface AIToolTimelineProps {
  events: AIToolEvent[];
}

function Duration({ event }: { event: AIToolEvent }) {
  if (!event.finishedAt) return null;
  const ms = event.finishedAt - event.startedAt;
  return (
    <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
      {ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`}
    </span>
  );
}

function Sources({ data }: { data: Record<string, unknown> | null | undefined }) {
  const sources = (data?.sources ?? []) as Array<{ title: string; url: string }>;
  if (!sources.length) return null;
  return (
    <ul className="mt-2 min-w-0 space-y-1">
      {sources.slice(0, 6).map((source, index) => (
        <li key={`${source.url}-${index}`} className="flex min-w-0 items-start gap-1.5 text-xs">
          <span className="mt-0.5 shrink-0 font-mono text-[10px] text-muted-foreground">[{index + 1}]</span>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-w-0 items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
          >
            <span className="truncate">{source.title || source.url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function Execution({ data }: { data: Record<string, unknown> | null | undefined }) {
  const execution = data?.execution as
    | { logs?: string[]; result?: unknown; error?: string | null }
    | undefined;
  if (!execution) return null;
  const logs = execution.logs ?? [];
  return (
    <div className="mt-2 min-w-0 space-y-1 overflow-hidden">
      {logs.length > 0 && (
        <pre className="max-h-40 max-w-full overflow-auto rounded-md bg-muted/60 p-2 text-[11px] leading-relaxed">
          {logs.join('\n')}
        </pre>
      )}
      {execution.result !== undefined && execution.result !== null && (
        <pre className="max-h-32 max-w-full overflow-auto rounded-md bg-muted/40 p-2 text-[11px]">
          {`→ ${JSON.stringify(execution.result, null, 2)}`}
        </pre>
      )}
      {execution.error && <p className="break-words text-[11px] text-destructive [overflow-wrap:anywhere]">{execution.error}</p>}
    </div>
  );
}

function TimelineRow({ event }: { event: AIToolEvent }) {
  const [open, setOpen] = useState(false);
  const hasDetails = Boolean(event.summary || event.data);

  return (
    <li className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border/50 bg-muted/15">
      <button
        type="button"
        onClick={() => hasDetails && setOpen((value) => !value)}
        className={cn(
          'flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left text-xs',
          hasDetails && 'hover:bg-muted/40',
        )}
        aria-expanded={open}
      >
        {event.status === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
        ) : event.status === 'error' ? (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        )}
        <span className="min-w-0 truncate font-medium">{event.label}</span>
        {typeof event.args?.query === 'string' && (
          <span className="hidden min-w-0 max-w-[45%] truncate text-muted-foreground sm:inline">«{event.args.query}»</span>
        )}
        <Duration event={event} />
        {hasDetails &&
          (open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
          ))}
      </button>

      {open && (
        <div className="min-w-0 max-w-full overflow-hidden border-t border-border/50 px-2.5 py-2">
          {event.summary && (
            <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
              {event.summary}
            </p>
          )}
          <Sources data={event.data} />
          <Execution data={event.data} />
        </div>
      )}
    </li>
  );
}

export function AIToolTimeline({ events }: AIToolTimelineProps) {
  if (!events.length) return null;
  return (
    <ul className="mb-2 min-w-0 max-w-full space-y-1.5 overflow-hidden">
      {events.map((event) => (
        <TimelineRow key={event.id} event={event} />
      ))}
    </ul>
  );
}

export default AIToolTimeline;
