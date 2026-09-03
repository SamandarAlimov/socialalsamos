import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign,
  BarChart3,
  Clock,
  Hash,
  HelpCircle,
  Link2,
  ListChecks,
  Loader2,
  MapPin,
  Music2,
  Plus,
  RotateCw,
  SlidersHorizontal,
  Trash2,
  ZoomIn,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { StoryStickerView } from '@/components/stickers/StoryStickerView';
import { useStoryStickers, type StoryStickerDraft } from '@/hooks/useStoryStickers';
import {
  MAX_OPTIONS,
  MAX_OPTION_LENGTH,
  MAX_PROMPT_LENGTH,
  MAX_STORY_STICKERS,
  defaultConfigFor,
  type StorySticker,
  type StoryStickerConfig,
  type StoryStickerType,
} from '@/lib/storyStickers';

/**
 * Bosqich D: story/reel uchun interaktiv stiker kompozitori.
 *
 * Nega “replaceAll”: tahrirlash seansida joylashuv, tartib, konfiguratsiya va
 * vaqt oynasi birgalikda o‘zgaradi — qismli yangilash kod va bazani
 * keraksiz murakkablashtiradi.
 *
 * Koordinatalar 0..1 oralig‘ida saqlanadi, shu sabab bir xil joylashuv
 * telefon, planshet va kuydirilgan videoda mos tushadi.
 */

interface DraftItem extends StoryStickerDraft {
  /** Faqat mahalliy identifikator; bazaga yozilmaydi. */
  localId: string;
}

interface StoryStickerComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  /** Bir nechta medialik postda stiker qaysi mediaga tegishli. */
  mediaId?: string | null;
  /** Orqa fon uchun media (ixtiyoriy). */
  mediaUrl?: string;
  mediaKind?: 'image' | 'video';
  /** Video davomiyligi — vaqt oynasi shunga qarab chegaralanadi. */
  durationSeconds?: number;
  onSaved?: () => void;
}

const TYPE_META: Array<{
  type: StoryStickerType;
  label: string;
  icon: typeof BarChart3;
}> = [
  { type: 'poll', label: 'So‘rovnoma', icon: BarChart3 },
  { type: 'quiz', label: 'Viktorina', icon: ListChecks },
  { type: 'question', label: 'Savol', icon: HelpCircle },
  { type: 'slider', label: 'Slayder', icon: SlidersHorizontal },
  { type: 'location', label: 'Joylashuv', icon: MapPin },
  { type: 'music', label: 'Musiqa', icon: Music2 },
  { type: 'mention', label: 'Mention', icon: AtSign },
  { type: 'hashtag', label: 'Hashtag', icon: Hash },
  { type: 'link', label: 'Havola', icon: Link2 },
  { type: 'countdown', label: 'Sanoq', icon: Clock },
];

function createLocalId(): string {
  return `draft-${Math.random().toString(36).slice(2, 10)}`;
}

/** Bazadagi stikerni tahrirlash uchun qoralamaga aylantiradi. */
function toDraft(sticker: StorySticker): DraftItem {
  return {
    localId: createLocalId(),
    type: sticker.type,
    mediaId: sticker.mediaId,
    x: sticker.x,
    y: sticker.y,
    scale: sticker.scale,
    rotation: sticker.rotation,
    z: sticker.z,
    startSeconds: sticker.startSeconds,
    endSeconds: sticker.endSeconds,
    config: { ...sticker.config },
  };
}

/** Qoralamani ko‘rsatish uchun StorySticker shakliga keltiradi. */
function toPreview(draft: DraftItem, postId: string): StorySticker {
  return {
    id: draft.localId,
    postId,
    mediaId: draft.mediaId ?? null,
    type: draft.type,
    x: draft.x ?? 0.5,
    y: draft.y ?? 0.5,
    scale: draft.scale ?? 0.6,
    rotation: draft.rotation ?? 0,
    z: draft.z ?? 0,
    startSeconds: draft.startSeconds ?? null,
    endSeconds: draft.endSeconds ?? null,
    config: draft.config,
  };
}

