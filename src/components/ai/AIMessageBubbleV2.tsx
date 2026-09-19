import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Github,
  Info,
  Loader2,
  Maximize2,
  Paperclip,
  Play,
  Presentation,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { tokenizeHttpUrls } from '@/lib/ai/links';
import type { AIAttachmentMeta, AIMessage } from './types';
import { AIToolTimeline } from './AIToolTimeline';

const isGithubUrl = (value: string) => /^https?:\/\/(?:www\.)?github\.com\//i.test(value);
const shortGithubLabel = (href: string) =>
  href.replace(/^https?:\/\/(?:www\.)?github\.com\//i, '').replace(/\/$/, '').replace(/\.git$/i, '');

function speechText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, ' kod bloki ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/[*_~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function GithubChip({ href, children, onUserBubble }: { href: string; children?: React.ReactNode; onUserBubble?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={href}
      className={cn(
        'mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 align-middle text-[0.92em] font-medium no-underline',
        onUserBubble
          ? 'border-current/20 bg-background/10 text-current hover:bg-background/15'
          : 'border-blue-500/25 bg-blue-500/8 text-blue-600 hover:bg-blue-500/15 dark:text-blue-400',
      )}
    >
      <Github className="h-3 w-3 shrink-0" />
      <span className="max-w-[min(68vw,420px)] truncate">{children ?? shortGithubLabel(href)}</span>
    </a>
  );
}

function linkifyUrls(text: string, onUserBubble?: boolean): React.ReactNode[] {
  return tokenizeHttpUrls(text).map((token, index) => {
    if (token.type === 'text') {
      return <span key={`text-${index}`}>{token.value}</span>;
    }

    if (isGithubUrl(token.href)) {
      return <GithubChip key={`gh-${index}`} href={token.href} onUserBubble={onUserBubble} />;
    }

    return (
      <a
        key={`url-${index}`}
        href={token.href}
        target="_blank"
        rel="noreferrer noopener"
        className={cn(
          'break-all underline-offset-2 hover:underline',
          onUserBubble
            ? 'text-blue-300 hover:text-blue-200 dark:text-blue-600 dark:hover:text-blue-700'
            : 'text-blue-600 dark:text-blue-400',
        )}
      >
        {token.value}
      </a>
    );
  });
}

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const language = /language-(\w+)/.exec(className || '')?.[1] || 'text';
  const code = String(children).replace(/\n$/, '');

  return (
    <div className="my-3 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border/60 bg-muted/40">
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{language}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          }}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Nusxalandi' : 'Nusxalash'}
        </button>
      </div>
      <pre className="m-0 w-full min-w-0 max-w-full overflow-x-auto p-3 text-xs leading-relaxed [tab-size:2]">
        <code className="whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

function ImageCard({ url, id }: { url: string; id: string }) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <>
      <div className="relative mt-3 w-full max-w-xl overflow-hidden rounded-2xl border border-border/50 bg-muted/20">
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="block w-full cursor-zoom-in bg-transparent p-0 text-left"
          aria-label="Rasmni katta ko‘rish"
        >
          <img
            src={url}
            alt="AI yaratgan rasm"
            className="block h-auto max-h-[70vh] w-full object-contain"
            loading="lazy"
          />
        </button>
        <div className="absolute right-2 top-2 flex gap-1">
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 rounded-lg bg-background/85 backdrop-blur"
            onClick={() => setPreviewOpen(true)}
            aria-label="To‘liq ko‘rish"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 rounded-lg bg-background/85 backdrop-blur"
            asChild
            aria-label="Yuklab olish"
          >
            <a href={url} download={`alsamos-ai-${id}.png`}>
              <Download className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="h-[94vh] w-[96vw] max-w-[96vw] place-items-center gap-0 overflow-hidden border-white/10 bg-black/95 p-3 text-white shadow-2xl sm:rounded-2xl">
          <DialogTitle className="sr-only">AI yaratgan rasm</DialogTitle>
          <img
            src={url}
            alt="AI yaratgan rasm — to‘liq ko‘rinish"
            className="max-h-[88vh] max-w-[92vw] select-none object-contain"
          />
          <div className="absolute bottom-4 right-4">
            <Button size="sm" variant="secondary" asChild className="gap-2 bg-white/90 text-black hover:bg-white">
              <a href={url} download={`alsamos-ai-${id}.png`}>
                <Download className="h-4 w-4" />
                Yuklab olish
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VideoCard({ url }: { url: string }) {
  return (
    <div className="mt-3 w-full max-w-2xl overflow-hidden rounded-2xl border border-border/50 bg-black">
      <video src={url} controls playsInline preload="metadata" className="aspect-video w-full bg-black object-contain" />
      <div className="flex items-center justify-between gap-2 bg-background px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><Play className="h-3.5 w-3.5" /> Yaratilgan video</span>
        <a href={url} target="_blank" rel="noreferrer noopener" className="hover:text-foreground">Yangi oynada ochish</a>
      </div>
    </div>
  );
}

