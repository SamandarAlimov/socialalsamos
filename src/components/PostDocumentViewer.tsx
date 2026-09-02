import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  ExternalLink,
  File,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  Rows3,
  Search,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/postComposer';
import {
  documentPreviewKind,
  documentTypeLabel,
  fileExtension,
  fileNameFromUrl,
  loadDocumentPreview,
  type DocxBlock,
  type DocumentPreviewKind,
  type LoadedDocumentPreview,
  type SpreadsheetSheet,
} from '@/lib/documentPreview';

interface PostDocumentViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
}

interface PostDocumentCardProps {
  url: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  className?: string;
}

function TypeIcon({ kind, className }: { kind: DocumentPreviewKind; className?: string }) {
  if (kind === 'xlsx' || kind === 'csv') return <FileSpreadsheet className={className} />;
  if (kind === 'pptx') return <Presentation className={className} />;
  if (kind === 'json' || kind === 'xml' || kind === 'markdown' || kind === 'text') {
    return <FileCode2 className={className} />;
  }
  if (kind === 'pdf' || kind === 'docx') return <FileText className={className} />;
  return <File className={className} />;
}

function spreadsheetColumnLabel(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function SpreadsheetPreview({ sheet }: { sheet: SpreadsheetSheet }) {
  const maxColumns = Math.max(1, ...sheet.rows.map((row) => row.length));

  return (
    <div className="min-w-max">
      <table className="border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            <th className="sticky left-0 z-20 h-8 min-w-10 border border-border bg-muted px-2 text-center font-medium text-muted-foreground">
              #
            </th>
            {Array.from({ length: maxColumns }).map((_, index) => (
              <th
                key={index}
                className="h-8 min-w-28 border border-border bg-muted px-2 text-left font-semibold text-foreground"
              >
                {spreadsheetColumnLabel(index)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-background even:bg-muted/20">
              <th className="sticky left-0 z-10 h-8 border border-border bg-muted px-2 text-center font-medium tabular-nums text-muted-foreground">
                {rowIndex + 1}
              </th>
              {Array.from({ length: maxColumns }).map((_, colIndex) => (
                <td
                  key={colIndex}
                  className="max-w-72 border border-border px-2 py-1.5 align-top text-foreground"
                >
                  <span className="block max-w-72 whitespace-pre-wrap break-words">
                    {row[colIndex] ?? ''}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {sheet.truncated && (
        <div className="sticky left-0 mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
          <Rows3 className="h-3.5 w-3.5" />
          Preview tezligi uchun qator/ustunlar qisqartirildi.
        </div>
      )}
    </div>
  );
}

function SpreadsheetTabs({ sheets }: { sheets: SpreadsheetSheet[] }) {
  const first = sheets[0]?.name || 'Sheet 1';

  if (sheets.length <= 1) {
    return (
      <div className="h-full overflow-auto p-3 md:p-5">
        {sheets[0] ? (
          <SpreadsheetPreview sheet={sheets[0]} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Jadval bo‘sh.
          </div>
        )}
      </div>
    );
  }

  return (
    <Tabs defaultValue={first} className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border bg-background px-3 py-2">
        <TabsList className="h-9 max-w-full justify-start overflow-x-auto bg-muted/60">
          {sheets.map((sheet) => (
            <TabsTrigger key={sheet.name} value={sheet.name} className="shrink-0 text-xs">
              {sheet.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {sheets.map((sheet) => (
        <TabsContent key={sheet.name} value={sheet.name} className="mt-0 min-h-0 flex-1 overflow-auto p-3 md:p-5">
          <SpreadsheetPreview sheet={sheet} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function DocxBlockView({ block }: { block: DocxBlock }) {
  if (block.type === 'table' && block.rows) {
    return (
      <div className="my-5 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="border border-slate-300 px-3 py-2 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const style = (block.style || '').toLowerCase();
  const text = block.text || '';
  if (!text) return null;

  if (style.includes('title')) return <h1 className="mb-5 mt-2 text-3xl font-bold tracking-tight">{text}</h1>;
  if (style.includes('heading1') || style.includes('heading 1')) return <h2 className="mb-3 mt-7 text-2xl font-bold">{text}</h2>;
  if (style.includes('heading2') || style.includes('heading 2')) return <h3 className="mb-2 mt-6 text-xl font-semibold">{text}</h3>;
  if (style.includes('heading')) return <h4 className="mb-2 mt-5 text-lg font-semibold">{text}</h4>;

  return <p className="mb-3 whitespace-pre-wrap text-[15px] leading-7 text-slate-800">{text}</p>;
}

function PreviewBody({
  kind,
  preview,
  url,
  fileName,
}: {
  kind: DocumentPreviewKind;
  preview: LoadedDocumentPreview | null;
  url: string;
  fileName: string;
}) {
  if (kind === 'pdf') {
    return (
      <iframe
        src={url + (url.includes('#') ? '' : '#view=FitH&toolbar=1&navpanes=0')}
        title={fileName}
        className="h-full w-full border-0 bg-muted"
      />
    );
  }

  if (!preview) return null;

  if (preview.kind === 'docx') {
    return (
      <ScrollArea className="h-full bg-muted/40">
        <div className="mx-auto my-5 min-h-[70vh] w-[min(816px,calc(100%-24px))] bg-white px-8 py-10 text-slate-950 shadow-sm ring-1 ring-black/5 md:px-14 md:py-14">
          {preview.blocks.length > 0 ? (
            preview.blocks.map((block, index) => <DocxBlockView key={index} block={block} />)
          ) : (
            <p className="text-sm text-slate-500">Hujjatda ko‘rsatiladigan matn topilmadi.</p>
          )}
          {preview.truncated && (
            <p className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
              Preview tezligi uchun hujjatning bir qismi ko‘rsatildi.
            </p>
          )}
        </div>
      </ScrollArea>
    );
  }

  if (preview.kind === 'xlsx' || preview.kind === 'csv') {
    return <SpreadsheetTabs sheets={preview.sheets} />;
  }

  if (preview.kind === 'markdown') {
    return (
      <ScrollArea className="h-full">
        <article className="prose prose-sm mx-auto max-w-4xl px-5 py-8 dark:prose-invert md:prose-base">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.text}</ReactMarkdown>
          {preview.truncated && <p><em>Preview qisqartirildi.</em></p>}
        </article>
      </ScrollArea>
    );
  }

  if (preview.kind === 'pptx') {
    return (
      <ScrollArea className="h-full bg-muted/35">
        <div className="mx-auto grid max-w-5xl gap-5 p-4 md:p-7">
          {preview.slides.map((slide) => (
            <section
              key={slide.number}
              className="aspect-[16/9] overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm md:p-10"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">SLIDE {slide.number}</span>
              </div>
              <div className="space-y-3">
                {slide.lines.length > 0 ? (
                  slide.lines.map((line, index) =>
                    index === 0 ? (
                      <h3 key={index} className="text-xl font-bold tracking-tight md:text-2xl">{line}</h3>
                    ) : (
                      <p key={index} className="text-sm leading-relaxed text-muted-foreground md:text-base">{line}</p>
                    ),
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">Bu slaydda matn topilmadi.</p>
                )}
              </div>
            </section>
          ))}
          {preview.truncated && (
            <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
              Preview uchun faqat dastlabki slaydlar ko‘rsatildi.
            </div>
          )}
        </div>
      </ScrollArea>
    );
  }

  const codeLike = preview.kind === 'json' || preview.kind === 'xml';
  return (
    <ScrollArea className="h-full">
      <pre
        className={cn(
          'mx-auto max-w-5xl whitespace-pre-wrap break-words px-5 py-7 text-sm leading-6',
          codeLike ? 'font-mono text-xs md:text-sm' : 'font-sans',
        )}
      >
        {preview.text}
      </pre>
      {preview.truncated && (
        <div className="mx-5 mb-5 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Preview fayl hajmi sabab qisqartirildi.
        </div>
      )}
    </ScrollArea>
  );
}

export function PostDocumentViewer({
  open,
  onOpenChange,
  url,
  fileName,
  fileSize,
  mimeType,
}: PostDocumentViewerProps) {
  const resolvedName = fileName || fileNameFromUrl(url);
  const kind = useMemo(() => documentPreviewKind(resolvedName || url, mimeType), [mimeType, resolvedName, url]);
  const [preview, setPreview] = useState<LoadedDocumentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || kind === 'pdf' || kind === 'unsupported') return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);

    void loadDocumentPreview(url, kind)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Preview yuklanmadi');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kind, open, url]);

  const label = documentTypeLabel(kind, fileExtension(resolvedName));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-[1180px] flex-col gap-0 overflow-hidden p-0 sm:rounded-3xl">
        <DialogHeader className="shrink-0 border-b border-border bg-background px-4 py-3.5 pr-14 md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
              <TypeIcon kind={kind} className="h-5 w-5 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base">{resolvedName}</DialogTitle>
              <DialogDescription className="mt-0.5 flex items-center gap-1.5 text-xs">
                <span>{label}</span>
                {fileSize ? <><span>·</span><span>{formatBytes(fileSize)}</span></> : null}
                <span>·</span>
                <span>Alsamos preview</span>
              </DialogDescription>
            </div>
            <div className="hidden shrink-0 items-center gap-1 sm:flex">
              <Button variant="ghost" size="sm" className="rounded-full" asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Yangi oynada
                </a>
              </Button>
              <Button variant="outline" size="sm" className="rounded-full" asChild>
                <a href={url} download={resolvedName} target="_blank" rel="noreferrer">
                  <Download className="mr-1.5 h-4 w-4" />
                  Yuklab olish
                </a>
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
          {kind === 'unsupported' ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <File className="h-7 w-7 text-muted-foreground" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">Ichki preview mavjud emas</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Bu fayl turi brauzer ichida xavfsiz preview qilinmaydi. Faylni yangi oynada oching yoki qurilmangizga yuklab oling.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button className="rounded-full" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Yangi oynada ochish
                  </a>
                </Button>
                <Button variant="outline" className="rounded-full" asChild>
                  <a href={url} download={resolvedName} target="_blank" rel="noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    Yuklab olish
                  </a>
                </Button>
              </div>
            </div>
          ) : loading ? (
            <div className="flex h-full flex-col items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Preview tayyorlanmoqda…</p>
              <p className="mt-1 text-xs text-muted-foreground">Fayl brauzeringizda qayta ishlanadi.</p>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <Search className="h-6 w-6 text-muted-foreground" />
              </span>
              <h3 className="mt-4 font-semibold">Preview ochilmadi</h3>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{error}</p>
              <Button variant="outline" className="mt-4 rounded-full" asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Yangi oynada ochish
                </a>
              </Button>
            </div>
          ) : (
            <PreviewBody kind={kind} preview={preview} url={url} fileName={resolvedName} />
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border bg-background px-4 py-2.5 sm:hidden">
          <span className="truncate text-xs text-muted-foreground">{label}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="rounded-full" asChild>
              <a href={url} target="_blank" rel="noreferrer" aria-label="Yangi oynada ochish">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full" asChild>
              <a href={url} download={resolvedName} target="_blank" rel="noreferrer" aria-label="Yuklab olish">
                <Download className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PostDocumentCard({
  url,
  fileName,
  fileSize,
  mimeType,
  className,
}: PostDocumentCardProps) {
  const [open, setOpen] = useState(false);
  const resolvedName = fileName || fileNameFromUrl(url);
  const kind = documentPreviewKind(resolvedName || url, mimeType);
  const extension = fileExtension(resolvedName);
  const label = documentTypeLabel(kind, extension);
  const previewable = kind !== 'unsupported';

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
        className={cn(
          'group flex cursor-pointer items-center gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm outline-none transition-all hover:border-foreground/15 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/60',
          className,
        )}
      >
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
          <TypeIcon kind={kind} className="h-5 w-5 text-muted-foreground" />
          {extension && (
            <span className="absolute -bottom-1 -right-1 rounded-md border border-background bg-foreground px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-background">
              {extension.slice(0, 5)}
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{resolvedName}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{label}</span>
            {fileSize ? <><span>·</span><span>{formatBytes(fileSize)}</span></> : null}
            <span>·</span>
            <span className={cn('font-medium', previewable ? 'text-link' : 'text-muted-foreground')}>
              {previewable ? 'Preview' : 'Fayl'}
            </span>
          </span>
        </span>

        <div className="flex shrink-0 items-center gap-1">
          {previewable && (
            <span className="hidden rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground sm:inline">
              Ko‘rish
            </span>
          )}
          <a
            href={url}
            download={resolvedName}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Faylni yuklab olish"
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
      </div>

      <PostDocumentViewer
        open={open}
        onOpenChange={setOpen}
        url={url}
        fileName={resolvedName}
        fileSize={fileSize}
        mimeType={mimeType}
      />
    </>
  );
}

export default PostDocumentViewer;
