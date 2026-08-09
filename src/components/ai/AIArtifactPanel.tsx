import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2, FileText, ImageIcon, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { extensionFor, type AIArtifact } from '@/lib/aiArtifacts';

interface AIArtifactPanelProps {
  artifacts: AIArtifact[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  isMobile?: boolean;
}

const iconFor = (kind: AIArtifact['kind']) =>
  kind === 'code' ? FileCode2 : kind === 'image' ? ImageIcon : FileText;

export function AIArtifactPanel({
  artifacts,
  activeId,
  onSelect,
  onClose,
  isMobile,
}: AIArtifactPanelProps) {
  const [copied, setCopied] = useState(false);

  const active = useMemo(
    () => artifacts.find((a) => a.id === activeId) || artifacts[artifacts.length - 1],
    [artifacts, activeId],
  );

  useEffect(() => {
    setCopied(false);
  }, [active?.id]);

  const copy = async () => {
    if (!active) return;
    await navigator.clipboard.writeText(active.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const download = () => {
    if (!active) return;
    if (active.kind === 'image') {
      const a = document.createElement('a');
      a.href = active.content;
      a.download = 'alsamos-ai.png';
      a.target = '_blank';
      a.click();
      return;
    }
    const blob = new Blob([active.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alsamos-artifact.${extensionFor(active)}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={cn(
        'flex h-full flex-col border-l border-border/50 bg-card/70 backdrop-blur-xl',
        isMobile ? 'w-full' : 'w-[380px] lg:w-[440px]',
      )}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/30 px-3 sm:h-14">
        <span className="text-sm font-semibold">Artefaktlar</span>
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
          {artifacts.length}
        </span>
        <div className="flex-1" />
        {active && (
          <>
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={copy} aria-label="Nusxalash">
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg"
              onClick={download}
              aria-label="Yuklab olish"
            >
              <Download className="h-4 w-4" />
            </Button>
          </>
        )}
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={onClose} aria-label="Yopish">
          <X className="h-4 w-4" />
        </Button>
      </header>

      {artifacts.length > 1 && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border/30 px-3 py-2">
          {artifacts.map((a) => {
            const Icon = iconFor(a.kind);
            return (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                  a.id === active?.id
                    ? 'border-alsamos-orange/40 bg-alsamos-orange/10 text-alsamos-orange'
                    : 'border-border/50 text-muted-foreground hover:bg-muted/50',
                )}
              >
                <Icon className="h-3 w-3" />
                <span className="max-w-[140px] truncate">{a.title}</span>
              </button>
            );
          })}
        </div>
      )}

      <ScrollArea className="flex-1">
        {!active ? (
          <div className="flex h-full min-h-[200px] items-center justify-center px-6 text-center text-xs text-muted-foreground">
            Hozircha artefakt yo'q. Kod, uzun hujjat yoki rasm yaratilganda shu yerda ko'rinadi.
          </div>
        ) : active.kind === 'image' ? (
          <div className="p-4">
            <img src={active.content} alt={active.title} className="w-full rounded-2xl border border-border/50" />
          </div>
        ) : active.kind === 'code' ? (
          <pre className="overflow-x-auto p-4 text-[12px] leading-relaxed">
            <code>{active.content}</code>
          </pre>
        ) : (
          <div className="prose prose-sm max-w-none p-4 dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{active.content}</ReactMarkdown>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
