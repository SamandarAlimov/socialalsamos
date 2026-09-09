import { db } from '@/lib/db';
import { resolveStorageUrlCandidates } from '@/lib/mediaUpload';
import { inferStoredMediaKind, uniqueMediaCandidates } from '@/lib/mediaRecovery';
import { detectMediaKind } from '@/lib/postComposer';
import { isMissingStructuredPostSchemaError } from '@/lib/structuredPostSchema';

export interface VideoPostMediaSource {
  id: string;
  media_urls?: string[] | null;
  media_type?: string | null;
  post_kind?: string | null;
}

export interface HydratedVideoMedia {
  mediaUrls: string[];
  mediaCandidates: string[];
  posterUrl: string | null;
  posterCandidates: string[];
}

interface StoredPostMediaRow {
  post_id: string;
  position: number | null;
  kind?: 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other' | null;
  storage_url: string | null;
  storage_bucket: string | null;
  storage_key: string | null;
  thumbnail_url: string | null;
  thumbnail_bucket: string | null;
  thumbnail_key: string | null;
  mime_type: string | null;
  file_name: string | null;
}

function cleanUrlForDetection(value?: string | null): string {
  return (value ?? '').split('#', 1)[0].split('?', 1)[0];
}

export function isVideoMediaType(value?: string | null): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return (
    normalized === 'video' ||
    normalized === 'reel' ||
    normalized === 'short' ||
    normalized.startsWith('video/')
  );
}

export function isReelPostKind(value?: string | null): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized === 'reel' || normalized === 'short';
}

export function isVideoLikeUrl(value?: string | null): boolean {
  const clean = cleanUrlForDetection(value);
  if (!clean) return false;
  return detectMediaKind({ name: clean, type: '' }) === 'video';
}

function isImageLikeUrl(value?: string | null): boolean {
  const clean = cleanUrlForDetection(value);
  if (!clean) return false;
  return detectMediaKind({ name: clean, type: '' }) === 'image';
}

export function isPotentialVideoPost(
  post: VideoPostMediaSource,
  structuredRows: StoredPostMediaRow[] = [],
): boolean {
  if (isVideoMediaType(post.media_type) || isReelPostKind(post.post_kind)) return true;
  if ((post.media_urls ?? []).some(isVideoLikeUrl)) return true;
  return structuredRows.some((row) => inferStoredMediaKind(row) === 'video');
}

async function resolveCandidatesSafe(
  value?: string | null,
  bucket?: string | null,
  key?: string | null,
): Promise<string[]> {
  if (!value) return [];

  try {
    const candidates = await resolveStorageUrlCandidates(value, bucket, key);
    return candidates.length > 0 ? candidates : [value];
  } catch (error) {
    console.warn('Video media candidate resolve failed; original reference saqlanadi:', error);
    return [value];
  }
}

