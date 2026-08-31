import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { stickerFromUrl, type StickerItem } from '@/lib/stickers';

export interface TrendingSticker {
  sticker: StickerItem;
  recentUses: number;
  totalUses: number;
}

/**
 * Bosqich F: trend stikerlar.
 *
 * Trend oynasi standart holatda 48 soat — sutkalik oyna kechqurun
 * yuklangan stikerni ertalab "o‘lik" qilib qo‘yadi, haftalik oyna esa
 * juda sekin yangilanadi.
 */
export function useStickerTrends(windowHours = 48, limit = 24) {
  const [trending, setTrending] = useState<TrendingSticker[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await db.rpc('trending_stickers', {
        p_limit: limit,
        p_window_hours: windowHours,
      });

      if (error) throw error;

      setTrending(
        ((data ?? []) as Array<Record<string, unknown>>)
          .map((row) => {
            const previewUrl = (row.preview_url as string) ?? '';
            const fullUrl = (row.full_url as string) ?? previewUrl;

            // URL yo‘q yozuvlar — emoji stikerlar; ular trend ro‘yxatida
            // ko‘rsatilmaydi, chunki ko‘rinishi uchun boshqa quvur kerak.
            if (!previewUrl && !fullUrl) return null;

            return {
              sticker: {
                ...stickerFromUrl(fullUrl, {
                  kind: (row.kind as StickerItem['kind']) ?? 'image',
                  previewUrl: previewUrl || fullUrl,
                  name: 'Trend stiker',
                  stickerId: (row.sticker_id as string) ?? undefined,
                }),
                key: String(row.sticker_key ?? row.sticker_id ?? fullUrl),
              },
              recentUses: Number(row.recent_uses ?? 0),
              totalUses: Number(row.total_uses ?? 0),
            };
          })
          .filter((item): item is TrendingSticker => item !== null),
      );
    } catch (error) {
      console.warn('Trend stikerlarni yuklab bo\u2018lmadi:', error);
      setTrending([]);
    } finally {
      setIsLoading(false);
    }
  }, [limit, windowHours]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Stiker ishlatilganini qayd etadi (trend hisobi shundan yig‘iladi). */
  const logUsage = useCallback(async (sticker: StickerItem, context = 'post') => {
    try {
      await db.rpc('log_sticker_usage', {
        p_sticker_key: sticker.key,
        p_sticker_id: sticker.stickerId ?? null,
        p_context: context,
      });
    } catch {
      // Statistika — ikkinchi darajali; xato UI ni buzmasligi kerak.
    }
  }, []);

  return { trending, isLoading, reload: load, logUsage };
}
