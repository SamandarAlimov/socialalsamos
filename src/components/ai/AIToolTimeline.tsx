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
    <ul className="mt-2 space-y-1">
      {sources.slice(0, 6).map((source, index) => (
        <li key={`${source.url}-${index}`} className="flex items-start gap-1.5 text-xs">
          <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">[{index + 1}]</span>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-alsamos-orange hover:underline"
          >
            <span className="line-clamp-1">{source.title || source.url}</span>
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
    <div className="mt-2 space-y-1">
      {logs.length > 0 && (
        <pre className="max-h-40 overflow-auto rounded-md bg-muted/60 p-2 text-[11px] leading-relaxed">
          {logs.join('\n')}
        </pre>
      )}
      {execution.result !== undefined && execution.result !== null && (
        <pre className="max-h-32 overflow-auto rounded-md bg-muted/40 p-2 text-[11px]">
          {`→ ${JSON.stringify(execution.result, null, 2)}`}
        </pre>
      )}
      {execution.error && (
        <p className="text-[11px] text-destructive">{execution.error}</p>
      )}
    </div>
  );
}

function TimelineRow({ event }: { event: AIToolEvent }) {
  const [open, setOpen] = useState(false);
  const hasDetails = Boolean(event.summary || event.data);

  return (
    <li className="rounded-lg border border-border/50 bg-card/40">
      <button
        type="button"
        onClick={() => hasDetails && setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs',
          hasDetails && 'hover:bg-muted/40',
        )}
        aria-expanded={open}
      >
        {event.status === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-alsamos-orange" />
        ) : event.status === 'error' ? (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        )}
        <span className="font-medium">{event.label}</span>
        {typeof event.args?.query === 'string' && (
          <span className="line-clamp-1 text-muted-foreground">«{event.args.query}»</span>
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
        <div className="border-t border-border/50 px-2.5 py-2">
          {event.summary && (
            <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
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

/** Agent qadamlari (vosita chaqiriqlari) uchun jonli ko'rsatkich. */
export function AIToolTimeline({ events }: AIToolTimelineProps) {
  if (!events.length) return null;
  return (
    <ul className="mb-2 space-y-1.5">
      {events.map((event) => (
        <TimelineRow key={event.id} event={event} />
      ))}
    </ul>
  );
}

export default AIToolTimeline;
