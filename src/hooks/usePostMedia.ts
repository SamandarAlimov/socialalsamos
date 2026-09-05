import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db';
import type { MediaKind } from '@/lib/postComposer';
import { resolveStorageUrlCandidates } from '@/lib/mediaUpload';
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
  storage_candidates?: string[];
  storage_bucket: string | null;
  storage_key: string | null;
  thumbnail_url: string | null;
  thumbnail_candidates?: string[];
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

async function resolvePostMediaCandidates(
  value: string,
  bucket: string | null,
  key: string | null,
  label: string,
): Promise<string[]> {
  try {
    const candidates = await resolveStorageUrlCandidates(value, bucket, key);
    return candidates.length > 0 ? candidates : [value];
  } catch (resolveError) {
    // Bitta private/legacy obyektni resolve qilishdagi xato butun postning
    // media massivini yo'qotmasligi kerak. Original reference saqlanadi.
    console.warn(`${label} resolve failed; original reference saqlanadi:`, resolveError);
    return [value];
  }
}

/**
 * Post fayllarini `post_media` jadvalidan o'qiydi. Structured metadata eski
 * `posts.media_urls` ma'lumotini almashtirmaydi; component darajasida ikkala
 * manba logical position bo'yicha birlashtiriladi.
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
        rows.map(async (item) => {
          const storageCandidates = await resolvePostMediaCandidates(
            item.storage_url,
            item.storage_bucket,
            item.storage_key,
            'Post media URL',
          );
          const thumbnailCandidates = item.thumbnail_url
            ? await resolvePostMediaCandidates(
                item.thumbnail_url,
                item.thumbnail_bucket,
                item.thumbnail_key,
                'Post thumbnail URL',
              )
            : [];

          return {
            ...item,
            // Legacy backfill ayrim media turlarini noto'g'ri kind bilan yozgan.
            kind: inferStoredMediaKind(item),
            storage_url: storageCandidates[0] ?? item.storage_url,
            storage_candidates: storageCandidates,
            thumbnail_url: thumbnailCandidates[0] ?? item.thumbnail_url,
            thumbnail_candidates: thumbnailCandidates,
          };
        }),
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
