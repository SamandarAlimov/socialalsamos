import { useCallback, useEffect, useState } from 'react';
import { Eraser, Sticker as StickerIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InlineStickerTray } from '@/components/create/InlineStickerTray';
import { StickerLayer, createPlacement } from '@/components/create/StickerLayer';
import { MAX_STICKERS_PER_MEDIA, type StickerPlacement } from '@/lib/stickers';
import type { Attachment } from '@/hooks/usePostAttachments';

interface StickerMediaEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachment: Attachment | null;
  initialPlacements: StickerPlacement[];
  onSave: (placements: StickerPlacement[]) => void;
}

/**
 * Rasm yoki video ustiga stiker qo‘yish oynasi.
 *
 * Stikerlar faylning o‘ziga hozircha “kuydirilmaydi” — nisbiy koordinatalar
 * `post_media.edit_state.stickers` ichida saqlanadi va ko‘rsatishda aynan shu
 * joyda chiziladi. Videoga kuydirish keyingi bosqichda (ADR-001 quvuri) qo‘shiladi.
 */
export function StickerMediaEditor({
  open,
  onOpenChange,
  attachment,
  initialPlacements,
  onSave,
}: StickerMediaEditorProps) {
  const [placements, setPlacements] = useState<StickerPlacement[]>(initialPlacements);

  // Oyna har ochilganda joriy holatdan boshlanadi
  useEffect(() => {
    if (open) setPlacements(initialPlacements);
  }, [open, initialPlacements]);

  const handleAdd = useCallback(
    (sticker: Parameters<typeof createPlacement>[0]) => {
      setPlacements((current) => {
        const placement = createPlacement(sticker, current);
        return placement ? [...current, placement] : current;
      });
    },
    [],
  );

  const handleSave = useCallback(() => {
    onSave(placements);
    onOpenChange(false);
  }, [onSave, onOpenChange, placements]);

  const isVideo = attachment?.kind === 'video';
  const previewUrl = attachment?.previewUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88dvh] max-h-[860px] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:w-full">
        <DialogHeader className="shrink-0 border-b border-border/60 bg-background px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <StickerIcon className="h-4 w-4 text-primary" />
            <DialogTitle className="text-base">Stikerlar</DialogTitle>
            <DialogDescription className="sr-only">
              Media ustiga stikerlarni qo‘shish va tahrirlash.
            </DialogDescription>
            <span className="ml-auto text-xs text-muted-foreground">
              {placements.length}/{MAX_STICKERS_PER_MEDIA}
            </span>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="relative flex min-h-[320px] items-center justify-center overflow-hidden bg-black p-3 sm:p-5">
            <div className="relative mx-auto max-h-full max-w-full overflow-visible">
              {previewUrl ? (
                isVideo ? (
                  <video
                    src={previewUrl}
                    muted
                    loop
                    autoPlay
                    playsInline
                    className="block max-h-[62dvh] max-w-full rounded-lg object-contain"
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt=""
                    className="block max-h-[62dvh] max-w-full rounded-lg object-contain"
                  />
                )
              ) : (
                <div className="flex aspect-square min-w-[280px] items-center justify-center text-sm text-white/60">
                  Ko‘rib bo‘lmaydi
                </div>
              )}

              <StickerLayer placements={placements} onChange={setPlacements} />
            </div>
          </section>

          <aside className="min-h-0 overflow-y-auto border-t border-border/60 bg-background p-3 lg:border-l lg:border-t-0">
            <InlineStickerTray
              onSelect={handleAdd}
              disabled={placements.length >= MAX_STICKERS_PER_MEDIA}
            />

            {placements.length > 0 && (
              <button
                type="button"
                onClick={() => setPlacements([])}
                className="mt-3 flex h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >
                <Eraser className="h-4 w-4" />
                Tozalash
              </button>
            )}
          </aside>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-background px-4 py-3 sm:px-5">
          <Button
            type="button"
            variant="ghost"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
          >
            Bekor
          </Button>
          <Button type="button" className="rounded-full px-5" onClick={handleSave}>
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