function readableBytes(value?: number) {
  const bytes = Math.max(0, Number(value) || 0);
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function presentedFileIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.csv')) return FileSpreadsheet;
  if (lower.endsWith('.pptx')) return Presentation;
  if (lower.endsWith('.docx') || lower.endsWith('.pdf') || lower.endsWith('.md') || lower.endsWith('.txt')) return FileText;
  return FileIcon;
}

function PresentedFileCard({ file }: { file: AIAttachmentMeta }) {
  const [href, setHref] = useState(file.url || '');
  const [resolving, setResolving] = useState(Boolean(file.bucket && file.storagePath));

  useEffect(() => {
    let cancelled = false;
    if (!file.bucket || !file.storagePath) {
      setHref(file.url || '');
      setResolving(false);
      return () => { cancelled = true; };
    }

    setResolving(true);
    void supabase.storage
      .from(file.bucket)
      .createSignedUrl(file.storagePath, 60 * 60)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data?.signedUrl) setHref(data.signedUrl);
        else setHref(file.url || '');
        setResolving(false);
      });

    return () => { cancelled = true; };
  }, [file.bucket, file.storagePath, file.url]);

  const Icon = presentedFileIcon(file.name);
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.toUpperCase() : 'FILE';
  const meta = [ext, readableBytes(file.size)].filter(Boolean).join(' · ');

  return (
    <div className="mt-3 w-full max-w-xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="flex min-w-0 items-center gap-3 p-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/45">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{file.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {meta || file.mimeType || 'Tayyor fayl'}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-9 shrink-0 gap-1.5 rounded-xl px-3 text-xs"
          disabled={resolving || !href}
          asChild={Boolean(href) && !resolving}
        >
          {href && !resolving ? (
            <a href={href} target="_blank" rel="noreferrer noopener" download={file.name}>
              <Download className="h-3.5 w-3.5" />
              Yuklab olish
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {resolving ? 'Tayyorlanmoqda' : 'Yuklab olish'}
            </span>
          )}
        </Button>
      </div>
      <div className="border-t border-border/40 px-3 py-1.5 text-[10px] font-medium text-muted-foreground">
        Presented file
      </div>
    </div>
  );
}

interface Props {
  message: AIMessage;
  isStreaming?: boolean;
  onRegenerate?: () => void;
}

