import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Download,
  Github,
  Info,
  Maximize2,
  Paperclip,
  Play,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AIMessage } from './types';
import { AIToolTimeline } from './AIToolTimeline';

const GH_SPLIT_RE = /(https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.\-/#?=&%]+)/g;
const isGithubUrl = (value: string) => /^https?:\/\/(?:www\.)?github\.com\//i.test(value);
const shortGithubLabel = (href: string) =>
  href.replace(/^https?:\/\/(?:www\.)?github\.com\//i, '').replace(/\/$/, '').replace(/\.git$/i, '');

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

function linkifyGithub(text: string, onUserBubble?: boolean): React.ReactNode[] {
  return text.split(GH_SPLIT_RE).map((part, index) =>
    isGithubUrl(part) ? (
      <GithubChip key={`gh-${index}`} href={part} onUserBubble={onUserBubble} />
    ) : (
      <span key={`text-${index}`}>{part}</span>
    ),
  );
}

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const language = /language-(\w+)/.exec(className || '')?.[1] || 'text';
  const code = String(children).replace(/\n$/, '');

  return (
    <div className="my-3 w-full max-w-full overflow-hidden rounded-xl border border-border/60 bg-muted/40">
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
      <pre className="m-0 w-full max-w-full overflow-x-auto p-3 text-xs leading-relaxed [tab-size:2]">
        <code className="whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

function ImageCard({ url, id }: { url: string; id: string }) {
  return (
    <div className="relative mt-3 w-full max-w-xl overflow-hidden rounded-2xl border border-border/50 bg-muted/20">
      <img src={url} alt="AI yaratgan rasm" className="block h-auto max-h-[70vh] w-full object-contain" loading="lazy" />
      <div className="absolute right-2 top-2 flex gap-1">
        <Button size="icon" variant="secondary" className="h-8 w-8 rounded-lg bg-background/85 backdrop-blur" onClick={() => window.open(url, '_blank')} aria-label="To‘liq ko‘rish">
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="secondary" className="h-8 w-8 rounded-lg bg-background/85 backdrop-blur" asChild aria-label="Yuklab olish">
          <a href={url} download={`alsamos-ai-${id}.png`}><Download className="h-3.5 w-3.5" /></a>
        </Button>
      </div>
    </div>
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

interface Props {
  message: AIMessage;
  isStreaming?: boolean;
  onRegenerate?: () => void;
}

export function AIMessageBubble({ message, isStreaming, onRegenerate }: Props) {
  const [copied, setCopied] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="mb-4 flex min-w-0 flex-col items-end gap-1.5 overflow-hidden">
        <div className="min-w-0 max-w-[88%] overflow-hidden rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5 text-background shadow-sm sm:max-w-[82%]">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
            {linkifyGithub(message.content, true)}
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
    <div className="group mb-6 w-full min-w-0 max-w-full overflow-hidden">
      <div className="flex min-w-0 max-w-full items-start gap-2.5 sm:gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/45">
          <Bot className="h-4 w-4 text-foreground/80" />
        </div>

        <div className="min-w-0 max-w-full flex-1 overflow-hidden">
          {message.tools && message.tools.length > 0 && <AIToolTimeline events={message.tools} />}

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
              className="prose prose-sm min-w-0 max-w-full overflow-hidden break-words dark:prose-invert
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
                    <div className="my-3 w-full max-w-full overflow-x-auto rounded-lg border border-border/60">
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
                            typeof child === 'string' ? <span key={index}>{linkifyGithub(child)}</span> : child,
                          )
                        : typeof children === 'string'
                          ? linkifyGithub(children)
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

          {message.sources && message.sources.length > 0 && (
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
            <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-lg"
                aria-label="Nusxalash"
                onClick={() => {
                  void navigator.clipboard.writeText(message.content);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1400);
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              {onRegenerate && (
                <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" aria-label="Qayta yaratish" onClick={onRegenerate}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
              {message.model && <span className="ml-1 font-mono text-[10px] text-muted-foreground">{message.model}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AIThinkingBubble({ label }: { label: string }) {
  return (
    <div className="mb-6 flex items-start gap-2.5 sm:gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/45">
        <Bot className="h-4 w-4 text-foreground/80" />
      </div>
      <div className="rounded-2xl border border-border/50 bg-muted/20 px-3.5 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {[0, 150, 300].map((delay) => (
              <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </div>
    </div>
  );
}
