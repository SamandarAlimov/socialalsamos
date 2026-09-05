import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db';
import type { MediaKind } from '@/lib/postComposer';
import { resolveStorageUrl } from '@/lib/mediaUpload';
import { inferStoredMediaKind } from '@/lib/mediaRecovery';
import {
  ensureStructuredPostTable,
  isMissingStructuredPostSchemaError,
  writeStructuredPostSchemaCapability,
  writeStructuredPostTableCapability,
} from '@/lib/structuredPostSchema';

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

async function resolvePostMediaUrl(
  value: string,
  bucket: string | null,
  key: string | null,
  label: string,
): Promise<string> {
  try {
    return await resolveStorageUrl(value, bucket, key);
  } catch (resolveError) {
    // Bitta private/legacy obyektni resolve qilishdagi xato butun postning
    // media massivini yo'qotmasligi kerak. Raw URL hali ham ishlashi mumkin.
    console.warn(`${label} resolve failed; raw URL ishlatiladi:`, resolveError);
    return value;
  }
}

/**
 * Post fayllarini `post_media` jadvalidan o'qiydi.
 *
 * Eski kod faqat `posts.media_urls` massiviga tayanardi — unda fayl turi,
 * o'lchami, davomiyligi va tartibi yo'q edi.
 */
export function usePostMedia(postId: string | null, enabled = true) {
  const schemaEnabled = enabled;
  const [media, setMedia] = useState<PostMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(postId) && schemaEnabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!postId || !schemaEnabled) {
      setMedia([]);
      setIsLoading(false);
      return;
    }

    const schemaAvailable = await ensureStructuredPostTable(
      'post_media',
      async () => {
        const { error } = await db.from('post_media').select('id').limit(1);
        return { error };
      },
    );
    if (!schemaAvailable) {
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
      writeStructuredPostSchemaCapability('available');
      writeStructuredPostTableCapability('post_media', 'available');

      const rows = (data ?? []) as PostMediaItem[];
      const resolved = await Promise.all(
        rows.map(async (item) => ({
          ...item,
          // 2026-09-03 legacy backfill ayrim media turlarini faqat
          // posts.media_type bo'yicha yozgan. Fayl/MIME kuchliroq dalil bo'lsa
          // runtime'da kind ni tuzatamiz; DB migration ham shu ma'lumotni repair qiladi.
          kind: inferStoredMediaKind(item),
          storage_url: await resolvePostMediaUrl(
            item.storage_url,
            item.storage_bucket,
            item.storage_key,
            'Post media URL',
          ),
          thumbnail_url: item.thumbnail_url
            ? await resolvePostMediaUrl(
                item.thumbnail_url,
                item.thumbnail_bucket,
                item.thumbnail_key,
                'Post thumbnail URL',
              )
            : null,
        })),
      );

      setMedia(resolved);
    } catch (loadError) {
      if (isMissingStructuredPostSchemaError(loadError)) {
        writeStructuredPostSchemaCapability('missing');
        writeStructuredPostTableCapability('post_media', 'missing');
      } else {
        console.error('Post fayllarini yuklashda xatolik:', loadError);
        setError('Fayllarni yuklab bo\u2018lmadi');
      }
      setMedia([]);
    } finally {
      setIsLoading(false);
    }
  }, [postId, schemaEnabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { media, isLoading, error, refresh: load };
}
