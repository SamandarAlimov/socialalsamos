import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import {
  MAX_STORY_STICKERS,
  parseStoryStickers,
  validateSticker,
  type StorySticker,
  type StoryStickerConfig,
  type StoryStickerResults,
  type StoryStickerType,
} from '@/lib/storyStickers';

export interface StoryStickerDraft {
  type: StoryStickerType;
  mediaId?: string | null;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  z?: number;
  startSeconds?: number | null;
  endSeconds?: number | null;
  config: StoryStickerConfig;
}

/**
 * Bosqich D: postning interaktiv stikerlarini o‘qish, saqlash va ularga
 * javob berish.
 *
 * Yozish huquqini baza (RLS) hal qiladi — hook faqat qulaylik qatlami.
 */
export function useStoryStickers(postId?: string) {
  const { user } = useAuth();

  const [stickers, setStickers] = useState<StorySticker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Record<string, StoryStickerResults>>({});

  const load = useCallback(async () => {
    if (!postId) {
      setStickers([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await db
        .from('story_stickers')
        .select('*')
        .eq('post_id', postId)
        .order('z', { ascending: true });

      if (error) throw error;
      setStickers(parseStoryStickers(data));
    } catch (error) {
      console.warn('Story stikerlarini yuklab bo\u2018lmadi:', error);
      setStickers([]);
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Post egasi uchun: stikerlar to‘plamini butunlay almashtiradi.
   * Qismli yangilash o‘rniga almashtirish tanlandi, chunki tahrirlash
   * seansida joylashuv, tartib va vaqt oynasi birgalikda o‘zgaradi.
   */
  const replaceAll = useCallback(
    async (drafts: StoryStickerDraft[]) => {
      if (!postId || !user) throw new Error('Avtorizatsiya talab qilinadi');

      const limited = drafts.slice(0, MAX_STORY_STICKERS);

      for (const draft of limited) {
        const problem = validateSticker(draft);
        if (problem) throw new Error(problem);
      }

      const { error: deleteError } = await db
        .from('story_stickers')
        .delete()
        .eq('post_id', postId);

      if (deleteError) throw deleteError;

      if (limited.length === 0) {
        setStickers([]);
        return;
      }

      const rows = limited.map((draft, index) => ({
        post_id: postId,
        media_id: draft.mediaId ?? null,
        type: draft.type,
        x: draft.x ?? 0.5,
        y: draft.y ?? 0.5,
        scale: draft.scale ?? 0.6,
        rotation: draft.rotation ?? 0,
        z: draft.z ?? index,
        start_seconds: draft.startSeconds ?? null,
        end_seconds: draft.endSeconds ?? null,
        config: draft.config,
        created_by: user.id,
      }));

      const { data, error } = await db.from('story_stickers').insert(rows).select('*');
      if (error) throw error;

      setStickers(parseStoryStickers(data));
    },
    [postId, user],
  );

  const fetchResults = useCallback(async (stickerId: string) => {
    const { data, error } = await db.rpc('story_sticker_results', { p_sticker_id: stickerId });
    if (error) throw error;

    const parsed = (data ?? null) as StoryStickerResults | null;
    if (parsed) {
      setResults((prev) => ({ ...prev, [stickerId]: parsed }));
    }
    return parsed;
  }, []);

  const respond = useCallback(
    async (
      stickerId: string,
      answer: { optionIndex?: number; value?: number; text?: string },
    ) => {
      if (!user) throw new Error('Avtorizatsiya talab qilinadi');

      const { error } = await db.rpc('respond_story_sticker', {
        p_sticker_id: stickerId,
        p_option_index: answer.optionIndex ?? null,
        p_numeric_value: answer.value ?? null,
        p_text_answer: answer.text ?? null,
      });

      if (error) throw error;

      // Javobdan keyin natija darhol yangilanadi.
      await fetchResults(stickerId);
    },
    [user, fetchResults],
  );

  // Reel uchun: media bo‘yicha guruhlash qulay bo‘lsin.
  const byMedia = useMemo(() => {
    const map = new Map<string, StorySticker[]>();
    stickers.forEach((sticker) => {
      const key = sticker.mediaId ?? '__post__';
      const list = map.get(key) ?? [];
      list.push(sticker);
      map.set(key, list);
    });
    return map;
  }, [stickers]);

  return {
    stickers,
    byMedia,
    isLoading,
    results,
    reload: load,
    replaceAll,
    respond,
    fetchResults,
  };
}
