import { StickerStudio } from '@/components/create/StickerStudio';
import { animatedEmojiUrls } from '@/lib/animatedEmoji';
import type { StickerItem } from '@/lib/stickers';

interface StickerPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (sticker: StickerData) => void;
}

/**
 * Eski (mos keluvchi) stiker shakli.
 * Yangi kod `StickerItem` dan foydalanishi kerak.
 */
export interface StickerData {
  id: string;
  /** Emoji glifi yoki fayl manzili. */
  url: string;
  /** Animatsion ko'rinish manzili. */
  animatedUrl: string;
  category: string;
  name: string;
}

function toLegacy(sticker: StickerItem): StickerData {
  const glyph = sticker.emoji ?? sticker.fullUrl ?? sticker.previewUrl ?? '';
  const animated =
    sticker.previewUrl ??
    (sticker.emoji ? animatedEmojiUrls(sticker.emoji)[0] : null) ??
    sticker.fullUrl ??
    '';

  return {
    id: sticker.key,
    url: glyph,
    animatedUrl: animated,
    category: sticker.packId,
    name: sticker.name,
  };
}

/**
 * Eski `StickerPicker` API si saqlangan yupqa qobiq — ichida premium
 * `StickerStudio` ishlaydi. Shu sababli `CreatePage` va boshqa chaqiruvchilar
 * o'zgarishsiz ishlashda davom etadi.
 */
export function StickerPicker({ open, onOpenChange, onSelect }: StickerPickerProps) {
  return (
    <StickerStudio
      open={open}
      onOpenChange={onOpenChange}
      onSelect={(sticker) => onSelect(toLegacy(sticker))}
    />
  );
}