export function StoryStickerComposer({
  open,
  onOpenChange,
  postId,
  mediaId = null,
  mediaUrl,
  mediaKind = 'image',
  durationSeconds,
  onSaved,
}: StoryStickerComposerProps) {
  const { toast } = useToast();
  const { stickers, isLoading, replaceAll } = useStoryStickers(postId);

  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ localId: string; offsetX: number; offsetY: number } | null>(null);

  // Dialog ochilganda bazadagi holat qoralamaga ko‘chiriladi.
  useEffect(() => {
    if (!open) return;
    setDrafts(stickers.map(toDraft));
    setActiveId(null);
  }, [open, stickers]);

  const active = useMemo(
    () => drafts.find((draft) => draft.localId === activeId) ?? null,
    [drafts, activeId],
  );

  const patchActive = useCallback(
    (patch: Partial<DraftItem>) => {
      if (!activeId) return;
      setDrafts((prev) =>
        prev.map((draft) => (draft.localId === activeId ? { ...draft, ...patch } : draft)),
      );
    },
    [activeId],
  );

  const patchConfig = useCallback(
    (patch: Partial<StoryStickerConfig>) => {
      if (!activeId) return;
      setDrafts((prev) =>
        prev.map((draft) =>
          draft.localId === activeId
            ? { ...draft, config: { ...draft.config, ...patch } }
            : draft,
        ),
      );
    },
    [activeId],
  );

  const addSticker = useCallback(
    (type: StoryStickerType) => {
      if (drafts.length >= MAX_STORY_STICKERS) {
        toast({
          title: 'Chegara',
          description: `Bir postda ko‘pi bilan ${MAX_STORY_STICKERS} ta stiker bo‘lishi mumkin.`,
          variant: 'destructive',
        });
        return;
      }

      const localId = createLocalId();
      const maxZ = drafts.reduce((acc, draft) => Math.max(acc, draft.z ?? 0), 0);

      setDrafts((prev) => [
        ...prev,
        {
          localId,
          type,
          mediaId,
          // Yangi stiker markazdan bir oz pastda paydo bo‘ladi, shunda
          // ustma-ust tushib qolmaydi.
          x: 0.5,
          y: Math.min(0.8, 0.35 + prev.length * 0.06),
          scale: 0.6,
          rotation: 0,
          z: maxZ + 1,
          startSeconds: null,
          endSeconds: null,
          config: defaultConfigFor(type),
        },
      ]);
      setActiveId(localId);
    },
    [drafts, mediaId, toast],
  );

  const removeActive = useCallback(() => {
    if (!activeId) return;
    setDrafts((prev) => prev.filter((draft) => draft.localId !== activeId));
    setActiveId(null);
  }, [activeId]);

  // —— Surish (drag) ——
  const handlePointerDown = useCallback(
    (event: React.PointerEvent, draft: DraftItem) => {
      event.preventDefault();
      event.stopPropagation();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const currentX = (draft.x ?? 0.5) * rect.width;
      const currentY = (draft.y ?? 0.5) * rect.height;

      dragRef.current = {
        localId: draft.localId,
        offsetX: event.clientX - rect.left - currentX,
        offsetY: event.clientY - rect.top - currentY,
      };
      setActiveId(draft.localId);
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    // Chetga chiqib ketmasligi uchun 0.05..0.95 oralig‘ida ushlab turamiz.
    const x = Math.min(0.95, Math.max(0.05, (event.clientX - rect.left - drag.offsetX) / rect.width));
    const y = Math.min(0.95, Math.max(0.05, (event.clientY - rect.top - drag.offsetY) / rect.height));

    setDrafts((prev) =>
      prev.map((draft) => (draft.localId === drag.localId ? { ...draft, x, y } : draft)),
    );
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const save = useCallback(async () => {
    setIsSaving(true);
    try {
      await replaceAll(
        drafts.map(({ localId, ...draft }) => draft),
      );
      toast({ title: 'Saqlandi', description: 'Stikerlar postga qo‘shildi.' });
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Saqlanmadi',
        description: error instanceof Error ? error.message : 'Qayta urinib ko‘ring.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [drafts, replaceAll, toast, onSaved, onOpenChange]);

  const options = active?.config.options ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Interaktiv stikerlar</DialogTitle>
          <DialogDescription className="sr-only">
            Story ustiga interaktiv stikerlarni joylashtirish va sozlash.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
          {/* Ko‘rish maydoni */}
          <div
            ref={canvasRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={() => setActiveId(null)}
            className="relative mx-auto aspect-[9/16] w-full max-w-[320px] touch-none overflow-hidden rounded-2xl bg-black"
          >
            {mediaUrl ? (
              mediaKind === 'video' ? (
                <video
                  src={mediaUrl}
                  className="absolute inset-0 h-full w-full object-contain"
                  muted
                  playsInline
                  loop
                  autoPlay
                />
              ) : (
                <img
                  src={mediaUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-contain"
                  draggable={false}
                />
              )
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-white/50">
                Media ko‘rinishi mavjud emas
              </div>
            )}

            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            )}

            {drafts.map((draft) => (
              <div
                key={draft.localId}
                onPointerDown={(event) => handlePointerDown(event, draft)}
                className={cn(
                  'absolute cursor-grab active:cursor-grabbing',
                  draft.localId === activeId && 'ring-2 ring-primary ring-offset-1 rounded-xl',
                )}
                style={{
                  left: `${(draft.x ?? 0.5) * 100}%`,
                  top: `${(draft.y ?? 0.5) * 100}%`,
                  width: `${(draft.scale ?? 0.6) * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${draft.rotation ?? 0}deg)`,
                  zIndex: (draft.z ?? 0) + 1,
                }}
              >
                {/* readOnly — tahrirlashda javob berish mumkin emas */}
                <StoryStickerView sticker={toPreview(draft, postId)} readOnly />
              </div>
            ))}
          </div>

          {/* Boshqaruv paneli */}
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Stiker qo‘shish</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TYPE_META.map(({ type, label, icon: Icon }) => (
                  <Button
                    key={type}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addSticker(type)}
                    className="gap-1.5"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </Button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {drafts.length} / {MAX_STORY_STICKERS}
              </p>
            </div>

            {!active ? (
              <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Sozlash uchun stikerni tanlang yoki yangisini qo‘shing.
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {TYPE_META.find((meta) => meta.type === active.type)?.label}
                  </p>
                  <Button size="sm" variant="ghost" onClick={removeActive} className="gap-1.5 text-destructive">
                    <Trash2 className="h-4 w-4" />
                    O‘chirish
                  </Button>
                </div>

                {/* Matnli savol — poll, quiz, slider, question, countdown */}
                {['poll', 'quiz', 'slider', 'question', 'countdown'].includes(active.type) && (
                  <div className="space-y-1">
                    <Label className="text-xs">Sarlavha</Label>
                    <Input
                      value={active.config.prompt ?? ''}
                      maxLength={MAX_PROMPT_LENGTH}
                      onChange={(event) => patchConfig({ prompt: event.target.value })}
                      placeholder="Savol yoki sarlavha"
                    />
                  </div>
                )}

                {/* Variantlar — poll va quiz */}
                {(active.type === 'poll' || active.type === 'quiz') && (
                  <div className="space-y-2">
                    <Label className="text-xs">Variantlar</Label>
                    {options.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={option}
                          maxLength={MAX_OPTION_LENGTH}
                          onChange={(event) => {
                            const next = [...options];
                            next[index] = event.target.value;
                            patchConfig({ options: next });
                          }}
                          placeholder={`Variant ${index + 1}`}
                        />
                        {active.type === 'quiz' && (
                          <Button
                            type="button"
                            size="sm"
                            variant={active.config.correctIndex === index ? 'default' : 'outline'}
                            onClick={() => patchConfig({ correctIndex: index })}
                            title="To‘g‘ri javob"
                          >
                            To‘g‘ri
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            const next = options.filter((_, i) => i !== index);
                            patchConfig({ options: next });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {options.length < MAX_OPTIONS && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => patchConfig({ options: [...options, ''] })}
                        className="gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Variant qo‘shish
                      </Button>
                    )}
                  </div>
                )}

                {/* Slayder */}
                {active.type === 'slider' && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Emoji</Label>
                      <Input
                        value={active.config.emoji ?? ''}
                        maxLength={8}
                        onChange={(event) => patchConfig({ emoji: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Chap yozuv</Label>
                      <Input
                        value={active.config.leftLabel ?? ''}
                        maxLength={MAX_OPTION_LENGTH}
                        onChange={(event) => patchConfig({ leftLabel: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">O‘ng yozuv</Label>
                      <Input
                        value={active.config.rightLabel ?? ''}
                        maxLength={MAX_OPTION_LENGTH}
                        onChange={(event) => patchConfig({ rightLabel: event.target.value })}
                      />
                    </div>
                  </div>
                )}

                {active.type === 'hashtag' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Hashtag</Label>
                    <Input
                      value={active.config.hashtag ?? ''}
                      onChange={(event) =>
                        patchConfig({ hashtag: event.target.value.replace(/^#/, '') })
                      }
                      placeholder="sayohat"
                    />
                  </div>
                )}

                {active.type === 'mention' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Foydalanuvchi nomi</Label>
                    <Input
                      value={active.config.username ?? ''}
                      onChange={(event) =>
                        patchConfig({ username: event.target.value.replace(/^@/, '') })
                      }
                      placeholder="username"
                    />
                  </div>
                )}

                {active.type === 'link' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Havola</Label>
                    <Input
                      value={active.config.url ?? ''}
                      onChange={(event) => patchConfig({ url: event.target.value })}
                      placeholder="example.com/sahifa"
                    />
                  </div>
                )}

                {active.type === 'music' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Trek nomi</Label>
                      <Input
                        value={active.config.trackTitle ?? ''}
                        onChange={(event) =>
                          patchConfig({
                            trackTitle: event.target.value,
                            // Musiqa katalogi ulanmaguncha nom identifikator
                            // vazifasini bajaradi, aks holda tekshiruv yiqiladi.
                            trackId: active.config.trackId ?? event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ijrochi</Label>
                      <Input
                        value={active.config.trackArtist ?? ''}
                        onChange={(event) => patchConfig({ trackArtist: event.target.value })}
                      />
                    </div>
                  </div>
                )}

                {active.type === 'location' && (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Joy nomi</Label>
                      <Input
                        value={active.config.placeName ?? ''}
                        onChange={(event) => patchConfig({ placeName: event.target.value })}
                        placeholder="Masalan: Chorsu bozori"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Kenglik</Label>
                        <Input
                          type="number"
                          step="0.000001"
                          value={active.config.latitude ?? ''}
                          onChange={(event) =>
                            patchConfig({
                              latitude: event.target.value === '' ? undefined : Number(event.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Uzunlik</Label>
                        <Input
                          type="number"
                          step="0.000001"
                          value={active.config.longitude ?? ''}
                          onChange={(event) =>
                            patchConfig({
                              longitude: event.target.value === '' ? undefined : Number(event.target.value),
                            })
                          }
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => {
                        if (!navigator.geolocation) {
                          toast({
                            title: 'Qurilma qo‘llamaydi',
                            description: 'Joylashuvni qo‘lda kiriting.',
                            variant: 'destructive',
                          });
                          return;
                        }
                        navigator.geolocation.getCurrentPosition(
                          (position) =>
                            patchConfig({
                              latitude: position.coords.latitude,
                              longitude: position.coords.longitude,
                            }),
                          () =>
                            toast({
                              title: 'Joylashuv olinmadi',
                              description: 'Ruxsatni tekshirib ko‘ring.',
                              variant: 'destructive',
                            }),
                        );
                      }}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      Joriy joylashuvni olish
                    </Button>
                  </div>
                )}

                {active.type === 'countdown' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Tugash vaqti</Label>
                    <Input
                      type="datetime-local"
                      value={
                        active.config.endsAt
                          ? new Date(active.config.endsAt).toISOString().slice(0, 16)
                          : ''
                      }
                      onChange={(event) =>
                        patchConfig({
                          endsAt: event.target.value
                            ? new Date(event.target.value).toISOString()
                            : undefined,
                        })
                      }
                    />
                  </div>
                )}

                {/* O‘lcham, burilish, qatlam */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1 text-xs">
                      <ZoomIn className="h-3.5 w-3.5" />
                      O‘lcham
                    </Label>
                    <input
                      type="range"
                      min={0.25}
                      max={0.95}
                      step={0.01}
                      value={active.scale ?? 0.6}
                      onChange={(event) => patchActive({ scale: Number(event.target.value) })}
                      className="w-full accent-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1 text-xs">
                      <RotateCw className="h-3.5 w-3.5" />
                      Burilish
                    </Label>
                    <input
                      type="range"
                      min={-45}
                      max={45}
                      step={1}
                      value={active.rotation ?? 0}
                      onChange={(event) => patchActive({ rotation: Number(event.target.value) })}
                      className="w-full accent-primary"
                    />
                  </div>
                </div>

                {/* Reel uchun ko‘rinish oynasi */}
                {mediaKind === 'video' && (
                  <div className="space-y-2 rounded-lg bg-muted/50 p-2">
                    <Label className="text-xs">
                      Ko‘rinish oynasi (sekund)
                      {durationSeconds ? ` — video ${Math.round(durationSeconds)}s` : ''}
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        placeholder="boshlanishi"
                        value={active.startSeconds ?? ''}
                        onChange={(event) =>
                          patchActive({
                            startSeconds: event.target.value === '' ? null : Number(event.target.value),
                          })
                        }
                      />
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        placeholder="tugashi"
                        value={active.endSeconds ?? ''}
                        onChange={(event) =>
                          patchActive({
                            endSeconds: event.target.value === '' ? null : Number(event.target.value),
                          })
                        }
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Bo‘sh qoldirilsa stiker butun video davomida ko‘rinadi.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Bekor qilish
          </Button>
          <Button onClick={() => void save()} disabled={isSaving} className="gap-1.5">
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
