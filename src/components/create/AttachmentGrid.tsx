import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  FileArchive,
  FileText,
  Music2,
  Play,
  RotateCcw,
  Scissors,
  Wand2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes, mediaKindLabel, type MediaKind } from '@/lib/postComposer';
import { formatDuration } from '@/lib/mediaMetadata';
import type { Attachment } from '@/hooks/usePostAttachments';

interface AttachmentGridProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** Rasm tahrirlagichini ochish. */
  onEditImage?: (attachment: Attachment) => void;
  /** Video tahrirlagichini ochish. */
  onEditVideo?: (attachment: Attachment) => void;
  className?: string;
}

function KindIcon({ kind }: { kind: MediaKind }) {
  if (kind === 'audio') return <Music2 className="h-7 w-7" />;
  if (kind === 'archive') return <FileArchive className="h-7 w-7" />;
  return <FileText className="h-7 w-7" />;
}

/**
 * Har qanday turdagi fayl uchun preview.
 * Rasm/video — ko'rinish, audio — pleyer, hujjat/arxiv — nom + hajm kartochkasi.
 * Gorizontal scroll mobil qurilmada ham ishlaydi (ilgari kesilib qolardi).
 */
export function AttachmentGrid({
  attachments,
  onRemove,
  onRetry,
  onReorder,
  onEditImage,
  onEditVideo,
  className,
}: AttachmentGridProps) {
  if (attachments.length === 0) return null;

  return (
    <div
      className={cn(
        'flex w-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2',
        '[-webkit-overflow-scrolling:touch] [scrollbar-width:thin]',
        className,
      )}
    >
      {attachments.map((attachment, index) => {
        const isBusy = attachment.status === 'uploading';
        const isError = attachment.status === 'error';

        return (
          <div
            key={attachment.id}
            className={cn(
              'relative flex h-40 w-32 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border bg-muted/40',
              isError ? 'border-destructive' : 'border-border/60',
            )}
          >
            {/* Preview */}
            <div className="relative flex h-full w-full items-center justify-center">
              {attachment.kind === 'image' && attachment.previewUrl ? (
                <img
                  src={attachment.previewUrl}
                  alt={attachment.altText || attachment.file.name}
                  className="h-full w-full object-cover"
                />
              ) : attachment.kind === 'video' && attachment.previewUrl ? (
                <>
                  <video
                    src={attachment.previewUrl}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
                      <Play className="h-4 w-4" />
                    </span>
                  </span>
                  {attachment.durationSeconds ? (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {formatDuration(attachment.durationSeconds)}
                    </span>
                  ) : null}
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-2 text-center text-muted-foreground">
                  <KindIcon kind={attachment.kind} />
                  <p className="line-clamp-2 break-all text-[11px] font-medium text-foreground">
                    {attachment.file.name}
                  </p>
                  <p className="text-[10px]">
                    {mediaKindLabel(attachment.kind)} · {formatBytes(attachment.file.size)}
                    {attachment.kind === 'audio' && attachment.durationSeconds
                      ? ` · ${formatDuration(attachment.durationSeconds)}`
                      : ''}
                  </p>
                </div>
              )}
            </div>

            {/* Yuklash progressi */}
            {isBusy && (
              <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1.5">
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-200"
                    style={{ width: `${attachment.progress}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] font-medium text-white">{attachment.progress}%</p>
              </div>
            )}

            {/* Xatolik */}
            {isError && (
              <button
                type="button"
                onClick={() => onRetry(attachment.id)}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-destructive/85 px-2 text-center text-white"
              >
                <AlertCircle className="h-5 w-5" />
                <span className="line-clamp-3 text-[10px] leading-tight">{attachment.error}</span>
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
                  <RotateCcw className="h-3 w-3" /> Qayta urinish
                </span>
              </button>
            )}

            {/* O'chirish */}
            <button
              type="button"
              onClick={() => onRemove(attachment.id)}
              aria-label="Faylni o'chirish"
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            {/* Tahrirlash tugmalari */}
            {!isBusy && !isError && (
              <div className="absolute left-1.5 top-1.5 flex gap-1">
                {attachment.kind === 'image' && onEditImage && (
                  <button
                    type="button"
                    onClick={() => onEditImage(attachment)}
                    aria-label="Rasmni tahrirlash"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {attachment.kind === 'video' && onEditVideo && (
                  <button
                    type="button"
                    onClick={() => onEditVideo(attachment)}
                    aria-label="Videoni tahrirlash"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                  >
                    <Scissors className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Tartibni o'zgartirish */}
            {onReorder && attachments.length > 1 && !isBusy && (
              <div className="absolute bottom-1.5 left-1.5 flex gap-1">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => onReorder(index, index - 1)}
                  aria-label="Chapga surish"
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white disabled:opacity-30"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={index === attachments.length - 1}
                  onClick={() => onReorder(index, index + 1)}
                  aria-label="O'ngga surish"
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white disabled:opacity-30"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
