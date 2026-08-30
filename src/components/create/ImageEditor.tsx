import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Contrast,
  FlipHorizontal,
  FlipVertical,
  Loader2,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  SunMedium,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/hooks/usePostAttachments';

type CropAspect = 'original' | '1:1' | '4:5' | '16:9' | '9:16';

interface ImageEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachment: Attachment | null;
  onSave: (file: File, editState: Record<string, unknown>) => Promise<void> | void;
}

const ASPECTS: Array<{ id: CropAspect; label: string; ratio: number | null }> = [
  { id: 'original', label: 'Original', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Rasmni ochib bo‘lmadi'));
    image.src = url;
  });
}

function targetMime(file: File): { type: string; extension: string; quality?: number } {
  if (file.type === 'image/png') return { type: 'image/png', extension: 'png' };
  if (file.type === 'image/webp') return { type: 'image/webp', extension: 'webp', quality: 0.92 };
  return { type: 'image/jpeg', extension: 'jpg', quality: 0.92 };
}

async function renderImage(
  attachment: Attachment,
  settings: {
    aspect: CropAspect;
    rotation: number;
    flipHorizontal: boolean;
    flipVertical: boolean;
    brightness: number;
    contrast: number;
    saturation: number;
  },
): Promise<File> {
  if (!attachment.previewUrl) throw new Error('Rasm preview topilmadi');

  const image = await loadImage(attachment.previewUrl);
  const aspectEntry = ASPECTS.find((item) => item.id === settings.aspect);
  const desiredFinalRatio = aspectEntry?.ratio ?? image.naturalWidth / image.naturalHeight;
  const rotated = Math.abs(settings.rotation % 180) === 90;
  const sourceRatio = rotated ? 1 / desiredFinalRatio : desiredFinalRatio;

  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;
  const currentRatio = sourceWidth / sourceHeight;

  if (Math.abs(currentRatio - sourceRatio) > 0.001) {
    if (currentRatio > sourceRatio) {
      sourceWidth = sourceHeight * sourceRatio;
      sourceX = (image.naturalWidth - sourceWidth) / 2;
    } else {
      sourceHeight = sourceWidth / sourceRatio;
      sourceY = (image.naturalHeight - sourceHeight) / 2;
    }
  }

  const MAX_DIMENSION = 4096;
  const rawOutputWidth = rotated ? sourceHeight : sourceWidth;
  const rawOutputHeight = rotated ? sourceWidth : sourceHeight;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(rawOutputWidth, rawOutputHeight));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rawOutputWidth * scale));
  canvas.height = Math.max(1, Math.round(rawOutputHeight * scale));

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas ishga tushmadi');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.filter =
    `brightness(${settings.brightness}%) contrast(${settings.contrast}%) saturate(${settings.saturation}%)`;

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((settings.rotation * Math.PI) / 180);
  context.scale(settings.flipHorizontal ? -1 : 1, settings.flipVertical ? -1 : 1);

  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight,
  );

  const output = targetMime(attachment.file);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Rasmni render qilib bo‘lmadi'))),
      output.type,
      output.quality,
    );
  });

  const base = attachment.file.name.replace(/\.[^/.]+$/, '') || 'image';
  return new File([blob], `${base}-edited.${output.extension}`, {
    type: output.type,
    lastModified: Date.now(),
  });
}

