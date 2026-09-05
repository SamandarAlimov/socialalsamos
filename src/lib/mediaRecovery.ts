import { detectMediaKind, type MediaKind } from '@/lib/postComposer';

export interface StoredMediaKindSource {
  kind?: MediaKind | null;
  storage_url?: string | null;
  storage_key?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
}

function cleanCandidate(value?: string | null): string {
  if (!value) return '';
  return value.split('#', 1)[0].split('?', 1)[0];
}

/**
 * Legacy post_media backfills sometimes copied a generic/wrong `kind` from
 * posts.media_type. Prefer strong MIME / filename / storage-key evidence and
 * only fall back to the stored enum when the object itself is ambiguous.
 */
export function inferStoredMediaKind(source: StoredMediaKindSource): MediaKind {
  const mimeKind = detectMediaKind({ name: '', type: source.mime_type ?? '' });
  if (mimeKind !== 'other') return mimeKind;

  const candidates = [source.file_name, source.storage_key, source.storage_url];
  for (const candidate of candidates) {
    const detected = detectMediaKind({ name: cleanCandidate(candidate), type: '' });
    if (detected !== 'other') return detected;
  }

  return source.kind ?? 'other';
}
