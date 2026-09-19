import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Copy,
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
import { toolLabel } from '@/lib/ai/capabilities';
import type { AIToolEvent } from './types';
import { cn } from '@/lib/utils';

interface AIToolTimelineProps {
  events: AIToolEvent[];
  plan?: string[];
  defaultOpen?: boolean;
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
  if (event.name === 'run_code') return { name: 'Command', Icon: TerminalSquare };
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
  const repo = argText(event, 'repository', 'repo', 'repo_full_name', 'repository_full_name', 'full_name');
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
    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
      {ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`}
    </span>
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

function CopyableBlock({
  title,
  text,
  badge,
}: {
  title: string;
  text: string;
  badge?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!text.trim()) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border/55 bg-muted/20">
      <div className="flex items-center gap-2 border-b border-border/45 px-2.5 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        {badge && <span className="font-mono text-[9px] text-muted-foreground/80">{badge}</span>}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
          className="ml-auto inline-flex h-6 items-center gap-1 rounded px-1.5 text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Nusxalandi' : 'Copy'}
        </button>
      </div>
      <pre className="m-0 max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-words p-2.5 font-mono text-[11px] leading-relaxed [overflow-wrap:anywhere]">
        {text}
      </pre>
    </div>
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

function CommandDetails({ event }: { event: AIToolEvent }) {
  if (event.name !== 'run_code') return null;

  const execution = event.data?.execution as
    | {
        logs?: string[];
        result?: unknown;
        error?: string | null;
        stdout?: string;
        stderr?: string;
        exitCode?: number | null;
        durationMs?: number;
        language?: string;
      }
    | undefined;

  const code = argText(event, 'code') || (typeof event.data?.code === 'string' ? event.data.code : '');
  const language = argText(event, 'language') || execution?.language || 'code';
  const stdout = execution?.stdout ?? '';
  const stderr = execution?.stderr ?? '';
  const logs = execution?.logs ?? [];
  const outputParts: string[] = [];

  if (stdout) outputParts.push(stdout.trimEnd());
  else if (logs.length) outputParts.push(logs.join('\n'));
  if (stderr) outputParts.push(`stderr:\n${stderr.trimEnd()}`);
  if (execution?.result !== undefined && execution?.result !== null) {
    try {
      outputParts.push(`return:\n${JSON.stringify(execution.result, null, 2)}`);
    } catch {
      outputParts.push(`return: ${String(execution.result)}`);
    }
  }
  if (execution?.error && !stderr.includes(execution.error)) outputParts.push(`error: ${execution.error}`);

  return (
    <>
      <CopyableBlock title="Input" badge={language} text={code} />
      <CopyableBlock title="Output" badge={typeof execution?.exitCode === 'number' ? `exit ${execution.exitCode}` : undefined} text={outputParts.join('\n\n')} />
      {execution && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
          {typeof execution.exitCode === 'number' && <span>Exit code: {execution.exitCode}</span>}
          {typeof execution.durationMs === 'number' && <span>Duration: {execution.durationMs} ms</span>}
        </div>
      )}
    </>
  );
}

function TimelineRow({ event }: { event: AIToolEvent }) {
  const [open, setOpen] = useState(false);
  const isCommand = event.name === 'run_code';
  const hasDetails = Boolean(isCommand || event.summary || event.data);
  const target = targetText(event);

  return (
    <li className="relative min-w-0 max-w-full pl-7">
      <span className="absolute left-[9px] top-6 bottom-[-10px] w-px bg-border/60 last:hidden" aria-hidden="true" />
      <span className="absolute left-0 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-background">
        {event.status === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : event.status === 'error' ? (
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </span>

      <button
        type="button"
        onClick={() => hasDetails && setOpen((value) => !value)}
        className={cn(
          'flex w-full min-w-0 items-start gap-2 rounded-lg px-1.5 py-2 text-left',
          hasDetails && 'hover:bg-muted/25',
        )}
        aria-expanded={open}
      >
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
        {hasDetails && (open
          ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />)}
      </button>

      {open && (
        <div className="mb-2 min-w-0 max-w-full overflow-hidden px-1.5 pb-2">
          {event.summary && !isCommand && (
            <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
              {event.summary}
            </p>
          )}
          <CommandDetails event={event} />
          <Sources data={event.data} />
        </div>
      )}
    </li>
  );
}

function normalizePlanStep(step: string): string {
  const clean = String(step || '').trim();
  if (!clean) return '';
  const friendly = toolLabel(clean);
  return friendly === clean ? clean : friendly;
}

export function AIToolTimeline({ events, plan = [], defaultOpen = false }: AIToolTimelineProps) {
  const running = events.some((event) => event.status === 'running');
  const failed = events.some((event) => event.status === 'error');
  const runningEvent = [...events].reverse().find((event) => event.status === 'running');
  const [open, setOpen] = useState(defaultOpen || running);

  useEffect(() => {
    if (running) setOpen(true);
  }, [running]);

  const planSteps = plan.map(normalizePlanStep).filter(Boolean);
  if (!events.length && !planSteps.length) return null;

  const headline = running
    ? runningEvent?.label || 'Ishlanmoqda'
    : failed
      ? 'Bajarilgan ishlar va xatolar'
      : 'Bajarilgan ishlar';

  return (
    <section className="mb-3 min-w-0 max-w-full overflow-hidden rounded-xl border border-border/50 bg-muted/10" aria-label="AI ish jarayoni">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/20"
        aria-expanded={open}
      >
        {running ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : failed ? (
          <AlertCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{headline}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] tabular-nums text-muted-foreground">
          {planSteps.length + events.length}
        </span>
        {open
          ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border/45 px-3 py-3">
          {planSteps.length > 0 && (
            <div className={cn('mb-2.5', events.length === 0 && 'mb-0')}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Yo‘nalish</p>
              <ol className="space-y-0.5">
                {planSteps.map((step, index) => (
                  <li key={`${step}-${index}`} className="relative flex min-w-0 gap-2.5 pb-2 pl-0 text-xs text-muted-foreground last:pb-0">
                    {index < planSteps.length - 1 && <span className="absolute left-[3px] top-3 bottom-[-2px] w-px bg-border/60" />}
                    <span className="relative mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/70" />
                    <span className="min-w-0 break-words leading-relaxed [overflow-wrap:anywhere]">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {events.length > 0 && (
            <div>
              {planSteps.length > 0 && <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Amallar</p>}
              <ul className="min-w-0 max-w-full overflow-hidden">
                {events.map((event) => <TimelineRow key={event.id} event={event} />)}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default AIToolTimeline;