export function ImageEditor({
  open,
  onOpenChange,
  attachment,
  onSave,
}: ImageEditorProps) {
  const [aspect, setAspect] = useState<CropAspect>('original');
  const [rotation, setRotation] = useState(0);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const imageState = (attachment?.editState?.image ?? {}) as Record<string, unknown>;
    setAspect((imageState.aspect as CropAspect) ?? 'original');
    setRotation(Number(imageState.rotation ?? 0));
    setFlipHorizontal(Boolean(imageState.flipHorizontal));
    setFlipVertical(Boolean(imageState.flipVertical));
    setBrightness(Number(imageState.brightness ?? 100));
    setContrast(Number(imageState.contrast ?? 100));
    setSaturation(Number(imageState.saturation ?? 100));
  }, [attachment, open]);

  const previewRatio = useMemo(
    () => ASPECTS.find((item) => item.id === aspect)?.ratio ?? undefined,
    [aspect],
  );

  const resetEdits = () => {
    setAspect('original');
    setRotation(0);
    setFlipHorizontal(false);
    setFlipVertical(false);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
  };

  const save = async () => {
    if (!attachment || attachment.kind !== 'image') return;

    setSaving(true);
    try {
      const settings = {
        aspect,
        rotation,
        flipHorizontal,
        flipVertical,
        brightness,
        contrast,
        saturation,
      };
      const file = await renderImage(attachment, settings);
      await onSave(file, {
        ...(attachment.editState ?? {}),
        image: { ...settings, rendered: true, renderedAt: new Date().toISOString() },
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  if (!attachment || attachment.kind !== 'image') return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="flex h-[88dvh] max-h-[880px] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 bg-background/90 px-5 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-base">Rasmni tahrirlash</DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-xl"
              disabled={saving}
              onClick={resetEdits}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Reset
            </Button>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="relative flex min-h-[360px] items-center justify-center overflow-hidden bg-black p-4 sm:p-8">
            <div
              className="relative max-h-full max-w-full overflow-hidden rounded-2xl shadow-2xl"
              style={
                previewRatio
                  ? {
                      aspectRatio: String(previewRatio),
                      width: 'min(100%, 680px)',
                      maxHeight: '66dvh',
                    }
                  : undefined
              }
            >
              <img
                src={attachment.previewUrl}
                alt="Rasm preview"
                className={cn(
                  'max-h-[66dvh] max-w-full transition-transform duration-200',
                  previewRatio ? 'h-full w-full object-cover' : 'object-contain',
                )}
                style={{
                  filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`,
                  transform: `rotate(${rotation}deg) scaleX(${
                    flipHorizontal ? -1 : 1
                  }) scaleY(${flipVertical ? -1 : 1})`,
                }}
              />
            </div>

            <span className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
              {aspect === 'original' ? 'Original' : aspect}
            </span>
          </section>

          <aside className="min-h-0 overflow-y-auto border-t border-border/60 bg-card lg:border-l lg:border-t-0">
            <div className="space-y-5 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold">Format va transform</h4>
                </div>

              </div>

              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Aspect
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {ASPECTS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        'h-10 rounded-xl border text-xs font-medium transition',
                        aspect === item.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/60 bg-background text-muted-foreground hover:bg-muted',
                      )}
                      onClick={() => setAspect(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={() => setRotation((value) => (value + 90) % 360)}
                >
                  <RotateCw className="mr-1.5 h-4 w-4" />
                  90°
                </Button>
                <Button
                  type="button"
                  variant={flipHorizontal ? 'default' : 'outline'}
                  className="h-11 rounded-xl"
                  onClick={() => setFlipHorizontal((value) => !value)}
                >
                  <FlipHorizontal className="mr-1.5 h-4 w-4" />
                  H
                </Button>
                <Button
                  type="button"
                  variant={flipVertical ? 'default' : 'outline'}
                  className="h-11 rounded-xl"
                  onClick={() => setFlipVertical((value) => !value)}
                >
                  <FlipVertical className="mr-1.5 h-4 w-4" />
                  V
                </Button>
              </div>

              <div className="h-px bg-border/60" />

              <h4 className="text-sm font-semibold">Rang</h4>

              {[
                ['Yorqinlik', brightness, setBrightness, SunMedium],
                ['Kontrast', contrast, setContrast, Contrast],
                ['Rang to‘yinganligi', saturation, setSaturation, SunMedium],
              ].map(([label, value, setter, Icon]) => {
                const ValueSetter = setter as React.Dispatch<React.SetStateAction<number>>;
                const IconComponent = Icon as typeof SunMedium;
                return (
                  <div key={String(label)} className="rounded-2xl border border-border/60 bg-background p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-medium">
                        <IconComponent className="h-4 w-4 text-muted-foreground" />
                        {String(label)}
                      </span>
                      <span className="text-muted-foreground">{Number(value)}%</span>
                    </div>
                    <Slider
                      value={[Number(value)]}
                      min={50}
                      max={150}
                      step={1}
                      className="mt-3"
                      onValueChange={([next]) => ValueSetter(next)}
                    />
                  </div>
                );
              })}


            </div>
          </aside>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-background px-5 py-4">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Bekor qilish
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
