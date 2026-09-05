import { detectMediaKind, type MediaKind } from '@/lib/postComposer';

export interface StoredMediaKindSource {
  kind?: MediaKind | null;
  storage_url?: string | null;
  storage_key?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
}

export interface MediaCandidateGroup {
  position: number;
  kind: MediaKind;
  urls: string[];
}

function cleanCandidate(value?: string | null): string {
  if (!value) return '';
  return value.split('#', 1)[0].split('?', 1)[0];
}

export function uniqueMediaCandidates(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const candidate = value?.trim();
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    result.push(candidate);
  }

  return result;
}

/**
 * Structured `post_media` is metadata, while legacy `posts.media_urls` is also
 * durable user data. A migration/backfill must never make the latter disappear
 * merely because a structured row exists. Merge by logical position and keep
 * every distinct URL as an ordered playback fallback.
 */
export function mergeMediaCandidateGroups(
  primary: MediaCandidateGroup[],
  fallback: MediaCandidateGroup[],
): MediaCandidateGroup[] {
  const merged = new Map<number, MediaCandidateGroup>();

  for (const group of primary) {
    merged.set(group.position, {
      position: group.position,
      kind: group.kind,
      urls: uniqueMediaCandidates(group.urls),
    });
  }

  for (const group of fallback) {
    const existing = merged.get(group.position);
    if (!existing) {
      merged.set(group.position, {
        position: group.position,
        kind: group.kind,
        urls: uniqueMediaCandidates(group.urls),
      });
      continue;
    }

    merged.set(group.position, {
      position: existing.position,
      kind: existing.kind === 'other' ? group.kind : existing.kind,
      urls: uniqueMediaCandidates([...existing.urls, ...group.urls]),
    });
  }

  return Array.from(merged.values()).sort((a, b) => a.position - b.position);
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
