import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  Copy,
  Check,
  RotateCcw,
  Download,
  AlertTriangle,
  Maximize2,
  Info,
  Paperclip,
  Github,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AIMessage } from './types';
import { AIToolTimeline } from './AIToolTimeline';

/* ------------------------------------------------------------------ *
 * GitHub havolalari — ko'k chip + GitHub ikonkasi
 * ------------------------------------------------------------------ */

const GH_SPLIT_RE = /(https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.\-/#?=&%]+)/g;
const isGithubUrl = (value: string) => /^https?:\/\/(?:www\.)?github\.com\//i.test(value);

const shortGithubLabel = (href: string) =>
  href
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, '')
    .replace(/\/$/, '')
    .replace(/\.git$/i, '');

function GithubChip({
  href,
  children,
  onUserBubble,
}: {
  href: string;
  children?: React.ReactNode;
  onUserBubble?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={href}
      className={cn(
        'mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 align-middle text-[0.95em] font-medium no-underline transition-colors',
        onUserBubble
          ? 'border-white/40 bg-white/15 text-white hover:bg-white/25'
          : 'border-blue-500/30 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400',
      )}
    >
      <Github className="h-3 w-3 shrink-0" />
      <span className="truncate">{children ?? shortGithubLabel(href)}</span>
    </a>
  );
}

/** Oddiy matn ichidagi github.com havolalarini chiplarga aylantiradi. */
function linkifyGithub(text: string, onUserBubble?: boolean): React.ReactNode[] {
  return text.split(GH_SPLIT_RE).map((part, index) =>
    isGithubUrl(part) ? (
      <GithubChip key={`gh-${index}`} href={part} onUserBubble={onUserBubble} />
    ) : (
      <span key={`t-${index}`}>{part}</span>
    ),
  );
}

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const lang = /language-(\w+)/.exec(className || '')?.[1] || 'text';
  const code = String(children).replace(/\n$/, '');

  return (
    <div className="relative my-3 overflow-hidden rounded-xl border border-border/50 bg-muted">
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-1.5">
        <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">{lang}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Nusxalandi' : 'Nusxalash'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ImageCard({ url, id }: { url: string; id: string }) {
  return (
    <div className="relative mt-3 max-w-md overflow-hidden rounded-2xl border border-border/40 shadow-lg">
      <img src={url} alt="AI yaratgan rasm" className="w-full" loading="lazy" />
      <div className="absolute right-2 top-2 flex gap-1.5">
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 rounded-lg backdrop-blur"
          onClick={() => window.open(url, '_blank')}
          aria-label="To'liq ko'rish"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 rounded-lg backdrop-blur"
          asChild
          aria-label="Yuklab olish"
        >
          <a href={url} download={`alsamos-ai-${id}.png`}>
            <Download className="h-3.5 w-3.5" />
          </a>
        </Button>
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
      <div className="mb-4 flex flex-col items-end gap-1.5">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-primary-foreground shadow-sm">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {linkifyGithub(message.content, true)}
          </p>
        </div>
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {message.attachments.map((file) => (
              <a
                key={file.url}
                href={file.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1 rounded-lg border border-border/60 bg-card px-2 py-1 text-[11px] hover:bg-muted"
              >
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[160px] truncate">{file.name}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  const images = message.images?.length
    ? message.images
    : message.imageUrl
      ? [message.imageUrl]
      : [];

  return (
    <div className="group mb-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-alsamos-orange to-alsamos-orange-dark shadow-md shadow-alsamos-orange/20">
          <Bot className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          {message.tools && message.tools.length > 0 && <AIToolTimeline events={message.tools} />}

          {message.error ? (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="text-sm text-destructive">{message.content}</p>
                {onRegenerate && (
                  <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={onRegenerate}>
                    <RotateCcw className="mr-1.5 h-3 w-3" /> Qayta urinish
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div
              className="prose prose-sm max-w-none dark:prose-invert
                prose-p:leading-relaxed prose-p:mb-3
                prose-headings:font-display prose-headings:font-bold
                prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-transparent prose-pre:p-0 prose-pre:border-0
                prose-a:text-alsamos-orange prose-a:no-underline hover:prose-a:underline
                prose-li:marker:text-alsamos-orange
                prose-strong:text-foreground
                prose-blockquote:border-l-alsamos-orange/50 prose-blockquote:bg-muted/30 prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-blockquote:px-4
                prose-table:border prose-table:border-border prose-th:bg-muted/50 prose-td:border prose-td:border-border prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  pre: ({ children }) => <>{children}</>,
                  // GitHub havolalari ko'k chip + ikonka bilan ko'rsatiladi.
                  a: ({ href, children, ...props }: any) => {
                    if (typeof href === 'string' && isGithubUrl(href)) {
                      const label = String(
                        Array.isArray(children) ? children.join('') : (children ?? ''),
                      );
                      const useLabel = label && !isGithubUrl(label) ? label : undefined;
                      return (
                        <GithubChip href={href}>{useLabel}</GithubChip>
                      );
                    }
                    return (
                      <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
                        {children}
                      </a>
                    );
                  },
                  // Havolaga aylanmagan oddiy matndagi github.com manzillari ham chip bo'ladi.
                  p: ({ children }: any) => (
                    <p>
                      {Array.isArray(children)
                        ? children.map((child: any, index: number) =>
                            typeof child === 'string' ? (
                              <span key={index}>{linkifyGithub(child)}</span>
                            ) : (
                              child
                            ),
                          )
                        : typeof children === 'string'
                          ? linkifyGithub(children)
                          : children}
                    </p>
                  ),
                  code: ({ className, children, ...props }: any) => {
                    const isBlock = /language-/.test(className || '') || String(children).includes('\n');
                    if (!isBlock) {
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }
                    return <CodeBlock className={className}>{children}</CodeBlock>;
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-alsamos-orange align-middle" />
              )}
            </div>
          )}

          {images.map((url) => (
            <ImageCard key={url} url={url} id={message.id} />
          ))}

          {message.sources && message.sources.length > 0 && (
            <div className="mt-3 rounded-xl border border-border/50 bg-card/40 p-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Manbalar
              </p>
              <ol className="space-y-1">
                {message.sources.slice(0, 8).map((source, index) => (
                  <li key={`${source.url}-${index}`} className="flex gap-1.5 text-xs">
                    <span className="font-mono text-[10px] text-muted-foreground">[{index + 1}]</span>
                    {isGithubUrl(source.url) ? (
                      <GithubChip href={source.url}>{source.title || undefined}</GithubChip>
                    ) : (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="line-clamp-1 text-alsamos-orange hover:underline"
                      >
                        {source.title || source.url}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {message.notice && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Info className="h-3 w-3" /> {message.notice}
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
                  navigator.clipboard.writeText(message.content);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              {onRegenerate && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 rounded-lg"
                  aria-label="Qayta yaratish"
                  onClick={onRegenerate}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
              {message.model && (
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">{message.model}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AIThinkingBubble({ label }: { label: string }) {
  return (
    <div className="mb-6 flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-alsamos-orange to-alsamos-orange-dark shadow-md shadow-alsamos-orange/20">
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div className="rounded-2xl border border-border/30 bg-card/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="h-2 w-2 animate-bounce rounded-full bg-alsamos-orange"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </div>
          <span className={cn('text-xs text-muted-foreground')}>{label}</span>
        </div>
      </div>
    </div>
  );
}
