import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock3,
  Code2,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileText,
  ImageIcon,
  Loader2,
  Play,
  Video,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { extensionFor, type AIArtifact } from '@/lib/aiArtifacts';
import { runInSandbox, type SandboxRun } from '@/lib/ai/agentClient';
import { useToast } from '@/hooks/use-toast';

interface AIArtifactPanelProps {
  artifacts: AIArtifact[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  isMobile?: boolean;
}

const iconFor = (kind: AIArtifact['kind']) =>
  kind === 'code' ? FileCode2 : kind === 'image' ? ImageIcon : kind === 'video' ? Video : FileText;

const labelFor = (artifact: AIArtifact) => {
  if (artifact.kind === 'code') return artifact.language ? artifact.language.toUpperCase() : 'KOD';
  if (artifact.kind === 'document') return artifact.language ? artifact.language.toUpperCase() : 'HUJJAT';
  if (artifact.kind === 'image') return 'RASM';
  return 'VIDEO';
};

const RUNNABLE = ['javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx'];
const PREVIEWABLE = ['html', 'svg'];

function shortDate(value: Date) {
  try {
    return new Intl.DateTimeFormat('uz-UZ', { month: 'short', day: 'numeric' }).format(value);
  } catch {
    return value.toLocaleDateString();
  }
}

export function AIArtifactPanel({ artifacts, activeId, onSelect, onClose, isMobile }: AIArtifactPanelProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<SandboxRun | null>(null);
  const [preview, setPreview] = useState(false);
  const [kindFilter, setKindFilter] = useState<'all' | AIArtifact['kind']>('all');

  const sortedArtifacts = useMemo(
    () => [...artifacts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [artifacts],
  );

  const visibleArtifacts = useMemo(
    () => sortedArtifacts.filter((artifact) => kindFilter === 'all' || artifact.kind === kindFilter),
    [kindFilter, sortedArtifacts],
  );

  const active = useMemo(
    () => artifacts.find((artifact) => artifact.id === activeId) || sortedArtifacts[0] || null,
    [activeId, artifacts, sortedArtifacts],
  );

  useEffect(() => {
    setCopied(false);
    setRun(null);
    setPreview(false);
  }, [active?.id]);

  const language = (active?.language ?? '').toLowerCase();
  const canRun = active?.kind === 'code' && RUNNABLE.includes(language);
  const canPreview = active?.kind === 'code' && PREVIEWABLE.includes(language);

  const copy = async () => {
    if (!active) return;
    await navigator.clipboard.writeText(active.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const execute = async () => {
    if (!active) return;
    setRunning(true);
    try {
      setRun(await runInSandbox(active.content));
    } catch (error) {
      toast({
        title: 'Ishga tushirilmadi',
        description: error instanceof Error ? error.message : 'Kutilmagan xatolik',
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  const download = () => {
    if (!active) return;
    if (active.kind === 'image' || active.kind === 'video') {
      const anchor = document.createElement('a');
      anchor.href = active.content;
      anchor.download = `alsamos-ai.${extensionFor(active)}`;
      anchor.target = '_blank';
      anchor.click();
      return;
    }
    const blob = new Blob([active.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `alsamos-artifact.${extensionFor(active)}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const filterCounts = useMemo(() => {
    const counts = { code: 0, document: 0, image: 0, video: 0 };
    artifacts.forEach((artifact) => {
      counts[artifact.kind] += 1;
    });
    return counts;
  }, [artifacts]);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col border-l border-border/50 bg-background',
        isMobile ? 'w-full' : 'w-[500px] xl:w-[560px]',
      )}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/40 px-3 sm:h-14">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-muted/35">
          <FileCode2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Artefaktlar</p>
          <p className="text-[10px] text-muted-foreground">Qayta ishlatiladigan natijalar</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{artifacts.length}</span>
        <div className="flex-1" />
        {canRun && (
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 rounded-lg text-xs" onClick={execute} disabled={running}>
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            <span className="hidden xl:inline">Ishga tushirish</span>
          </Button>
        )}
        {canPreview && (
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 rounded-lg text-xs" onClick={() => setPreview((value) => !value)}>
            <Eye className="h-3.5 w-3.5" /> <span className="hidden xl:inline">{preview ? 'Kod' : 'Ko‘rish'}</span>
          </Button>
        )}
        {active && (
          <>
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={copy} aria-label="Nusxalash">
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={download} aria-label="Yuklab olish">
              <Download className="h-4 w-4" />
            </Button>
          </>
        )}
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={onClose} aria-label="Yopish">
          <X className="h-4 w-4" />
        </Button>
      </header>

      {artifacts.length > 0 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/40 px-3 py-2">
          {([
            ['all', 'Hammasi', artifacts.length],
            ['code', 'Kod', filterCounts.code],
            ['document', 'Hujjat', filterCounts.document],
            ['image', 'Rasm', filterCounts.image],
            ['video', 'Video', filterCounts.video],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setKindFilter(id)}
              disabled={id !== 'all' && count === 0}
              className={cn(
                'shrink-0 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors',
                kindFilter === id
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                id !== 'all' && count === 0 && 'cursor-default opacity-35',
              )}
            >
              {label} {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          ))}
        </div>
      )}

      <div className={cn('grid min-h-0 flex-1', !isMobile && artifacts.length > 0 ? 'grid-cols-[170px_minmax(0,1fr)]' : 'grid-cols-1')}>
        {!isMobile && artifacts.length > 0 && (
          <ScrollArea className="min-h-0 border-r border-border/40 bg-muted/10">
            <div className="space-y-1.5 p-2.5">
              {visibleArtifacts.map((artifact) => {
                const Icon = iconFor(artifact.kind);
                return (
                  <button
                    key={artifact.id}
                    type="button"
                    onClick={() => onSelect(artifact.id)}
                    className={cn(
                      'w-full rounded-xl border p-2.5 text-left transition-colors',
                      artifact.id === active?.id
                        ? 'border-border bg-background shadow-sm'
                        : 'border-transparent hover:border-border/50 hover:bg-background/70',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/65">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[11px] font-semibold leading-snug">{artifact.title}</p>
                        <div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
                          <span>{labelFor(artifact)}</span>
                          <span>·</span>
                          <span>{shortDate(artifact.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <div className="flex min-h-0 min-w-0 flex-col">
          {isMobile && visibleArtifacts.length > 1 && (
            <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border/40 px-3 py-2">
              {visibleArtifacts.map((artifact) => {
                const Icon = iconFor(artifact.kind);
                return (
                  <button
                    key={artifact.id}
                    type="button"
                    onClick={() => onSelect(artifact.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px]',
                      artifact.id === active?.id
                        ? 'border-foreground/20 bg-foreground text-background'
                        : 'border-border/60 text-muted-foreground',
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    <span className="max-w-36 truncate">{artifact.title}</span>
                  </button>
                );
              })}
            </div>
          )}

          {active && (
            <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{active.title}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                  {active.kind === 'code' && <Code2 className="h-2.5 w-2.5" />}
                  {labelFor(active)}
                  <span>·</span>
                  <Clock3 className="h-2.5 w-2.5" />
                  {shortDate(active.createdAt)}
                </p>
              </div>
            </div>
          )}

          <ScrollArea className="min-h-0 flex-1">
            {!active ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center px-8 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-muted/30">
                  <FileCode2 className="h-5 w-5 text-muted-foreground" />
                </span>
                <p className="mt-3 text-sm font-semibold">Hali artefakt yo‘q</p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  AI alohida kod, hujjat, rasm yoki video yaratganda u shu yerda qayta ishlatish, ko‘rish va yuklab olish uchun saqlanadi.
                </p>
              </div>
            ) : active.kind === 'image' ? (
              <div className="flex min-h-[360px] items-center justify-center bg-muted/10 p-4">
                <img src={active.content} alt={active.title} className="max-h-[72vh] w-full rounded-xl border border-border/50 object-contain shadow-sm" />
              </div>
            ) : active.kind === 'video' ? (
              <div className="flex min-h-[360px] items-center justify-center bg-black/95 p-3">
                <video src={active.content} controls playsInline preload="metadata" className="aspect-video w-full rounded-xl bg-black object-contain" />
              </div>
            ) : canPreview && preview ? (
              <iframe title={active.title} sandbox="allow-scripts" srcDoc={active.content} className="h-full min-h-[520px] w-full border-0 bg-white" />
            ) : active.kind === 'code' ? (
              <div className="min-h-full bg-[#0d1117] text-[#e6edf3]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-[10px] text-white/55">
                  <span className="font-mono">{active.language || 'text'}</span>
                  <span>{active.content.split('\n').length} qator</span>
                </div>
                <pre className="m-0 max-w-full overflow-x-auto p-4 text-[12px] leading-relaxed"><code>{active.content}</code></pre>
              </div>
            ) : (
              <article className="prose prose-sm max-w-none break-words px-5 py-5 dark:prose-invert [overflow-wrap:anywhere]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{active.content}</ReactMarkdown>
              </article>
            )}

            {run && (
              <div className="border-t border-border/40 bg-background p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Natija
                  <span className={run.ok ? 'text-emerald-500' : 'text-destructive'}>{run.ok ? 'muvaffaqiyatli' : 'xato'}</span>
                  <span className="font-mono normal-case">{run.durationMs} ms</span>
                </p>
                {run.logs.length > 0 && <pre className="max-h-44 overflow-auto rounded-lg bg-muted/60 p-2 text-[11px]">{run.logs.join('\n')}</pre>}
                {run.result !== undefined && run.result !== null && (
                  <pre className="mt-1 max-h-36 overflow-auto rounded-lg bg-muted/40 p-2 text-[11px]">{`→ ${JSON.stringify(run.result, null, 2)}`}</pre>
                )}
                {run.error && <p className="mt-1 text-[11px] text-destructive">{run.error}</p>}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
