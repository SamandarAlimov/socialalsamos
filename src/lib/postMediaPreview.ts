import db from '@/lib/supabaseAny';
import {
  isMissingStructuredPostSchemaError,
  readStructuredPostSchemaCapability,
  writeStructuredPostSchemaCapability,
} from '@/lib/structuredPostSchema';

export interface PostMediaPreview {
  postId: string;
  url: string;
  poster: string | null;
  mediaType: 'image' | 'video';
}

/**
 * Search/Notifications kabi compact surface'lar uchun birinchi visual media.
 * N+1 so'rov yo'q: barcha postlar bitta query bilan olinadi.
 */
export async function getStructuredPostMediaPreviewMap(
  postIds: string[],
): Promise<Map<string, PostMediaPreview>> {
  const ids = Array.from(new Set(postIds.filter(Boolean)));
  const previews = new Map<string, PostMediaPreview>();

  if (
    ids.length === 0 ||
    readStructuredPostSchemaCapability() === 'missing'
  ) {
    return previews;
  }

  try {
    const { data, error } = await db
      .from('post_media')
      .select('post_id, position, kind, storage_url, thumbnail_url')
      .in('post_id', ids)
      .in('kind', ['image', 'video'])
      .order('position', { ascending: true });

    if (error) throw error;
    writeStructuredPostSchemaCapability('available');

    for (const row of (data ?? []) as Array<{
      post_id: string;
      position: number;
      kind: string;
      storage_url: string;
      thumbnail_url: string | null;
    }>) {
      if (previews.has(row.post_id) || !row.storage_url) continue;
      previews.set(row.post_id, {
        postId: row.post_id,
        url: row.storage_url,
        poster: row.thumbnail_url,
        mediaType: row.kind === 'video' ? 'video' : 'image',
      });
    }
  } catch (error) {
    if (isMissingStructuredPostSchemaError(error)) {
      writeStructuredPostSchemaCapability('missing');
    } else {
      console.warn('Post media previewlarini yuklab bo‘lmadi:', error);
    }
  }

  return previews;
}
