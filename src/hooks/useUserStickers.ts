import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import {
  DAILY_UPLOAD_LIMIT,
  StickerUploadError,
  prepareSticker,
  type PreparedSticker,
} from '@/lib/stickerUpload';
import { stickerFromUrl, type StickerItem } from '@/lib/stickers';

const BUCKET = 'stickers';

export type UploadStage =
  | 'idle'
  | 'reading'
  | 'segmenting'
  | 'trimming'
  | 'encoding'
  | 'uploading'
  | 'saving';

export interface UserSticker {
  id: string;
  stickerItem: StickerItem;
  storagePath: string | null;
  createdAt: string;
}

interface StickerRow {
  id: string;
  pack_id: string;
  kind: string;
  name: string | null;
  preview_url: string | null;
  full_url: string | null;
  storage_path: string | null;
  created_at: string;
}

/**
 * Foydalanuvchining shaxsiy stiker paketi (Bosqich C).
 *
 * Yuklash yo‘li: rasm → `prepareSticker` (fon o‘chirish + 512x512 WebP) →
 * 'stickers' chelagi → `stickers` jadvali. Kvota kunlik cheklovni buzmaslik
 * uchun yuklashdan oldin tekshiriladi.
 */
export function useUserStickers() {
  const { user } = useAuth();
  const [packId, setPackId] = useState<string | null>(null);
  const [stickers, setStickers] = useState<UserSticker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stage, setStage] = useState<UploadStage>('idle');
  const [quotaUsed, setQuotaUsed] = useState(0);

  const mapRow = useCallback((row: StickerRow): UserSticker => {
    const url = row.full_url ?? row.preview_url ?? '';
    const item = stickerFromUrl({
      key: `user:${row.id}`,
      kind: (row.kind as StickerItem['kind']) ?? 'image',
      previewUrl: row.preview_url ?? url,
      fullUrl: url,
      name: row.name ?? 'Stiker',
      packId: row.pack_id,
      stickerId: row.id,
    });

    return {
      id: row.id,
      stickerItem: item,
      storagePath: row.storage_path,
      createdAt: row.created_at,
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setStickers([]);
      setPackId(null);
      return;
    }

    setIsLoading(true);
    try {
      const { data: pack, error: packError } = await db.rpc('ensure_personal_sticker_pack');
      if (packError) throw packError;

      setPackId(pack as string);

      const { data, error } = await db
        .from('stickers')
        .select('id, pack_id, kind, name, preview_url, full_url, storage_path, created_at')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStickers(((data ?? []) as StickerRow[]).map(mapRow));

      const { data: used } = await db.rpc('sticker_upload_quota_used', {
        p_user_id: user.id,
      });
      setQuotaUsed(typeof used === 'number' ? used : 0);
    } catch (error) {
      // Migratsiya hali qo‘llanmagan bo‘lishi mumkin — UI buzilmasligi kerak.
      console.warn('Shaxsiy stikerlarni yuklab bo\u2018lmadi:', error);
      setStickers([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, mapRow]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remainingToday = Math.max(0, DAILY_UPLOAD_LIMIT - quotaUsed);

  /**
   * Rasmni stiker qilib shaxsiy paketga qo‘shadi.
   * Muvaffaqiyatda yangi `StickerItem` qaytadi — uni to‘g‘ridan-to‘g‘ri
   * media ustiga qo‘yish mumkin.
   */
  const upload = useCallback(
    async (file: File, opts: { removeBackground?: boolean; name?: string } = {}) => {
      if (!user) throw new StickerUploadError('Avval tizimga kiring');
      if (remainingToday <= 0) {
        throw new StickerUploadError(
          'Kunlik yuklash chegarasi tugadi. Ertaga davom etishingiz mumkin.',
        );
      }

      let prepared: PreparedSticker;
      try {
        prepared = await prepareSticker(file, {
          removeBackground: opts.removeBackground,
          onStage: (value) => setStage(value),
        });

        setStage('uploading');

        const targetPackId =
          packId ?? ((await db.rpc('ensure_personal_sticker_pack')).data as string);

        const id =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : String(Date.now());

        const basePath = `${user.id}/${id}`;
        const fullPath = `${basePath}.${prepared.extension}`;
        const previewPath = `${basePath}-preview.${prepared.extension}`;

        const uploadOne = async (path: string, blob: Blob) => {
          const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
            contentType: prepared.mimeType,
            cacheControl: '31536000',
            upsert: false,
          });
          if (error) throw error;
        };

        await uploadOne(fullPath, prepared.full);
        await uploadOne(previewPath, prepared.preview);

        const publicUrl = (path: string) =>
          supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

        setStage('saving');

        const { data, error } = await db
          .from('stickers')
          .insert({
            pack_id: targetPackId,
            kind: 'image',
            name: opts.name?.trim() || 'Mening stikerim',
            preview_url: publicUrl(previewPath),
            full_url: publicUrl(fullPath),
            storage_path: fullPath,
            width: prepared.width,
            height: prepared.height,
            file_size: prepared.full.size,
            created_by: user.id,
            is_public: false,
          })
          .select('id, pack_id, kind, name, preview_url, full_url, storage_path, created_at')
          .single();

        if (error) throw error;

        const created = mapRow(data as StickerRow);
        setStickers((prev) => [created, ...prev]);
        setQuotaUsed((prev) => prev + 1);

        return created;
      } finally {
        setStage('idle');
      }
    },
    [user, packId, remainingToday, mapRow],
  );

  /** Stikerni ham jadvaldan, ham chelakdan o‘chiradi. */
  const remove = useCallback(
    async (sticker: UserSticker) => {
      const { error } = await db.from('stickers').delete().eq('id', sticker.id);
      if (error) throw error;

      setStickers((prev) => prev.filter((item) => item.id !== sticker.id));

      if (sticker.storagePath) {
        const previewPath = sticker.storagePath.replace(/\.(webp|png)$/, '-preview.$1');
        // Fayl o‘chmasa ham jadval tozalangan — shuning uchun xato yutiladi.
        await supabase.storage
          .from(BUCKET)
          .remove([sticker.storagePath, previewPath])
          .catch(() => undefined);
      }
    },
    [],
  );

  return {
    packId,
    stickers,
    isLoading,
    stage,
    isBusy: stage !== 'idle',
    quotaUsed,
    remainingToday,
    dailyLimit: DAILY_UPLOAD_LIMIT,
    upload,
    remove,
    refresh,
  };
}