async function hydrateOneVideoMedia(
  post: VideoPostMediaSource,
  structuredRows: StoredPostMediaRow[],
): Promise<HydratedVideoMedia | null> {
  const orderedRows = [...structuredRows].sort(
    (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
  );
  const structuredVideo = orderedRows.find(
    (row) => inferStoredMediaKind(row) === 'video' && Boolean(row.storage_url),
  );

  const structuredVideoCandidates = structuredVideo
    ? await resolveCandidatesSafe(
        structuredVideo.storage_url,
        structuredVideo.storage_bucket,
        structuredVideo.storage_key,
      )
    : [];

  const legacyUrls = (post.media_urls ?? []).filter(Boolean);
  const explicitlyVideoLegacyUrls = legacyUrls.filter(isVideoLikeUrl);
  const legacyVideoUrls =
    explicitlyVideoLegacyUrls.length > 0
      ? explicitlyVideoLegacyUrls
      : isVideoMediaType(post.media_type) || isReelPostKind(post.post_kind)
        ? legacyUrls.slice(0, 1)
        : [];

  const resolvedLegacyVideoCandidates = (
    await Promise.all(legacyVideoUrls.map((url) => resolveCandidatesSafe(url)))
  ).flat();

  const mediaCandidates = uniqueMediaCandidates([
    ...structuredVideoCandidates,
    ...resolvedLegacyVideoCandidates,
  ]);

  if (mediaCandidates.length === 0) return null;

  const structuredPosterCandidates = structuredVideo?.thumbnail_url
    ? await resolveCandidatesSafe(
        structuredVideo.thumbnail_url,
        structuredVideo.thumbnail_bucket,
        structuredVideo.thumbnail_key,
      )
    : [];

  // Legacy VideosPage historically treated media_urls[1] as a poster even when
  // it was another video/file. Keep it only when the object is actually image-like.
  const legacyPosterUrl = legacyUrls.find((url) => isImageLikeUrl(url)) ?? null;
  const legacyPosterCandidates = legacyPosterUrl
    ? await resolveCandidatesSafe(legacyPosterUrl)
    : [];
  const posterCandidates = uniqueMediaCandidates([
    ...structuredPosterCandidates,
    ...legacyPosterCandidates,
  ]);
  const posterUrl = posterCandidates[0] ?? null;

  return {
    mediaUrls: posterUrl ? [mediaCandidates[0], posterUrl] : [mediaCandidates[0]],
    mediaCandidates,
    posterUrl,
    posterCandidates,
  };
}

async function loadStructuredMediaRows(postIds: string[]): Promise<StoredPostMediaRow[]> {
  if (postIds.length === 0) return [];

  try {
    const { data, error } = await db
      .from('post_media')
      .select(
        'post_id, position, kind, storage_url, storage_bucket, storage_key, thumbnail_url, thumbnail_bucket, thumbnail_key, mime_type, file_name',
      )
      .in('post_id', postIds)
      .order('position', { ascending: true });

    if (error) {
      if (!isMissingStructuredPostSchemaError(error)) {
        console.warn('Structured video media metadata could not be loaded:', error);
      }
      return [];
    }

    return (data ?? []) as unknown as StoredPostMediaRow[];
  } catch (error) {
    if (!isMissingStructuredPostSchemaError(error)) {
      console.warn('Structured video media metadata could not be loaded:', error);
    }
    return [];
  }
}

/**
 * Videos feed uchun bitta canonical media hydration yo'li.
 *
 * - legacy posts.media_urls va structured post_media birga qo'llanadi;
 * - storage://, eski signed/public Supabase URL va Alsamos media refs resolve qilinadi;
 * - noto'g'ri legacy kind/media_type qiymati fayl MIME/extension dalili bilan tiklanadi;
 * - playback uchun birinchi yaroqli video URL va ordered fallback candidate'lar qaytariladi.
 */
export async function hydratePlayableVideoPosts<
  T extends VideoPostMediaSource & Record<string, unknown>,
>(
  posts: T[],
): Promise<Array<T & {
  media_urls: string[];
  media_candidates: string[];
  poster_url: string | null;
  poster_candidates: string[];
}>> {
  if (posts.length === 0) return [];

  const postIds = Array.from(new Set(posts.map((post) => post.id).filter(Boolean)));
  const mediaRows = await loadStructuredMediaRows(postIds);
  const rowsByPost = new Map<string, StoredPostMediaRow[]>();

  for (const row of mediaRows) {
    const rows = rowsByPost.get(row.post_id) ?? [];
    rows.push(row);
    rowsByPost.set(row.post_id, rows);
  }

  const hydrated = await Promise.all(
    posts.map(async (post) => {
      const structuredRows = rowsByPost.get(post.id) ?? [];
      if (!isPotentialVideoPost(post, structuredRows)) return null;

      const media = await hydrateOneVideoMedia(post, structuredRows);
      if (!media) return null;

      return {
        ...post,
        media_urls: media.mediaUrls,
        media_candidates: media.mediaCandidates,
        poster_url: media.posterUrl,
        poster_candidates: media.posterCandidates,
      };
    }),
  );

  return hydrated.filter((post): post is NonNullable<typeof post> => Boolean(post));
}
