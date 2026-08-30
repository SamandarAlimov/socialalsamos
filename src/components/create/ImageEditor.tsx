import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Contrast,
  FlipHorizontal,
  FlipVertical,
  Loader2,
  RotateCw,
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
      <DialogContent className="flex max-h-[92dvh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 pb-4 pt-5">
          <DialogTitle>Rasmni tahrirlash</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex min-h-[300px] items-center justify-center bg-black p-4">
            <div
              className="relative max-h-[55dvh] max-w-full overflow-hidden rounded-xl"
              style={previewRatio ? { aspectRatio: String(previewRatio), width: 'min(100%, 520px)' } : undefined}
            >
              <img
                src={attachment.previewUrl}
                alt="Rasm preview"
                className={cn(
                  'max-h-[55dvh] max-w-full',
                  previewRatio ? 'h-full w-full object-cover' : 'object-contain',
                )}
                style={{
                  filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`,
                  transform: `rotate(${rotation}deg) scaleX(${flipHorizontal ? -1 : 1}) scaleY(${flipVertical ? -1 : 1})`,
                }}
              />
            </div>
          </div>

          <div className="space-y-5 p-5">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Format
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {ASPECTS.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant={aspect === item.id ? 'default' : 'outline'}
                    size="sm"
                    className="shrink-0 rounded-xl"
                    onClick={() => setAspect(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => setRotation((value) => (value + 90) % 360)}
              >
                <RotateCw className="mr-2 h-4 w-4" />
                90°
              </Button>
              <Button
                type="button"
                variant={flipHorizontal ? 'default' : 'outline'}
                className="rounded-xl"
                onClick={() => setFlipHorizontal((value) => !value)}
              >
                <FlipHorizontal className="mr-2 h-4 w-4" />
                H
              </Button>
              <Button
                type="button"
                variant={flipVertical ? 'default' : 'outline'}
                className="rounded-xl"
                onClick={() => setFlipVertical((value) => !value)}
              >
                <FlipVertical className="mr-2 h-4 w-4" />
                V
              </Button>
            </div>

            {[
              ['Yorqinlik', brightness, setBrightness, SunMedium],
              ['Kontrast', contrast, setContrast, Contrast],
              ['Rang to‘yinganligi', saturation, setSaturation, SunMedium],
            ].map(([label, value, setter, Icon]) => {
              const ValueSetter = setter as React.Dispatch<React.SetStateAction<number>>;
              const IconComponent = Icon as typeof SunMedium;
              return (
                <div key={String(label)} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <IconComponent className="h-4 w-4 text-muted-foreground" />
                      {String(label)}
                    </span>
                    <span className="text-xs text-muted-foreground">{Number(value)}%</span>
                  </div>
                  <Slider
                    value={[Number(value)]}
                    min={50}
                    max={150}
                    step={1}
                    onValueChange={([next]) => ValueSetter(next)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 px-5 py-4">
          <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            Bekor qilish
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Render va saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