export function AIMessageBubble({ message, isStreaming, onRegenerate }: Props) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => () => {
    if (utteranceRef.current && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      utteranceRef.current = null;
    }
  }, []);

  const toggleSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      utteranceRef.current = null;
      setSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speechText(message.content));
    utterance.lang = document.documentElement.lang || 'uz-UZ';
    utterance.rate = 1;
    utterance.onend = () => { utteranceRef.current = null; setSpeaking(false); };
    utterance.onerror = () => { utteranceRef.current = null; setSpeaking(false); };
    utteranceRef.current = utterance;
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  if (message.role === 'user') {
    return (
      <div className="mb-4 flex min-w-0 flex-col items-end gap-1.5 overflow-hidden">
        <div className="min-w-0 max-w-[88%] overflow-hidden rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5 text-background shadow-sm sm:max-w-[82%]">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
            {linkifyUrls(message.content, true)}
          </p>
        </div>
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex max-w-[88%] flex-wrap justify-end gap-1.5 overflow-hidden">
            {message.attachments.map((file) => (
              <a
                key={file.url}
                href={file.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex min-w-0 max-w-[220px] items-center gap-1 rounded-lg border border-border/60 bg-card px-2 py-1 text-[11px] hover:bg-muted"
              >
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="truncate">{file.name}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  const images = message.images?.length ? message.images : message.imageUrl ? [message.imageUrl] : [];
  const videos = message.videos?.length ? message.videos : message.videoUrl ? [message.videoUrl] : [];

  return (
    <div className="group mb-6 w-full min-w-0 max-w-full overflow-x-hidden">
      <div className="min-w-0 max-w-full overflow-hidden">
          {((message.plan && message.plan.length > 0) || (message.tools && message.tools.length > 0)) && (
            <AIToolTimeline events={message.tools ?? []} plan={message.plan} defaultOpen={Boolean(isStreaming)} />
          )}

          {message.error ? (
            <div className="flex max-w-full items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm text-destructive [overflow-wrap:anywhere]">{message.content}</p>
                {onRegenerate && (
                  <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={onRegenerate}>
                    <RotateCcw className="mr-1.5 h-3 w-3" /> Qayta urinish
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div
              className="prose prose-sm w-full min-w-0 max-w-full overflow-hidden break-words dark:prose-invert
                prose-p:mb-3 prose-p:max-w-full prose-p:break-words prose-p:leading-relaxed
                prose-headings:max-w-full prose-headings:break-words prose-headings:font-semibold
                prose-li:max-w-full prose-li:break-words
                prose-a:break-all prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline dark:prose-a:text-blue-400
                prose-code:break-all prose-code:rounded-md prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
                prose-pre:max-w-full prose-pre:overflow-x-auto prose-pre:bg-transparent prose-pre:p-0
                prose-blockquote:max-w-full prose-blockquote:border-l-border prose-blockquote:bg-muted/30 prose-blockquote:px-4 prose-blockquote:py-1
                prose-strong:text-foreground [overflow-wrap:anywhere]"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  pre: ({ children }) => <>{children}</>,
                  table: ({ children, ...props }: any) => (
                    <div className="my-3 w-full min-w-0 max-w-full overflow-x-auto rounded-lg border border-border/60">
                      <table className="m-0 min-w-full w-max max-w-none" {...props}>{children}</table>
                    </div>
                  ),
                  a: ({ href, children, ...props }: any) => {
                    if (typeof href === 'string' && isGithubUrl(href)) {
                      const label = String(Array.isArray(children) ? children.join('') : (children ?? ''));
                      return <GithubChip href={href}>{label && !isGithubUrl(label) ? label : undefined}</GithubChip>;
                    }
                    return <a href={href} target="_blank" rel="noreferrer noopener" {...props}>{children}</a>;
                  },
                  p: ({ children }: any) => (
                    <p>
                      {Array.isArray(children)
                        ? children.map((child: any, index: number) =>
                            typeof child === 'string' ? <span key={index}>{linkifyUrls(child)}</span> : child,
                          )
                        : typeof children === 'string'
                          ? linkifyUrls(children)
                          : children}
                    </p>
                  ),
                  code: ({ className, children, ...props }: any) => {
                    const isBlock = /language-/.test(className || '') || String(children).includes('\n');
                    if (!isBlock) return <code className={className} {...props}>{children}</code>;
                    return <CodeBlock className={className}>{children}</CodeBlock>;
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-foreground/70 align-middle" />}
            </div>
          )}

          {images.map((url) => <ImageCard key={url} url={url} id={message.id} />)}
          {videos.map((url) => <VideoCard key={url} url={url} />)}
          {message.attachments?.map((file, index) => (
            <PresentedFileCard key={file.storagePath || file.url || `${file.name}-${index}`} file={file} />
          ))}

          {message.sources && message.sources.length > 0 && sourcesOpen && (
            <div className="mt-3 max-w-full overflow-hidden rounded-xl border border-border/50 bg-muted/15 p-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Manbalar</p>
              <ol className="space-y-1">
                {message.sources.slice(0, 8).map((source, index) => (
                  <li key={`${source.url}-${index}`} className="flex min-w-0 gap-1.5 text-xs">
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">[{index + 1}]</span>
                    {isGithubUrl(source.url) ? (
                      <GithubChip href={source.url}>{source.title || undefined}</GithubChip>
                    ) : (
                      <a href={source.url} target="_blank" rel="noreferrer noopener" className="min-w-0 truncate text-blue-600 hover:underline dark:text-blue-400">
                        {source.title || source.url}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {message.notice && (
            <p className="mt-2 flex max-w-full items-start gap-1.5 break-words text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
              <Info className="mt-0.5 h-3 w-3 shrink-0" /> {message.notice}
            </p>
          )}

          {!message.error && !isStreaming && (
            <div className="mt-2 flex flex-wrap items-center gap-0.5 text-muted-foreground">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-lg"
                aria-label="Nusxalash"
                title="Nusxalash"
                onClick={() => {
                  void navigator.clipboard.writeText(message.content);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1400);
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              {onRegenerate && (
                <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" aria-label="Qayta yaratish" title="Qayta yozish" onClick={onRegenerate}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-lg"
                aria-label={speaking ? 'Ovozli o‘qishni to‘xtatish' : 'Ovozli o‘qish'}
                title={speaking ? 'O‘qishni to‘xtatish' : 'Ovozli o‘qish'}
                onClick={toggleSpeech}
              >
                {speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </Button>
              {message.sources && message.sources.length > 0 && (
                <Button
                  size="sm"
                  variant={sourcesOpen ? 'secondary' : 'ghost'}
                  className="h-7 gap-1 rounded-lg px-2 text-[10px]"
                  aria-label="Manbalarni ko‘rsatish"
                  aria-pressed={sourcesOpen}
                  title="Manbalar"
                  onClick={() => setSourcesOpen((value) => !value)}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>{message.sources.length}</span>
                </Button>
              )}
              {message.model && <span className="ml-1 font-mono text-[10px] text-muted-foreground">{message.model}</span>}
            </div>
          )}
      </div>
    </div>
  );
}

export function AIThinkingBubble({ label }: { label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6 min-w-0 max-w-full overflow-x-hidden">
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-border/50 bg-muted/10">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/25"
          aria-expanded={open}
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{label}</span>
          {open
            ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </button>
        {open && (
          <div className="border-t border-border/40 px-4 py-3">
            <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/70" />
              <span className="break-words leading-relaxed">{label}</span>
            </div>
            <p className="mt-2 pl-4 text-[10px] leading-relaxed text-muted-foreground/75">
              Bajariladigan tool va commandlar aniqlangach shu qator ichida jonli ko‘rinadi.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}