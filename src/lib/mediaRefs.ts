export const EXTERNAL_MEDIA_BUCKET = 'alsamos-media';
export const EXTERNAL_MEDIA_SCHEME = 'alsamos-media://';

export function makeAlsamosMediaReference(key: string): string {
  const clean = key.replace(/^\/+/, '');
  if (!clean) throw new Error('Media key bo\'sh');
  return `${EXTERNAL_MEDIA_SCHEME}${clean}`;
}

export function parseAlsamosMediaReference(value?: string | null): { key: string } | null {
  if (!value) return null;

  if (value.startsWith(EXTERNAL_MEDIA_SCHEME)) {
    const key = value.slice(EXTERNAL_MEDIA_SCHEME.length).replace(/^\/+/, '');
    return key ? { key } : null;
  }

  // Eski API private upload javobida public_url bo'lmagani uchun DBga ba'zan
  // to'g'ridan-to'g'ri `private/...` object key yozilgan. Uni Supabase `media`
  // bucketi deb noto'g'ri talqin qilmaymiz; server signer orqali ochamiz.
  if (value.startsWith('private/')) {
    return { key: value };
  }

  return null;
}

export function isAlsamosPublicMediaUrl(value?: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'media.alsamos.com';
  } catch {
    return false;
  }
}

export function encodeMediaPath(key: string): string {
  return key
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}
