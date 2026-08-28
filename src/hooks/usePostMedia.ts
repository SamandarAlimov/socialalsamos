import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db';
import type { MediaKind } from '@/lib/postComposer';

export interface PostMediaItem {
  id: string;
  post_id: string;
  position: number;
  kind: MediaKind;
  storage_url: string;
  thumbnail_url: string | null;
  mime_type: string | null;
  file_name: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  aspect_ratio: string | null;
  alt_text: string | null;
}

/**
 * Post fayllarini `post_media` jadvalidan o'qiydi.
 *
 * Eski kod faqat `posts.media_urls` massiviga tayanardi — unda fayl turi,
 * o'lchami, davomiyligi va tartibi yo'q edi.
 */
export function usePostMedia(postId: string | null, enabled = true) {
  const [media, setMedia] = useState<PostMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(postId) && enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!postId || !enabled) {
      setMedia([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await db
        .from('post_media')
        .select('*')
        .eq('post_id', postId)
        .order('position', { ascending: true });

      if (queryError) throw queryError;
      setMedia((data as PostMediaItem[]) ?? []);
    } catch (loadError) {
      console.error('Post fayllarini yuklashda xatolik:', loadError);
      setError('Fayllarni yuklab bo\u2018lmadi');
      setMedia([]);
    } finally {
      setIsLoading(false);
    }
  }, [postId, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { media, isLoading, error, refresh: load };
}
