/**
 * Yagona stiker modeli.
 *
 * Eski kodda stiker "emoji glifi" degan ma'noni bildirardi — shu sababli GIF,
 * rasm va Lottie stikerlarni bir joyda ko'rsatib bo'lmasdi. Bu yerda barcha
 * turlar bitta `StickerItem` shakliga keltiriladi.
 */

import {
  animatedEmojiCandidates,
  lottieEmojiUrls,
  staticEmojiCandidates,
} from '@/lib/emojiAssets';
import { STICKER_PACKS, type StickerPack } from '@/lib/animatedEmoji';

export type StickerKind = 'animated_emoji' | 'image' | 'gif' | 'lottie' | 'video';

export interface StickerItem {
  /** Barqaror kalit: emoji glifi yoki to'liq URL. */
  key: string;
  kind: StickerKind;
  /** Animatsion emoji bo'lsa glif, aks holda null. */
  emoji: string | null;
  /** Ro'yxatda ko'rsatiladigan yengil manzil. */
  previewUrl: string | null;
  /** Postga qo'yiladigan to'liq sifatli manzil. */
  fullUrl: string | null;
  name: string;
  packId: string;
  /** Bazadagi stiker bo'lsa — statistika uchun. */
  stickerId?: string | null;
  width?: number | null;
  height?: number | null;
}

/** Media ustiga qo'yilgan stiker qatlami (post/story/reel uchun saqlanadi). */
export interface StickerPlacement {
  id: string;
  sticker: StickerItem;
  /** 0..1 oralig'ida nisbiy koordinata — ekran o'lchamiga bog'liq emas. */
  x: number;
  y: number;
  /** Konteyner kengligiga nisbatan o'lcham (0..1). */
  scale: number;
  rotation: number;
  opacity: number;
  /** Qatlam tartibi. */
  z: number;
  /** Story uchun: stiker ko'rinadigan vaqt oynasi (sekund). */
  startSeconds?: number | null;
  endSeconds?: number | null;
}

export const MAX_STICKERS_PER_MEDIA = 20;
export const DEFAULT_STICKER_SCALE = 0.28;

/** Animatsion emojini `StickerItem` ga aylantiradi. */
export function stickerFromEmoji(emoji: string, packId = 'emoji'): StickerItem {
  return {
    key: emoji,
    kind: 'animated_emoji',
    emoji,
    previewUrl: animatedEmojiCandidates(emoji)[0] ?? staticEmojiCandidates(emoji)[0] ?? null,
    fullUrl: lottieEmojiUrls(emoji)[0] ?? null,
    name: emoji,
    packId,
  };
}

/** Tashqi manbadan (GIPHY va h.k.) kelgan stiker. */
export function stickerFromUrl(
  fullUrl: string,
  options: {
    previewUrl?: string | null;
    kind?: StickerKind;
    name?: string;
    packId?: string;
    stickerId?: string | null;
    width?: number | null;
    height?: number | null;
  } = {},
): StickerItem {
  return {
    key: fullUrl,
    kind: options.kind ?? 'gif',
    emoji: null,
    previewUrl: options.previewUrl ?? fullUrl,
    fullUrl,
    name: options.name ?? 'Stiker',
    packId: options.packId ?? 'external',
    stickerId: options.stickerId ?? null,
    width: options.width ?? null,
    height: options.height ?? null,
  };
}

/** Kodda mavjud animatsion emoji paketlari `StickerItem` ko'rinishida. */
export function builtinPackStickers(pack: StickerPack): StickerItem[] {
  return pack.stickers.map((emoji) => stickerFromEmoji(emoji, pack.id));
}

export function builtinPacks(): StickerPack[] {
  return STICKER_PACKS;
}

/**
 * Paket kalitiga mos professional ikonka kaliti (lucide).
 * Emoji ikonkalar o'rniga toza vektor ikonkalar ishlatiladi.
 */
export const PACK_ICON_KEYS: Record<string, string> = {
  reactions: 'thumbs-up',
  emotions: 'smile',
  love: 'heart',
  party: 'party-popper',
  animals: 'paw-print',
  gestures: 'hand',
  food: 'utensils-crossed',
  nature: 'leaf',
};

// ---------------------------------------------------------------------------
// Lokal kesh: internet bo'lmasa ham oxirgi ishlatilganlar ko'rinadi
// ---------------------------------------------------------------------------

const RECENT_KEY = 'alsamos.stickers.recent';
const FAVORITE_KEY = 'alsamos.stickers.favorites';
const RECENT_LIMIT = 40;

function readList(storageKey: string): StickerItem[] {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StickerItem =>
        Boolean(item) && typeof item.key === 'string' && typeof item.kind === 'string',
    );
  } catch {
    return [];
  }
}

function writeList(storageKey: string, items: StickerItem[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {
    // xotira to'lgan bo'lsa e'tiborsiz qoldiramiz
  }
}

export function getLocalRecentStickers(): StickerItem[] {
  return readList(RECENT_KEY).slice(0, RECENT_LIMIT);
}

export function pushLocalRecentSticker(sticker: StickerItem): StickerItem[] {
  const next = [sticker, ...getLocalRecentStickers().filter((s) => s.key !== sticker.key)].slice(
    0,
    RECENT_LIMIT,
  );
  writeList(RECENT_KEY, next);
  return next;
}

export function getLocalFavoriteStickers(): StickerItem[] {
  return readList(FAVORITE_KEY);
}

export function toggleLocalFavoriteSticker(sticker: StickerItem): {
  favorites: StickerItem[];
  isFavorite: boolean;
} {
  const current = getLocalFavoriteStickers();
  const exists = current.some((s) => s.key === sticker.key);
  const favorites = exists
    ? current.filter((s) => s.key !== sticker.key)
    : [sticker, ...current].slice(0, 200);
  writeList(FAVORITE_KEY, favorites);
  return { favorites, isFavorite: !exists };
}

/** Stiker ro'yxatlarini bir xil tartibda solishtirish uchun. */
export function isSameSticker(a: StickerItem | null, b: StickerItem | null): boolean {
  if (!a || !b) return false;
  return a.key === b.key;
}
