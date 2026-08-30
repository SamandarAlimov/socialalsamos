import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  FileArchive,
  FileText,
  Music2,
  Pencil,
  Play,
  RotateCcw,
  Sticker,
  Trash2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Attachment } from '@/hooks/usePostAttachments';
import { formatBytes, mediaKindLabel } from '@/lib/postComposer';
import { formatDuration } from '@/lib/mediaMetadata';
import { MediaStickerOverlay } from '@/components/stickers/MediaStickerOverlay';

interface PostMediaComposerProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onEditImage?: (attachment: Attachment) => void;
  onEditVideo?: (attachment: Attachment) => void;
  onSticker?: (attachment: Attachment) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

function FileHero({ attachment }: { attachment: Attachment }) {
  const Icon =
    attachment.kind === 'audio'
      ? Music2
      : attachment.kind === 'archive'
        ? FileArchive
        : FileText;

  return (
    <div className="flex min-h-64 w-full flex-col items-center justify-center gap-3 bg-muted/20 px-6 text-center">
      <Icon className="h-10 w-10 text-primary" />
      <div className="max-w-md">
        <p className="break-all text-sm font-semibold">{attachment.file.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {mediaKindLabel(attachment.kind)} · {formatBytes(attachment.file.size)}
          {attachment.kind === 'audio' && attachment.durationSeconds
            ? ' · ' + formatDuration(attachment.durationSeconds)
            : ''}
        </p>
      </div>
    </div>
  );
}

export function PostMediaComposer({
  attachments,
  onRemove,
  onRetry,
  onEditImage,
  onEditVideo,
  onSticker,
  onReorder,
}: PostMediaComposerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    attachments[0]?.id ?? null,
  );

  useEffect(() => {
    if (attachments.length === 0) {
      setSelectedId(null);
      return;
    }

    if (!attachments.some((item) => item.id === selectedId)) {
      setSelectedId(attachments[0].id);
    }
  }, [attachments, selectedId]);

  const active = useMemo(
    () =>
      attachments.find((item) => item.id === selectedId) ??
      attachments[0] ??
      null,
    [attachments, selectedId],
  );

  const activeIndex = active
    ? attachments.findIndex((item) => item.id === active.id)
    : -1;

  if (!active) return null;

  const isBusy = active.status === 'uploading';
  const isError = active.status === 'error';
  const canSticker = active.kind === 'image' || active.kind === 'video';
  const canEditImage = active.kind === 'image' && Boolean(onEditImage);
  const canEditVideo = active.kind === 'video' && Boolean(onEditVideo);

  return (
    <div className="overflow-hidden bg-background lg:h-full">
      <div className="relative flex min-h-64 max-h-[48dvh] lg:max-h-[calc(100dvh-7.5rem)] w-full items-center justify-center overflow-hidden bg-black lg:h-full lg:max-h-none lg:min-h-0">
        {active.kind === 'image' && active.previewUrl ? (
          <div className="relative max-h-[48dvh] lg:max-h-[calc(100dvh-7.5rem)] max-w-full">
            <img
              src={active.previewUrl}
              alt={active.altText || active.file.name}
              className="block max-h-[48dvh] lg:max-h-[calc(100dvh-7.5rem)] max-w-full object-contain"
            />
            <MediaStickerOverlay editState={active.editState ?? null} />
          </div>
        ) : active.kind === 'video' && active.previewUrl ? (
          <div className="relative max-h-[48dvh] lg:max-h-[calc(100dvh-7.5rem)] max-w-full">
            <video
              src={active.previewUrl}
              controls
              playsInline
              preload="metadata"
              className="block max-h-[48dvh] lg:max-h-[calc(100dvh-7.5rem)] max-w-full object-contain"
            />
            <MediaStickerOverlay editState={active.editState ?? null} />
          </div>
        ) : (
          <FileHero attachment={active} />
        )}

        {(active.kind === 'image' || active.kind === 'video') && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/55 p-1 backdrop-blur">
            {(canEditImage || canEditVideo) && (
              <button
                type="button"
                onClick={() =>
                  active.kind === 'image'
                    ? onEditImage?.(active)
                    : onEditVideo?.(active)
                }
                title="Tahrirlash"
                aria-label="Tahrirlash"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white transition hover:bg-white/15"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}

            {canSticker && onSticker && (
              <button
                type="button"
                onClick={() => onSticker(active)}
                title="Stiker"
                aria-label="Stiker"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white transition hover:bg-white/15"
              >
                <Sticker className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onRemove(active.id)}
              title="O‘chirish"
              aria-label="O‘chirish"
              className="flex h-8 w-8 items-center justify-center rounded-full text-white transition hover:bg-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}

        {active.kind === 'video' && active.durationSeconds ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/65 px-2 py-1 text-[10px] text-white">
            {formatDuration(active.durationSeconds)}
          </span>
        ) : null}

        {isBusy && (
          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2">
            <div className="h-1 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white transition-[width]"
                style={{ width: active.progress + '%' }}
              />
            </div>
          </div>
        )}

        {isError && (
          <button
            type="button"
            onClick={() => onRetry(active.id)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-destructive/90 px-6 text-center text-white"
          >
            <AlertCircle className="h-6 w-6" />
            <span className="max-w-sm text-xs">{active.error}</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold">
              <RotateCcw className="h-3.5 w-3.5" />
              Qayta urinish
            </span>
          </button>
        )}
      </div>

      {attachments.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto border-t border-border/50 px-3 py-2 [-webkit-overflow-scrolling:touch]">
          {attachments.map((attachment, index) => (
            <button
              key={attachment.id}
              type="button"
              onClick={() => setSelectedId(attachment.id)}
              className={cn(
                'relative h-14 w-12 shrink-0 overflow-hidden rounded-lg border-2 bg-muted transition',
                attachment.id === active.id
                  ? 'border-primary'
                  : 'border-transparent opacity-65 hover:opacity-100',
              )}
            >
              {attachment.kind === 'image' && attachment.previewUrl ? (
                <img
                  src={attachment.previewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : attachment.kind === 'video' && attachment.previewUrl ? (
                <>
                  <video
                    src={attachment.previewUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                  <Play className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />
                </>
              ) : (
                <FileText className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground" />
              )}
              <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[8px] text-white">
                {index + 1}
              </span>
            </button>
          ))}

          {onReorder && activeIndex >= 0 && (
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={activeIndex === 0}
                onClick={() => onReorder(activeIndex, activeIndex - 1)}
                className="h-8 rounded-full px-2 text-[10px] text-muted-foreground hover:bg-muted disabled:opacity-25"
              >
                ←
              </button>
              <button
                type="button"
                disabled={activeIndex === attachments.length - 1}
                onClick={() => onReorder(activeIndex, activeIndex + 1)}
                className="h-8 rounded-full px-2 text-[10px] text-muted-foreground hover:bg-muted disabled:opacity-25"
              >
                →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
