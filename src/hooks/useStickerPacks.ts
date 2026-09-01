import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
import { db } from '@/lib/db';
  RecentSticker,
  StickerKind,
  fetchRecentStickers,
  getLocalRecentStickers,
  trackStickerUse,
} from '@/lib/stickerRecents';

export interface StickerPack {
  id: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  isAnimated: boolean;
  stickerCount: number;
  stickers: PackSticker[];
}

export interface PackSticker {
  id: string;
  packId: string;
  fileUrl: string;
  thumbUrl: string | null;
  emoji: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Stiker paketlari va "tez-tez ishlatiladigan stikerlar" bo'limi uchun hook.
 *
 * `sticker_packs` + `stickers` jadvallaridan o'qiydi, `sticker_usage` orqali
 * Telegramdagidek eng ko'p ishlatilgan stikerlarni birinchi qatorga chiqaradi.
 */
export function useStickerPacks(kind: StickerKind = 'sticker') {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [recent, setRecent] = useState<RecentSticker[]>(() => getLocalRecentStickers(kind));
  const [loading, setLoading] = useState(true);

  const loadPacks = useCallback(async () => {
    setLoading(true);
    try {
      // Current canonical sticker schema (20260829000500+).
      const current = await db
        .from('sticker_packs')
        .select(
          'id, slug, name, icon_url, default_kind, sticker_count, stickers(id, pack_id, full_url, preview_url, emoji, width, height, position, kind)'
        )
        .order('position', { ascending: true })
        .limit(24);

      if (!current.error && current.data) {
        const mapped: StickerPack[] = current.data.map((row: Record<string, unknown>) => {
          const rawStickers = Array.isArray(row.stickers)
            ? (row.stickers as Array<Record<string, unknown>>)
            : [];
          const defaultKind = String(row.default_kind ?? 'image');
          return {
            id: String(row.id),
            slug: String(row.slug ?? ''),
            title: String(row.name ?? 'Stikerlar'),
            coverUrl: (row.icon_url as string | null) ?? null,
            isAnimated: ['animated_emoji', 'lottie', 'video'].includes(defaultKind),
            stickerCount: Number(row.sticker_count ?? rawStickers.length),
            stickers: rawStickers
              .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
              .flatMap((sticker) => {
                const fileUrl = String(sticker.full_url ?? sticker.preview_url ?? '').trim();
                if (!fileUrl) return [];
                return [{
                  id: String(sticker.id),
                  packId: String(sticker.pack_id),
                  fileUrl,
                  thumbUrl: (sticker.preview_url as string | null) ?? null,
                  emoji: (sticker.emoji as string | null) ?? null,
                  width: (sticker.width as number | null) ?? null,
                  height: (sticker.height as number | null) ?? null,
                }];
              }),
          };
        });
        setPacks(mapped);
        return;
      }

      // Compatibility for installations still on the original pack schema.
      const legacy = await db
        .from('sticker_packs')
        .select(
          'id, slug, title, cover_url, is_animated, sticker_count, stickers(id, pack_id, file_url, thumb_url, emoji, width, height, position)'
        )
        .order('install_count', { ascending: false })
        .limit(24);

      if (legacy.error || !legacy.data) {
        setPacks([]);
        return;
      }

      setPacks(
        legacy.data.map((row: Record<string, unknown>) => {
          const rawStickers = Array.isArray(row.stickers)
            ? (row.stickers as Array<Record<string, unknown>>)
            : [];
          return {
            id: String(row.id),
            slug: String(row.slug ?? ''),
            title: String(row.title ?? 'Stikerlar'),
            coverUrl: (row.cover_url as string | null) ?? null,
            isAnimated: Boolean(row.is_animated),
            stickerCount: Number(row.sticker_count ?? rawStickers.length),
            stickers: rawStickers
              .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
              .map((sticker) => ({
                id: String(sticker.id),
                packId: String(sticker.pack_id),
                fileUrl: String(sticker.file_url),
                thumbUrl: (sticker.thumb_url as string | null) ?? null,
                emoji: (sticker.emoji as string | null) ?? null,
                width: (sticker.width as number | null) ?? null,
                height: (sticker.height as number | null) ?? null,
              })),
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecent = useCallback(async () => {
    const items = await fetchRecentStickers(kind);
    setRecent(items);
  }, [kind]);

  useEffect(() => {
    void loadPacks();
    void loadRecent();
  }, [loadPacks, loadRecent]);

  /** Stiker/GIF yuborilgandan keyin chaqiriladi - "tez-tez" bo'limi yangilanadi */
  const registerUse = useCallback(
    async (fileUrl: string, useKind: StickerKind = kind, stickerId?: string | null) => {
      await trackStickerUse(fileUrl, useKind, stickerId);
      setRecent(getLocalRecentStickers(useKind));
      void loadRecent();
    },
    [kind, loadRecent]
  );

  return { packs, recent, loading, reload: loadPacks, registerUse };
}

export default useStickerPacks;
