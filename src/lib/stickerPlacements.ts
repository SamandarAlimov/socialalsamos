import type { StickerItem, StickerPlacement } from '@/lib/stickers';

/**
 * `post_media.edit_state` — generatsiya qilingan Supabase tiplarida hali yo‘q,
 * shuning uchun kengaytirilgan yordamchi tip.
 */
export type WithEditState = {
  id?: string;
  edit_state?: Record<string, unknown> | null;
};

const DEFAULT_SCALE = 0.28;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Saqlangan stiker joylashuvlarini o‘qiydi va tekshiradi.
 *
 * Ma’lumot foydalanuvchi qurilmasidan kelgani uchun ishonchsiz deb qaraladi:
 * har bir maydon alohida tekshiriladi, buzuq element jimgina tashlab
 * yuboriladi — bitta noto‘g‘ri yozuv butun postni yiqitmasligi kerak.
 *
 * Bu funksiya kompozitor, lenta va modal uchun yagona manba: format bir joyda
 * o‘zgarsa, hamma joyda birdan o‘zgaradi.
 */
export function readStickerPlacements(
  editState: Record<string, unknown> | null | undefined,
  idPrefix = 'sticker',
): StickerPlacement[] {
  const raw = editState?.stickers;
  if (!Array.isArray(raw)) return [];

  const placements: StickerPlacement[] = [];

  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const stickerRecord = record.sticker as Record<string, unknown> | undefined;
    if (!stickerRecord || typeof stickerRecord !== 'object') return;

    const key = typeof stickerRecord.key === 'string' ? stickerRecord.key : null;
    if (!key) return;

    const emoji = typeof stickerRecord.emoji === 'string' ? stickerRecord.emoji : null;
    const previewUrl =
      typeof stickerRecord.previewUrl === 'string' ? stickerRecord.previewUrl : null;
    const fullUrl = typeof stickerRecord.fullUrl === 'string' ? stickerRecord.fullUrl : null;

    // Ko‘rsatadigan hech narsasi yo‘q stiker — tashlab yuboriladi.
    if (!emoji && !previewUrl && !fullUrl) return;

    const sticker: StickerItem = {
      key,
      kind: (typeof stickerRecord.kind === 'string'
        ? stickerRecord.kind
        : 'image') as StickerItem['kind'],
      emoji,
      previewUrl,
      fullUrl,
      name: typeof stickerRecord.name === 'string' ? stickerRecord.name : 'Stiker',
      packId: typeof stickerRecord.packId === 'string' ? stickerRecord.packId : 'post',
    };

    placements.push({
      id: typeof record.id === 'string' ? record.id : `${idPrefix}-${index}`,
      sticker,
      x: finiteNumber(record.x, 0.5),
      y: finiteNumber(record.y, 0.5),
      scale: finiteNumber(record.scale, DEFAULT_SCALE),
      rotation: finiteNumber(record.rotation, 0),
      opacity: finiteNumber(record.opacity, 1),
      z: finiteNumber(record.z, index + 1),
      startSeconds:
        typeof record.startSeconds === 'number' ? record.startSeconds : undefined,
      endSeconds: typeof record.endSeconds === 'number' ? record.endSeconds : undefined,
    });
  });

  return placements.sort((a, b) => a.z - b.z);
}

/** Stiker soni — xulosa chiplari va statistikada ishlatiladi. */
export function countStickers(
  editState: Record<string, unknown> | null | undefined,
): number {
  return readStickerPlacements(editState).length;
}
