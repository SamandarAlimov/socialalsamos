export interface AttachmentNameSource {
  media_file_name?: string | null;
  media_url?: string | null;
  metadata?: Record<string, unknown> | null;
}

function cleanCandidate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  return text.replace(/[\r\n\t]+/g, ' ').trim() || null;
}

function basenameFromUrl(value?: string | null): string | null {
  if (!value) return null;

  let path = value;
  try {
    path = value.startsWith('storage://')
      ? value.slice('storage://'.length).split('/').slice(1).join('/')
      : new URL(value).pathname;
  } catch {
    path = value;
  }

  const encoded = path.split('/').filter(Boolean).pop();
  if (!encoded) return null;

  let name = encoded;
  try {
    name = decodeURIComponent(encoded);
  } catch {
    // Keep encoded form if malformed.
  }

  // Our Storage key: <timestamp>-<8 char random id>-<safe original filename>.
  name = name.replace(/^\d{10,}-[a-z0-9]{6,12}-/i, '');
  return /\.[a-z0-9]{1,10}$/i.test(name) ? name : null;
}

/**
 * Cross-client file identity resolver.
 * Priority is the original first-class DB column, then canonical metadata used
 * by Flutter/web, then a best-effort legacy Storage URL recovery.
 */
export function resolveAttachmentFileName(source?: AttachmentNameSource | null): string | null {
  if (!source) return null;
  const metadata = source.metadata || {};

  const candidates = [
    source.media_file_name,
    metadata.file_name,
    metadata.filename,
    metadata.original_file_name,
    metadata.original_name,
    metadata.name,
  ];

  for (const candidate of candidates) {
    const value = cleanCandidate(candidate);
    if (value) return value;
  }

  return basenameFromUrl(source.media_url);
}
