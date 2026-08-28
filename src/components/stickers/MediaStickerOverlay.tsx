import { memo } from 'react';
import { StickerLayer } from '@/components/create/StickerLayer';
import { readStickerPlacements } from '@/lib/stickerPlacements';

interface MediaStickerOverlayProps {
  /** `post_media.edit_state` — stikerlar shu ichida saqlanadi. */
  editState: Record<string, unknown> | null | undefined;
  /** Barqaror `id` prefiksi (React kalitlari uchun). */
  idPrefix?: string;
  className?: string;
}

const noop = () => {};

/**
 * Media ustidagi stikerlarni faqat ko‘rish rejimida chizadi.
 *
 * Muhim: `pointer-events` yo‘q — shuning uchun video boshqaruvi, karusel
 * tugmalari va postni bosish odatdagidek ishlaydi. Koordinatalar nisbiy
 * (0..1) bo‘lgani uchun stiker istalgan o‘lchamdagi ekranda aynan o‘sha
 * joyda turadi.
 *
 * Ota element `relative` bo‘lishi va o‘lchami media bilan bir xil bo‘lishi
 * shart — aks holda stiker siljib ko‘rinadi.
 */
export const MediaStickerOverlay = memo(function MediaStickerOverlay({
  editState,
  idPrefix,
  className,
}: MediaStickerOverlayProps) {
  const placements = readStickerPlacements(editState, idPrefix);
  if (placements.length === 0) return null;

  return (
    <StickerLayer
      placements={placements}
      onChange={noop}
      editable={false}
      className={className}
    />
  );
});
