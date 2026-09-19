import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Code2,
  FileText,
  Filter,
  LayoutTemplate,
  Search,
  Shapes,
  Workflow,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { AIArtifactPanel } from '@/components/ai/AIArtifactPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useAIWorkspaceLayout } from '@/hooks/use-ai-workspace-layout';
import { db } from '@/lib/db';
import { extractArtifacts, type AIArtifact, type AIArtifactKind } from '@/lib/aiArtifacts';
import type { AIMessage } from '@/components/ai/types';
import { cn } from '@/lib/utils';

type LibraryArtifact = AIArtifact & {
  conversationId: string;
  conversationTitle: string;
  updatedAt: Date;
};

type FilterId = 'all' | 'apps' | 'documents' | 'code' | 'visuals';

function reviveMessages(raw: unknown): AIMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((message: any) => ({
    ...message,
    timestamp: new Date(message?.timestamp || Date.now()),
  }));
}

function filterGroup(kind: AIArtifactKind): Exclude<FilterId, 'all'> {
  if (kind === 'website' || kind === 'component') return 'apps';
  if (kind === 'document') return 'documents';
  if (kind === 'code') return 'code';
  return 'visuals';
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return 'hozir';
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} kun oldin`;
  return new Intl.DateTimeFormat('uz-UZ', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function Preview({ artifact }: { artifact: LibraryArtifact }) {
  if (artifact.kind === 'website') {
    return (
      <iframe
        title={artifact.title}
        sandbox=""
        srcDoc={artifact.content}
        className="h-full w-full border-0 bg-white pointer-events-none"
        tabIndex={-1}
      />
    );
  }

  if (artifact.kind === 'graphic' && artifact.language === 'svg') {
    return (
      <iframe
        title={artifact.title}
        sandbox=""
        srcDoc={artifact.content}
        className="h-full w-full border-0 bg-white pointer-events-none"
        tabIndex={-1}
      />
    );
  }

  if (artifact.kind === 'component' || artifact.kind === 'code') {
    return (
      <pre className="h-full overflow-hidden bg-[#0d1117] p-4 text-[10px] leading-relaxed text-[#e6edf3]">
        <code>{artifact.content.split('\n').slice(0, 18).join('\n')}</code>
      </pre>
    );
  }

  if (artifact.kind === 'diagram') {
    return (
      <div className="flex h-full items-center justify-center bg-muted/20 p-6 text-center">
        <div>
          <Workflow className="mx-auto h-9 w-9 text-muted-foreground" />
          <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-xs text-muted-foreground">
            {artifact.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden bg-muted/15 p-5">
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {artifact.content.slice(0, 1000)}
        </p>
      </div>
    </div>
  );
}

function KindIcon({ kind }: { kind: AIArtifactKind }) {
  if (kind === 'website') return <LayoutTemplate className="h-4 w-4" />;
  if (kind === 'component' || kind === 'code') return <Code2 className="h-4 w-4" />;
  if (kind === 'diagram') return <Workflow className="h-4 w-4" />;
  if (kind === 'graphic') return <Shapes className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

export default function AIArtifactsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isMobile } = useAIWorkspaceLayout();
  const [artifacts, setArtifacts] = useState<LibraryArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const { data, error } = await db
        .from('ai_conversations')
        .select('id, title, messages, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(200);

      if (cancelled) return;
      if (error) {
        console.error('Artifact library load failed:', error);
        setArtifacts([]);
        setLoading(false);
        return;
      }

      const next: LibraryArtifact[] = [];
      for (const row of data ?? []) {
        const messages = reviveMessages((row as any).messages);
        const conversationId = String((row as any).id);
        const conversationTitle = String((row as any).title || 'Suhbat');
        const updatedAt = new Date((row as any).updated_at || Date.now());

        for (const artifact of extractArtifacts(messages)) {
          next.push({
            ...artifact,
            id: `${conversationId}:${artifact.id}`,
            conversationId,
            conversationTitle,
            updatedAt,
          });
        }
      }

      next.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setArtifacts(next);
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return artifacts.filter((artifact) => {
      if (filter !== 'all' && filterGroup(artifact.kind) !== filter) return false;
      if (!clean) return true;
      return (
        artifact.title.toLowerCase().includes(clean) ||
        artifact.conversationTitle.toLowerCase().includes(clean) ||
        artifact.content.toLowerCase().includes(clean)
      );
    });
  }, [artifacts, filter, query]);

  const selected = artifacts.find((artifact) => artifact.id === activeId) || null;

  return (
    <div className="relative min-h-full bg-background">
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-3 sm:px-6">
          <Button type="button" size="icon" variant="ghost" className="mr-2 h-9 w-9 rounded-xl" onClick={() => navigate('/ai')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base font-semibold sm:text-lg">Artifacts</h1>
          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{artifacts.length}</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search artifacts"
              className="h-11 rounded-xl bg-muted/45 pl-9"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {([
              ['all', 'Hammasi'],
              ['apps', 'Apps'],
              ['documents', 'Hujjat'],
              ['code', 'Kod'],
              ['visuals', 'Visual'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors',
                  filter === id
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border/60 bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                {id === 'all' && <Filter className="h-3.5 w-3.5" />}
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => <div key={item} className="h-72 animate-pulse rounded-3xl bg-muted/40" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mx-auto mt-24 max-w-md text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-muted/30">
              <LayoutTemplate className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="mt-4 text-base font-semibold">Artifact topilmadi</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Website, interactive component, diagram, SVG, katta kod yoki standalone Markdown/text yaratganingizda shu yerda ko‘rinadi.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((artifact) => (
              <article
                key={artifact.id}
                className="group overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => setActiveId(artifact.id)}
                  className="block w-full text-left"
                >
                  <div className="h-52 overflow-hidden border-b border-border/50 bg-muted/20">
                    <Preview artifact={artifact} />
                  </div>
                  <div className="p-4">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-muted-foreground"><KindIcon kind={artifact.kind} /></span>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-sm font-semibold">{artifact.title}</h2>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{artifact.conversationTitle}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Edited {relativeTime(artifact.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                </button>
                <div className="flex items-center justify-end border-t border-border/40 px-3 py-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-lg text-xs"
                    onClick={() => navigate(`/ai/chats/${encodeURIComponent(artifact.conversationId)}`)}
                  >
                    Suhbatni ochish
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {selected && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/25 backdrop-blur-[1px]" onClick={() => setActiveId(null)}>
          <div className="h-full" onClick={(event) => event.stopPropagation()}>
            <AIArtifactPanel
              artifacts={artifacts}
              activeId={selected.id}
              onSelect={setActiveId}
              onClose={() => setActiveId(null)}
              isMobile={isMobile}
            />
          </div>
        </div>
      )}
    </div>
  );
}
