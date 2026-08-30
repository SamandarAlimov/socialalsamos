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
        <DialogContent className="flex h-[88dvh] max-h-[860px] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:w-full">
          <DialogHeader className="shrink-0 border-b border-border/60 bg-background/90 px-5 py-4 backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <StickerIcon className="h-5 w-5" />
              </span>
              <DialogTitle className="text-base">Stikerlar</DialogTitle>
            </div>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="relative flex min-h-[360px] items-center justify-center overflow-hidden bg-black p-4 sm:p-6">
              <div className="relative mx-auto max-h-full max-w-full overflow-hidden rounded-2xl shadow-2xl">
                {previewUrl ? (
                  isVideo ? (
                    <video
                      src={previewUrl}
                      muted
                      loop
                      autoPlay
                      playsInline
                      className="max-h-[68dvh] max-w-full object-contain"
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Tahrirlanayotgan media"
                      className="max-h-[68dvh] max-w-full object-contain"
                    />
                  )
                ) : (
                  <div className="flex aspect-square min-w-[280px] items-center justify-center text-sm text-white/60">
                    Ko‘rib bo‘lmaydigan fayl
                  </div>
                )}

                <StickerLayer placements={placements} onChange={setPlacements} />
              </div>

              <span className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
                {placements.length}/{MAX_STICKERS_PER_MEDIA}
              </span>
            </section>

            <aside className="min-h-0 overflow-y-auto border-t border-border/60 bg-card lg:border-l lg:border-t-0">
              <div className="space-y-4 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold">Stikerlar</h4>
                  </div>

                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    className="h-11 rounded-xl"
                    disabled={placements.length >= MAX_STICKERS_PER_MEDIA}
                    onClick={() => setShowStudio(true)}
                  >
                    <StickerIcon className="mr-2 h-4 w-4" />
                    Stiker tanlash
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl"
                    disabled={placements.length === 0}
                    onClick={() => setPlacements([])}
                  >
                    <Eraser className="mr-2 h-4 w-4" />
                    Tozalash
                  </Button>
                </div>

                <div className="rounded-3xl border border-border/60 bg-background p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">Tanlanganlar</p>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
                      {placements.length}/{MAX_STICKERS_PER_MEDIA}
                    </span>
                  </div>

                  {placements.length === 0 ? (
                    <div className="mt-4 flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted">
                        <StickerIcon className="h-5 w-5" />
                      </span>
                      <p className="text-xs">Hali stiker qo‘yilmagan</p>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {placements.map((placement, index) => (
                        <div
                          key={placement.id}
                          className="flex items-center gap-2 rounded-2xl bg-muted/40 px-3 py-2.5"
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-background text-[10px] font-semibold">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-medium">
                            {placement.sticker.name || placement.sticker.emoji || 'Stiker'}
                          </span>
                          <button
                            type="button"
                            className="text-[10px] text-muted-foreground transition hover:text-destructive"
                            onClick={() =>
                              setPlacements((current) =>
                                current.filter((item) => item.id !== placement.id),
                              )
                            }
                          >
                            O‘chirish
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>


              </div>
            </aside>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-background px-5 py-4">
            <Button
              type="button"
              variant="outline"
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
