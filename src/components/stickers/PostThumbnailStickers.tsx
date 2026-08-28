import { usePostMedia } from '@/hooks/usePostMedia';
import { MediaStickerOverlay } from '@/components/stickers/MediaStickerOverlay';
import type { WithEditState } from '@/lib/stickerPlacements';

interface PostThumbnailStickersProps {
  postId: string;
  className?: string;
}

/**
 * Kartochka (grid) ko‘rinishidagi post uchun birinchi rasm/videodagi
 * stikerlarni chizadi.
 *
 * Nima uchun alohida komponent: lentalarda har bir kartochka o‘z
 * so‘rovini yuborishi kerak, hook esa tsikl ichida chaqirilmaydi.
 * Shuning uchun bitta kartochka = bitta komponent = bitta hook.
 *
 * Diqqat: kichik nusxalar `object-cover` bilan kesiladi, shuning uchun
 * stiker joyi taqribiy bo‘ladi. To‘liq aniq joylashuv post sahifasida va
 * modalda ko‘rinadi — bu yerda maqsad postda stiker borligini ko‘rsatish.
 */
export function PostThumbnailStickers({ postId, className }: PostThumbnailStickersProps) {
  const { media } = usePostMedia(postId);

  const first = media.find((item) => item.kind === 'image' || item.kind === 'video');
  if (!first) return null;

  return (
    <MediaStickerOverlay
      editState={(first as typeof first & WithEditState).edit_state}
      idPrefix={first.id}
      className={className}
    />
  );
}
