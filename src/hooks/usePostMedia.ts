import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db';
import type { MediaKind } from '@/lib/postComposer';
import { resolveStorageUrl } from '@/lib/mediaUpload';

export interface PostMediaItem {
  id: string;
  post_id: string;
  position: number;
  kind: MediaKind;
  storage_url: string;
  storage_bucket: string | null;
  storage_key: string | null;
  thumbnail_url: string | null;
  thumbnail_bucket: string | null;
  thumbnail_key: string | null;
  mime_type: string | null;
  file_name: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  aspect_ratio: string | null;
  alt_text: string | null;
  edit_state: Record<string, unknown> | null;
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

      const rows = ((data ?? []) as PostMediaItem[]);
      const resolved = await Promise.all(
        rows.map(async (item) => ({
          ...item,
          storage_url: await resolveStorageUrl(
            item.storage_url,
            item.storage_bucket,
            item.storage_key,
          ),
          thumbnail_url: item.thumbnail_url
            ? await resolveStorageUrl(
                item.thumbnail_url,
                item.thumbnail_bucket,
                item.thumbnail_key,
              )
            : null,
        })),
      );

      setMedia(resolved);
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
