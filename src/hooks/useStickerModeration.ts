import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { supabase } from '@/integrations/supabase/client';

export interface ModerationItem {
  stickerId: string;
  packId: string;
  packName: string;
  ownerId: string | null;
  previewUrl: string | null;
  fullUrl: string | null;
  nsfwScore: number | null;
  nsfwLabels: Record<string, number> | null;
  reportCount: number;
  submittedAt: string | null;
}

/**
 * Bosqich F: moderatsiya navbati.
 *
 * Ruxsatni baza hal qiladi (`is_sticker_moderator`), shuning uchun hook
 * xatoni jim yutadi va `isModerator = false` qaytaradi — moderator
 * bo‘lmagan foydalanuvchi uchun UI shunchaki ko‘rinmaydi.
 */
export function useStickerModeration() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [isModerator, setIsModerator] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: moderatorFlag } = await db.rpc('is_sticker_moderator');
      const allowed = moderatorFlag === true;
      setIsModerator(allowed);

      if (!allowed) {
        setItems([]);
        return;
      }

      const { data, error } = await db.rpc('pending_sticker_moderation', { p_limit: 100 });
      if (error) throw error;

      setItems(
        ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          stickerId: String(row.sticker_id),
          packId: String(row.pack_id),
          packName: String(row.pack_name ?? ''),
          ownerId: (row.owner_id as string) ?? null,
          previewUrl: (row.preview_url as string) ?? null,
          fullUrl: (row.full_url as string) ?? null,
          nsfwScore: typeof row.nsfw_score === 'number' ? row.nsfw_score : null,
          nsfwLabels: (row.nsfw_labels as Record<string, number>) ?? null,
          reportCount: Number(row.report_count ?? 0),
          submittedAt: (row.submitted_at as string) ?? null,
        })),
      );
    } catch (error) {
      console.warn('Moderatsiya navbatini yuklab bo\u2018lmadi:', error);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = useCallback(async (stickerId: string, approve: boolean, reason?: string) => {
    const { error } = await db.rpc('review_sticker', {
      p_sticker_id: stickerId,
      p_approve: approve,
      p_reason: reason ?? null,
    });
    if (error) throw error;

    // Ro‘yxatdan darhol olib tashlaymiz — navbat tez ishlashi kerak.
    setItems((prev) => prev.filter((item) => item.stickerId !== stickerId));
  }, []);

  /** Yuklangandan keyin majburiy NSFW tekshiruvini ishga tushirish. */
  const requestNsfwCheck = useCallback(async (stickerId: string) => {
    const { error } = await supabase.functions.invoke('sticker-moderation', {
      body: { stickerId },
    });
    if (error) throw error;
  }, []);

  const report = useCallback(async (stickerId: string, reason: string) => {
    const { error } = await db.rpc('report_sticker', {
      p_sticker_id: stickerId,
      p_reason: reason,
    });
    if (error) throw error;
  }, []);

  return { items, isModerator, isLoading, reload: load, review, requestNsfwCheck, report };
}
