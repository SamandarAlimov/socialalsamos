import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { searchEmojis } from '@/lib/animatedEmoji';
import {
  builtinPackStickers,
  builtinPacks,
  getLocalFavoriteStickers,
  getLocalRecentStickers,
  pushLocalRecentSticker,
  stickerFromEmoji,
  stickerFromUrl,
  toggleLocalFavoriteSticker,
  type StickerItem,
} from '@/lib/stickers';

export interface StickerPackSummary {
  id: string;
  slug: string;
  name: string;
  iconKey: string | null;
  iconEmoji: string | null;
  isPremium: boolean;
  stickerCount: number;
  source: string;
}

/**
 * Stiker studiyasi uchun yagona ma'lumot manbasi.
 *
 * Uch qatlam:
 *  1. Kodda mavjud animatsion emoji paketlari — doim ishlaydi (offline ham).
 *  2. Bazadagi paketlar (`sticker_packs`) — platforma va foydalanuvchi paketlari.
 *  3. GIPHY — tashqi qidiruv (mavjud `giphy-search` funksiyasi orqali).
 */
export function useStickers() {
  const { user } = useAuth();

  const [dbPacks, setDbPacks] = useState<StickerPackSummary[]>([]);
  const [recents, setRecents] = useState<StickerItem[]>(() => getLocalRecentStickers());
  const [favorites, setFavorites] = useState<StickerItem[]>(() => getLocalFavoriteStickers());

  const packs = useMemo(() => builtinPacks(), []);

  // --- Bazadagi paketlar ---
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await db
          .from('sticker_packs')
          .select('id, slug, name, icon_key, icon_emoji, is_premium, sticker_count, source')
          .order('position', { ascending: true });

        if (error) throw error;
        if (cancelled) return;

        setDbPacks(
          ((data as Record<string, unknown>[]) ?? []).map((row) => ({
            id: String(row.id),
            slug: String(row.slug),
            name: String(row.name),
            iconKey: (row.icon_key as string | null) ?? null,
            iconEmoji: (row.icon_emoji as string | null) ?? null,
            isPremium: Boolean(row.is_premium),
            stickerCount: Number(row.sticker_count ?? 0),
            source: String(row.source ?? 'platform'),
          })),
        );
      } catch (error) {
        // Baza hali migratsiya qilinmagan bo'lishi mumkin — kodli paketlar yetarli.
        console.warn('Stiker paketlarini yuklab bo\u2018lmadi:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // --- Serverdagi oxirgi ishlatilganlar va sevimlilar ---
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const [recentResult, favoriteResult] = await Promise.all([
          db.rpc('top_sticker_recents', { p_limit: 40 }),
          db
            .from('sticker_favorites')
            .select('sticker_key, kind, preview_url, full_url')
            .order('created_at', { ascending: false }),
        ]);

        if (cancelled) return;

        const mapRow = (row: Record<string, unknown>): StickerItem => {
          const key = String(row.sticker_key ?? '');
          const kind = String(row.kind ?? 'image') as StickerItem['kind'];
          if (kind === 'animated_emoji') return stickerFromEmoji(key, 'recent');
          return stickerFromUrl(String(row.full_url ?? key), {
            previewUrl: (row.preview_url as string | null) ?? null,
            kind,
            packId: 'recent',
          });
        };

        const serverRecents = ((recentResult.data as Record<string, unknown>[]) ?? []).map(mapRow);
        const serverFavorites = ((favoriteResult.data as Record<string, unknown>[]) ?? []).map(mapRow);

        // Server ro'yxati ustun, lokal kesh to'ldiruvchi sifatida qoladi.
        if (serverRecents.length > 0) {
          setRecents((local) => {
            const seen = new Set(serverRecents.map((s) => s.key));
            return [...serverRecents, ...local.filter((s) => !seen.has(s.key))].slice(0, 40);
          });
        }
        if (serverFavorites.length > 0) {
          setFavorites((local) => {
            const seen = new Set(serverFavorites.map((s) => s.key));
            return [...serverFavorites, ...local.filter((s) => !seen.has(s.key))];
          });
        }
      } catch (error) {
        console.warn('Stiker tarixini yuklab bo\u2018lmadi:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  /** Paket ichidagi stikerlar. */
  const stickersForPack = useCallback(
    (packId: string): StickerItem[] => {
      const pack = packs.find((p) => p.id === packId);
      return pack ? builtinPackStickers(pack) : [];
    },
    [packs],
  );

  /** Bazadagi paket ichidagi stikerlar (talab bo'lganda yuklanadi). */
  const loadPackStickers = useCallback(async (packId: string): Promise<StickerItem[]> => {
    try {
      const { data, error } = await db
        .from('stickers')
        .select('id, kind, emoji, name, preview_url, full_url, width, height')
        .eq('pack_id', packId)
        .order('position', { ascending: true });

      if (error) throw error;

      return ((data as Record<string, unknown>[]) ?? []).map((row) => {
        const kind = String(row.kind ?? 'image') as StickerItem['kind'];
        if (kind === 'animated_emoji' && row.emoji) {
          return stickerFromEmoji(String(row.emoji), packId);
        }
        return stickerFromUrl(String(row.full_url ?? ''), {
          previewUrl: (row.preview_url as string | null) ?? null,
          kind,
          name: (row.name as string | null) ?? 'Stiker',
          packId,
          stickerId: String(row.id),
          width: (row.width as number | null) ?? null,
          height: (row.height as number | null) ?? null,
        });
      });
    } catch (error) {
      console.warn('Paket stikerlarini yuklab bo\u2018lmadi:', error);
      return [];
    }
  }, []);

  /** Qidiruv: kodli emoji indeksi + bazadagi stikerlar. */
  const search = useCallback(async (query: string): Promise<StickerItem[]> => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const local = searchEmojis(trimmed).map((emoji) => stickerFromEmoji(emoji, 'search'));

    try {
      const { data, error } = await db.rpc('search_stickers', {
        p_query: trimmed,
        p_limit: 60,
      });
      if (error) throw error;

      const remote = ((data as Record<string, unknown>[]) ?? []).map((row) => {
        const kind = String(row.kind ?? 'image') as StickerItem['kind'];
        if (kind === 'animated_emoji' && row.emoji) {
          return stickerFromEmoji(String(row.emoji), 'search');
        }
        return stickerFromUrl(String(row.full_url ?? ''), {
          previewUrl: (row.preview_url as string | null) ?? null,
          kind,
          name: (row.name as string | null) ?? 'Stiker',
          packId: 'search',
          stickerId: (row.id as string | null) ?? null,
        });
      });

      const seen = new Set(local.map((s) => s.key));
      return [...local, ...remote.filter((s) => s.key && !seen.has(s.key))];
    } catch {
      return local;
    }
  }, []);

  /** GIPHY stiker/GIF qidiruvi (mavjud Edge Function orqali). */
  const searchGiphy = useCallback(
    async (query: string, type: 'gifs' | 'stickers'): Promise<StickerItem[]> => {
      try {
        const { data, error } = await supabase.functions.invoke('giphy-search', {
          body: { query, type, limit: 24 },
        });
        if (error) throw error;

        const items = (data?.gifs ?? []) as Array<Record<string, unknown>>;
        return items.map((item) =>
          stickerFromUrl(String(item.url ?? ''), {
            previewUrl: (item.preview as string | null) ?? null,
            kind: type === 'stickers' ? 'image' : 'gif',
            name: (item.title as string | null) ?? 'GIF',
            packId: 'giphy',
            width: (item.width as number | null) ?? null,
            height: (item.height as number | null) ?? null,
          }),
        );
      } catch (error) {
        console.warn('GIPHY qidiruvi ishlamadi:', error);
        return [];
      }
    },
    [],
  );

  /** Stiker tanlanganda chaqiriladi: recent ro'yxati yangilanadi. */
  const markUsed = useCallback(
    (sticker: StickerItem) => {
      setRecents(pushLocalRecentSticker(sticker));

      if (!user) return;
      void db
        .rpc('touch_sticker_recent', {
          p_sticker_key: sticker.key,
          p_kind: sticker.kind,
          p_preview_url: sticker.previewUrl,
          p_full_url: sticker.fullUrl,
          p_sticker_id: sticker.stickerId ?? null,
        })
        .then(({ error }) => {
          if (error) console.warn('Stiker tarixini yozib bo\u2018lmadi:', error);
        });
    },
    [user],
  );

  const isFavorite = useCallback(
    (sticker: StickerItem) => favorites.some((s) => s.key === sticker.key),
    [favorites],
  );

  const toggleFavorite = useCallback(
    (sticker: StickerItem) => {
      const { favorites: next, isFavorite: nowFavorite } = toggleLocalFavoriteSticker(sticker);
      setFavorites(next);

      if (!user) return nowFavorite;

      if (nowFavorite) {
        void db
          .from('sticker_favorites')
          .upsert(
            {
              user_id: user.id,
              sticker_key: sticker.key,
              kind: sticker.kind,
              preview_url: sticker.previewUrl,
              full_url: sticker.fullUrl,
              sticker_id: sticker.stickerId ?? null,
            },
            { onConflict: 'user_id,sticker_key' },
          )
          .then(({ error }) => {
            if (error) console.warn('Sevimliga qo\u2018shib bo\u2018lmadi:', error);
          });
      } else {
        void db
          .from('sticker_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('sticker_key', sticker.key)
          .then(({ error }) => {
            if (error) console.warn('Sevimlidan olib bo\u2018lmadi:', error);
          });
      }

      return nowFavorite;
    },
    [user],
  );

  return {
    packs,
    dbPacks,
    recents,
    favorites,
    stickersForPack,
    loadPackStickers,
    search,
    searchGiphy,
    markUsed,
    isFavorite,
    toggleFavorite,
  };
}
