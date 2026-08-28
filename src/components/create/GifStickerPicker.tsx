import { useToast } from '@/hooks/use-toast';
import { StickerStudio } from '@/components/create/StickerStudio';
import type { StickerItem } from '@/lib/stickers';

interface GifStickerPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectGif: (gifUrl: string) => void;
  onSelectSticker: (stickerUrl: string) => void;
}

/**
 * @deprecated Nafaqaga chiqarilgan — `StickerStudio` dan foydalaning.
 *
 * Bu fayl endi mustaqil oyna emas, `StickerStudio` ustidagi yupqa o‘ram.
 * Eski chaqiruvlar (URL qaytaradigan `onSelectGif` / `onSelectSticker`)
 * buzilmasligi uchun saqlab turiladi; yangi kodda `StickerStudio` ni
 * to‘g‘ridan-to‘g‘ri chaqirish kerak, chunki u to‘liq `StickerItem`
 * qaytaradi (emoji, Lottie, video stikerlar ham qo‘llanadi).
 *
 * Nima uchun almashtirildi: eski oynada `ScrollArea` + qat‘iy `h-64`
 * mobilda scroll’ni tutib qolardi, GIF va stikerlar ikki xil oynada edi,
 * oxirgi ishlatilganlar/sevimlilar yo‘q edi va faqat GIPHY manbasi bor edi.
 */
export function GifStickerPicker({
  open,
  onOpenChange,
  onSelectGif,
  onSelectSticker,
}: GifStickerPickerProps) {
  const { toast } = useToast();

  const handleSelect = (sticker: StickerItem) => {
    const url = sticker.fullUrl ?? sticker.previewUrl;

    // Emoji stikerlarning URL manbasi bo‘lmasligi mumkin — eski interfeys
    // faqat URL qabul qiladi, shuning uchun ochiq-oydin xabar beramiz.
    if (!url) {
      toast({
        title: 'Bu stiker eski tanlagichda qo‘llanmaydi',
        description: 'Yangi kompozitorda barcha stiker turlari ishlaydi.',
        variant: 'destructive',
      });
      return;
    }

    if (sticker.kind === 'gif') {
      onSelectGif(url);
    } else {
      onSelectSticker(url);
    }
    onOpenChange(false);
  };

  return <StickerStudio open={open} onOpenChange={onOpenChange} onSelect={handleSelect} />;
}
