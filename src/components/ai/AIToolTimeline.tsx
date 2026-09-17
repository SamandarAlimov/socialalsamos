import { useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Database,
  ExternalLink,
  Github,
  Globe2,
  Image as ImageIcon,
  Loader2,
  Monitor,
  Plug,
  Search,
  TerminalSquare,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AIToolEvent } from './types';
import { cn } from '@/lib/utils';

interface AIToolTimelineProps {
  events: AIToolEvent[];
}

type ProviderMeta = {
  name: string;
  Icon: LucideIcon;
};

function argText(event: AIToolEvent, ...keys: string[]): string {
  for (const key of keys) {
    const value = event.args?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function connectorName(event: AIToolEvent): string {
  return argText(event, 'connector', 'provider', 'service');
}

function providerFor(event: AIToolEvent): ProviderMeta {
  const connector = connectorName(event);
  const haystack = `${event.name} ${connector}`.toLowerCase();

  if (haystack.includes('github')) return { name: 'GitHub', Icon: Github };
  if (haystack.includes('supabase')) return { name: 'Supabase', Icon: Database };
  if (haystack.includes('vercel')) return { name: 'Vercel', Icon: Cloud };
  if (event.name === 'web_search' || event.name === 'web_fetch') return { name: 'Web', Icon: Globe2 };
  if (event.name === 'run_code') return { name: 'Sandbox', Icon: TerminalSquare };
  if (event.name === 'generate_image') return { name: 'Image', Icon: ImageIcon };
  if (event.name === 'generate_video' || event.name === 'media_job_status') return { name: 'Video', Icon: Video };
  if (event.name.startsWith('computer_')) return { name: 'Computer', Icon: Monitor };
  if (event.name.startsWith('search_')) return { name: 'Alsamos', Icon: Search };
  if (event.name === 'connector_call' || event.name === 'list_connector_tools') {
    return { name: connector || 'Connector', Icon: Plug };
  }
  return { name: connector || 'AI tool', Icon: Plug };
}

function humanizeToolName(value: string): string {
  return value
    .replace(/^github_/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function activityTitle(event: AIToolEvent): string {
  if (event.name === 'connector_call') {
    const connector = connectorName(event);
    const tool = argText(event, 'tool');
    if (connector && tool) return `${connector}: ${humanizeToolName(tool)}`;
    if (connector) return `${connector} bilan ishlamoqda`;
  }
  return event.label;
}

function targetText(event: AIToolEvent): string {
  const repo = argText(
    event,
    'repository',
    'repo',
    'repo_full_name',
    'repository_full_name',
    'full_name',
  );
  const path = argText(event, 'path', 'file', 'file_path');
  const branch = argText(event, 'branch', 'ref', 'base', 'base_branch', 'target_branch');
  const query = argText(event, 'query');
  const url = argText(event, 'url');
  const tool = event.name === 'connector_call' ? argText(event, 'tool') : '';
  const repositoryName = argText(event, 'name');

  const parts: string[] = [];
  if (repo) parts.push(repo);
  else if (event.name === 'github_create_repository' && repositoryName) parts.push(repositoryName);
  if (path) parts.push(path);
  if (branch) parts.push(branch);
  if (tool) parts.push(humanizeToolName(tool));
  if (query) parts.push(`“${query}”`);
  if (url) {
    try {
      parts.push(new URL(url).hostname.replace(/^www\./, ''));
    } catch {
      parts.push(url);
    }
  }

  return parts.filter(Boolean).slice(0, 3).join(' · ');
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
      {execution.error && (
        <p className="break-words text-[11px] text-destructive [overflow-wrap:anywhere]">
          {execution.error}
        </p>
      )}
    </div>
  );
}

function ProviderBadge({ event }: { event: AIToolEvent }) {
  const provider = providerFor(event);
  const Icon = provider.Icon;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Icon className="h-3 w-3" />
      <span>{provider.name}</span>
    </span>
  );
}

function TimelineRow({ event }: { event: AIToolEvent }) {
  const [open, setOpen] = useState(false);
  const hasDetails = Boolean(event.summary || event.data);
  const target = targetText(event);

  return (
    <li className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border/55 bg-card/45 shadow-sm">
      <button
        type="button"
        onClick={() => hasDetails && setOpen((value) => !value)}
        className={cn(
          'flex w-full min-w-0 items-start gap-2.5 px-3 py-2.5 text-left',
          hasDetails && 'hover:bg-muted/30',
        )}
        aria-expanded={open}
      >
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
          {event.status === 'running' ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          ) : event.status === 'error' ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : (
            <Check className="h-4 w-4 text-emerald-500" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <ProviderBadge event={event} />
            <span className="min-w-0 break-words text-xs font-medium [overflow-wrap:anywhere]">
              {activityTitle(event)}
            </span>
          </span>
          {target && (
            <span className="mt-1 block min-w-0 truncate font-mono text-[10px] text-muted-foreground">
              {target}
            </span>
          )}
        </span>

        <Duration event={event} />
        {hasDetails &&
          (open ? (
            <ChevronDown className="mt-1 h-3.5 w-3.5 shrink-0 opacity-60" />
          ) : (
            <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 opacity-60" />
          ))}
      </button>

      {open && (
        <div className="min-w-0 max-w-full overflow-hidden border-t border-border/50 px-3 py-2.5">
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
  const running = events.some((event) => event.status === 'running');
  const failed = events.some((event) => event.status === 'error');

  return (
    <section className="mb-3 min-w-0 max-w-full overflow-hidden" aria-label="AI bajaradigan ishlar">
      <div className="mb-1.5 flex items-center gap-2 px-0.5">
        {running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : failed ? (
          <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Check className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-[11px] font-medium text-muted-foreground">
          {running ? 'Ishlanmoqda' : failed ? 'Bajarilgan ishlar va xatolar' : 'Bajarilgan ishlar'}
        </span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] tabular-nums text-muted-foreground">
          {events.length}
        </span>
      </div>

      <ul className="min-w-0 max-w-full space-y-1.5 overflow-hidden">
        {events.map((event) => (
          <TimelineRow key={event.id} event={event} />
        ))}
      </ul>
    </section>
  );
}

export default AIToolTimeline;
