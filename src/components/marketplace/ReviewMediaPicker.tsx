import { useState, type ChangeEvent } from 'react';
import { ImagePlus, Loader2, Play, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  PRODUCT_MEDIA_ACCEPT,
  ProductMediaError,
  type ProductMediaDraft,
  formatMediaDuration,
  prepareProductMedia,
  productMediaErrorMessage,
} from '@/lib/productMedia';
import type { ProductReviewMedia } from '@/hooks/useProductReviews';

export const MAX_REVIEW_MEDIA = 5;
export const MAX_REVIEW_VIDEOS = 1;

interface ReviewMediaPickerProps {
  value: ProductMediaDraft[];
  onChange: (media: ProductMediaDraft[]) => void;
  disabled?: boolean;
}

export function ReviewMediaPicker({ value, onChange, disabled = false }: ReviewMediaPickerProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const videoCount = value.filter(item => item.mediaType === 'video').length;

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || disabled || busy) return;

    setBusy(true);
    let accepted = [...value];

    for (const file of files) {
      if (accepted.length >= MAX_REVIEW_MEDIA) {
        toast({ title: 'Media limiti', description: `Sharhga ko‘pi bilan ${MAX_REVIEW_MEDIA} ta rasm/video qo‘shish mumkin.` });
        break;
      }
      if (file.type.startsWith('video/') && accepted.filter(item => item.mediaType === 'video').length >= MAX_REVIEW_VIDEOS) {
        toast({ title: 'Video limiti', description: 'Sharhga ko‘pi bilan 1 ta video qo‘shish mumkin.' });
        continue;
      }

      try {
        const prepared = await prepareProductMedia(file, accepted);
        accepted = [...accepted, prepared];
        onChange(accepted);
      } catch (error) {
        const description = error instanceof ProductMediaError
          ? productMediaErrorMessage(error.code)
          : 'Media yuklanmadi. Qayta urinib ko‘ring.';
        toast({ title: file.name || 'Media', description, variant: 'destructive' });
      }
    }

    setBusy(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold">Rasm yoki video</p>
        <span className="text-[10px] text-muted-foreground">
          {value.length}/{MAX_REVIEW_MEDIA} · video {videoCount}/{MAX_REVIEW_VIDEOS}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {value.map((item, index) => (
          <div key={`${item.url}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border border-border/40 bg-muted">
            <img
              src={item.mediaType === 'video' ? item.thumbnailUrl || item.url : item.url}
              alt="Sharh mediası"
              className="h-full w-full object-cover"
            />
            {item.mediaType === 'video' && (
              <>
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60">
                    <Play className="h-3.5 w-3.5 fill-white text-white" />
                  </span>
                </span>
                {item.durationSeconds ? (
                  <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 py-0.5 text-[9px] text-white">
                    {formatMediaDuration(item.durationSeconds)}
                  </span>
                ) : null}
              </>
            )}
            <button
              type="button"
              aria-label="Medianı olib tashlash"
              disabled={disabled || busy}
              onClick={() => onChange(value.filter((_, current) => current !== index))}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {value.length < MAX_REVIEW_MEDIA && (
          <label
            className={cn(
              'flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 bg-background text-muted-foreground transition hover:bg-muted/35',
              (disabled || busy) && 'pointer-events-none opacity-55',
            )}
          >
            <input
              className="hidden"
              type="file"
              multiple
              accept={PRODUCT_MEDIA_ACCEPT}
              onChange={handleFiles}
              disabled={disabled || busy}
            />
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span className="mt-1 text-[9px]">Media</span>
          </label>
        )}
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Haqiqiy mahsulot holatini ko‘rsatadigan media sharhni foydaliroq qiladi. Video 60 soniyagacha.
      </p>
    </div>
  );
}

export function ReviewMediaGallery({ media }: { media?: ProductReviewMedia[] | null }) {
  if (!media?.length) return null;

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {media.map(item => (
        <div key={item.id} className="overflow-hidden rounded-xl border border-border/40 bg-muted">
          {item.mediaType === 'video' ? (
            <video
              controls
              preload="metadata"
              playsInline
              poster={item.thumbnailUrl || undefined}
              className="aspect-square h-full w-full bg-black object-cover"
            >
              <source src={item.url} />
            </video>
          ) : (
            <a href={item.url} target="_blank" rel="noreferrer" aria-label="Sharh rasmini ochish">
              <img src={item.url} alt="Sharh rasmi" loading="lazy" className="aspect-square h-full w-full object-cover" />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
