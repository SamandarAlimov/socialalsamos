import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  ACCEPTED_STICKER_TYPES,
  StickerUploadError,
  validateStickerFile,
} from '@/lib/stickerUpload';
import type { UploadStage, UserSticker } from '@/hooks/useUserStickers';

interface StickerUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `useUserStickers().upload` — holat studiya bilan bo‘lishilishi uchun props orqali. */
  upload: (
    file: File,
    opts?: { removeBackground?: boolean; name?: string },
  ) => Promise<UserSticker>;
  stage: UploadStage;
  remainingToday: number;
  dailyLimit: number;
  onUploaded?: (sticker: UserSticker) => void;
}

/** Bosqich nomlari — foydalanuvchi nima kutayotganini bilishi kerak. */
const STAGE_LABELS: Record<UploadStage, string> = {
  idle: '',
  reading: 'Rasm o‘qilmoqda...',
  segmenting: 'Fon ajratilmoqda...',
  trimming: 'Chekkalar kesilmoqda...',
  encoding: '512×512 WebP tayyorlanmoqda...',
  uploading: 'Yuklanmoqda...',
  saving: 'Paketga qo‘shilmoqda...',
};

/**
 * Rasmni shaxsiy stikerga aylantirish oynasi (Bosqich C).
 *
 * Og‘ir ishlar (segmentatsiya, kesish, kodlash) `src/lib/stickerUpload.ts` da;
 * bu komponent faqat tanlash, sozlash va holatni ko‘rsatish bilan
 * shug‘ullanadi.
 */
export function StickerUploadDialog({
  open,
  onOpenChange,
  upload,
  stage,
  remainingToday,
  dailyLimit,
  onUploaded,
}: StickerUploadDialogProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeBackground, setRemoveBackground] = useState(true);
  const [name, setName] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const isBusy = stage !== 'idle';

  // Object URL xotirada qolib ketmasligi kerak.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Oyna yopilganda tanlov tozalanadi.
  useEffect(() => {
    if (open) return;
    setFile(null);
    setName('');
    setRemoveBackground(true);
    setIsDragging(false);
  }, [open]);

  const pickFile = useCallback(
    (candidate: File | null | undefined) => {
      if (!candidate) return;
      try {
        validateStickerFile(candidate);
        setFile(candidate);
      } catch (error) {
        toast({
          title:
            error instanceof StickerUploadError
              ? error.message
              : 'Rasmni tanlab bo‘lmadi',
          variant: 'destructive',
        });
      }
    },
    [toast],
  );

  const handleSubmit = useCallback(async () => {
    if (!file || isBusy) return;

    try {
      const created = await upload(file, { removeBackground, name });
      onUploaded?.(created);
      toast({ title: 'Stiker paketingizga qo‘shildi' });
      onOpenChange(false);
    } catch (error) {
      toast({
        title:
          error instanceof StickerUploadError
            ? error.message
            : 'Stikerni yuklab bo‘lmadi',
        variant: 'destructive',
      });
    }
  }, [file, isBusy, upload, removeBackground, name, onUploaded, toast, onOpenChange]);

  const quotaExhausted = remainingToday <= 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (isBusy ? undefined : onOpenChange(next))}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md gap-0 overflow-hidden p-0 sm:w-full">
        <DialogHeader className="space-y-1 border-b border-border bg-gradient-to-b from-primary/[0.07] to-transparent px-4 pb-3 pt-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ImagePlus className="h-4 w-4" />
            </span>
            Stiker yaratish
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Rasm 512×512 o‘lchamga keltiriladi. Bugun {remainingToday} / {dailyLimit} ta
            imkoniyat qoldi.
          </p>
        </DialogHeader>

        <div className="space-y-4 px-4 py-4">
          {/* Tanlash maydoni */}
          <button
            type="button"
            disabled={isBusy}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              pickFile(event.dataTransfer.files?.[0]);
            }}
            className={cn(
              'relative flex h-44 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-colors',
              isDragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30',
              !isBusy && 'hover:border-primary/60',
            )}
          >
            {previewUrl ? (
              <>
                {/* Shaxmat fon — shaffof joylar ko‘rinib turishi uchun */}
                <span
                  aria-hidden
                  className="absolute inset-0 bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%,transparent_75%,hsl(var(--muted))_75%),linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%,transparent_75%,hsl(var(--muted))_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px]"
                />
                <img
                  src={previewUrl}
                  alt="Tanlangan rasm"
                  className="relative max-h-40 max-w-full object-contain"
                />
              </>
            ) : (
              <span className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="h-6 w-6" />
                <span className="text-sm font-medium text-foreground">Rasm tanlang</span>
                <span className="text-xs">PNG, JPEG, WebP, GIF · 12 MB gacha</span>
              </span>
            )}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_STICKER_TYPES.join(',')}
            className="hidden"
            onChange={(event) => {
              pickFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />

          {/* Fonni o‘chirish tugmasi */}
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setRemoveBackground((prev) => !prev)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3 text-left transition hover:border-primary/50"
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
                removeBackground
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {removeBackground ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">Fonni avtomatik o‘chirish</span>
              <span className="block text-xs text-muted-foreground">
                Odam va buyum chetlari ajratiladi · qurilmaning o‘zida bajariladi
              </span>
            </span>
          </button>

          <Input
            value={name}
            disabled={isBusy}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nom (ixtiyoriy)"
            maxLength={40}
            className="h-10 rounded-xl"
          />

          {isBusy && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {STAGE_LABELS[stage]}
            </p>
          )}

          {quotaExhausted && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Kunlik chegara tugadi. Ertaga yana stiker qo‘shishingiz mumkin.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            disabled={isBusy}
            onClick={() => onOpenChange(false)}
          >
            <X className="mr-1.5 h-4 w-4" />
            Bekor
          </Button>
          <Button
            type="button"
            disabled={!file || isBusy || quotaExhausted}
            onClick={handleSubmit}
          >
            {isBusy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="mr-1.5 h-4 w-4" />
            )}
            Qo‘shish
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
