import { useCallback, useEffect, useState } from 'react';
import { Eraser, Layers, Sticker as StickerIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StickerStudio } from '@/components/create/StickerStudio';
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
  const [showStudio, setShowStudio] = useState(false);

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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:w-full">
          <DialogHeader className="shrink-0 border-b border-border px-4 pb-3 pt-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <StickerIcon className="h-4 w-4" />
              </span>
              Stiker qo‘yish
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <div className="relative mx-auto w-full overflow-hidden rounded-2xl bg-black/90">
              {/* Media — tahrir maydonining o‘lchov asosi */}
              {previewUrl ? (
                isVideo ? (
                  <video
                    src={previewUrl}
                    muted
                    loop
                    autoPlay
                    playsInline
                    className="max-h-[52vh] w-full object-contain"
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Tahrirlanayotgan media"
                    className="max-h-[52vh] w-full object-contain"
                  />
                )
              ) : (
                <div className="flex aspect-square w-full items-center justify-center text-sm text-white/60">
                  Ko‘rib bo‘lmaydigan fayl
                </div>
              )}

              {/* Stiker qatlami */}
              <StickerLayer placements={placements} onChange={setPlacements} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5 rounded-xl"
                disabled={placements.length >= MAX_STICKERS_PER_MEDIA}
                onClick={() => setShowStudio(true)}
              >
                <StickerIcon className="h-4 w-4" /> Stiker tanlash
              </Button>

              {placements.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 rounded-xl text-muted-foreground"
                  onClick={() => setPlacements([])}
                >
                  <Eraser className="h-4 w-4" /> Tozalash
                </Button>
              )}

              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                {placements.length}/{MAX_STICKERS_PER_MEDIA}
              </span>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Stikerni surib joylashtiring. O‘ng-past burchakdagi dasta bilan burang va
              o‘lchamini o‘zgartiring, ikki barmoq bilan ham masshtablash ishlaydi.
            </p>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              Bekor qilish
            </Button>
            <Button type="button" className="rounded-xl" onClick={handleSave}>
              Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StickerStudio open={showStudio} onOpenChange={setShowStudio} onSelect={handleAdd} />
    </>
  );
}
