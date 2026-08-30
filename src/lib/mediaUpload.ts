import { supabase } from '@/integrations/supabase/client';

/**
 * Fayl yuklash (avatar, post, story, chat fayllari).
 *
 * Asosiy yo'l - Supabase Storage: brauzer to'g'ridan to'g'ri Supabase'ga
 * yuklaydi, shuning uchun CORS preflight muammosi bo'lmaydi.
 *
 * Ixtiyoriy: agar `VITE_MEDIA_API_URL` o'rnatilgan bo'lsa (masalan
 * https://api.alsamos.com), avval o'sha presign API sinaladi va u
 * ishlamasa Storage'ga qaytiladi. Shu sababli tashqi API o'chib qolsa ham
 * platformada fayl yuklash to'xtab qolmaydi.
 */

/** Storage bucketlari. Eski public obyektlar `media`da qoladi. */
export const MEDIA_BUCKET = 'media';
export const PRIVATE_MEDIA_BUCKET = 'media-private';

export type MediaVisibility = 'public' | 'friends' | 'private';

export function bucketForMediaVisibility(visibility: MediaVisibility = 'public'): string {
  return visibility === 'public' ? MEDIA_BUCKET : PRIVATE_MEDIA_BUCKET;
}

export function makeStorageReference(bucket: string, key: string): string {
  return `storage://${bucket}/${key}`;
}

export function parseStorageReference(value?: string | null): { bucket: string; key: string } | null {
  if (!value?.startsWith('storage://')) return null;
  const raw = value.slice('storage://'.length);
  const slash = raw.indexOf('/');
  if (slash <= 0 || slash === raw.length - 1) return null;
  return { bucket: raw.slice(0, slash), key: raw.slice(slash + 1) };
}

/** Public URL yoki private signed URL ni ko‘rish vaqtida hosil qiladi. */
export async function resolveStorageUrl(
  value: string,
  bucket?: string | null,
  key?: string | null,
  expiresIn = 3600,
): Promise<string> {
  const parsed = bucket && key ? { bucket, key } : parseStorageReference(value);
  if (!parsed) return value;

  if (parsed.bucket === MEDIA_BUCKET) {
    return supabase.storage.from(parsed.bucket).getPublicUrl(parsed.key).data.publicUrl;
  }

  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.key, expiresIn);

  if (error || !data?.signedUrl) {
    throw error ?? new Error('Private fayl uchun vaqtinchalik havola olinmadi');
  }

  return data.signedUrl;
}

const EXTERNAL_API = String(import.meta.env.VITE_MEDIA_API_URL ?? '').replace(/\/+$/, '');

export interface MediaUploadResult {
  /** Joriy sessiyada preview uchun ochiladigan URL. */
  url: string;
  /** DBga yoziladigan barqaror public URL yoki storage:// reference. */
  storageUrl: string;
  key: string;
  bucket: string;
  type: string;
  name: string;
  size: number;
}

export interface MediaUploadOptions {
  filename?: string;
  /** Mantiqiy tur: avatar | cover | post | story | chat | file */
  type?: string;
  visibility?: MediaVisibility;
}

/** Xatolik matnini foydalanuvchi tushunadigan holatga keltirish */
async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return `${fallback} (${response.status})`;
    try {
      const json = JSON.parse(text) as { error?: string; message?: string };
      return json.error || json.message || `${fallback} (${response.status})`;
    } catch {
      return `${fallback} (${response.status}): ${text.slice(0, 140)}`;
    }
  } catch {
    return `${fallback} (${response.status})`;
  }
}

/** Fayl nomini xavfsiz, ASCII ko'rinishga keltirish (Storage kaliti uchun). */
function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .toLowerCase();
  return cleaned.slice(-80) || 'file';
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

/** Supabase Storage'ga to'g'ridan to'g'ri yuklash. */
async function uploadToStorage(
  file: File | Blob,
  userId: string,
  filename: string,
  contentType: string,
  kind: string,
  visibility: MediaVisibility,
): Promise<MediaUploadResult> {
  const key = `${userId}/${kind}/${Date.now()}-${randomId()}-${safeFileName(filename)}`;
  const bucket = bucketForMediaVisibility(visibility);

  const { error } = await supabase.storage.from(bucket).upload(key, file, {
    contentType,
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    throw new Error(`Faylni saqlash amalga oshmadi: ${error.message}`);
  }

  const storageUrl =
    bucket === MEDIA_BUCKET
      ? supabase.storage.from(bucket).getPublicUrl(key).data.publicUrl
      : makeStorageReference(bucket, key);

  let url = storageUrl;
  if (bucket === PRIVATE_MEDIA_BUCKET) {
    try {
      url = await resolveStorageUrl(storageUrl, bucket, key);
    } catch (signError) {
      console.warn('Private preview URL olinmadi:', signError);
    }
  }

  return {
    url,
    storageUrl,
    key,
    bucket,
    type: contentType,
    name: filename,
    size: file.size,
  };
}

/** Tashqi presign API orqali yuklash (faqat VITE_MEDIA_API_URL bo'lsa). */
async function uploadViaExternalApi(
  file: File | Blob,
  token: string,
  filename: string,
  contentType: string,
  options: MediaUploadOptions
): Promise<MediaUploadResult> {
  const presign = await fetch(`${EXTERNAL_API}/api/media/presign`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename,
      content_type: contentType,
      size: file.size,
      type: options.type || 'file',
      visibility: options.visibility || 'public',
    }),
  });

  if (!presign.ok) {
    throw new Error(await readError(presign, 'Yuklash uchun ruxsat olinmadi'));
  }

  const signed = await presign.json();

  const upload = await fetch(signed.upload_url, {
    method: signed.method || 'PUT',
    headers: signed.headers || { 'Content-Type': contentType },
    body: file,
  });

  if (!upload.ok) {
    throw new Error(await readError(upload, 'Faylni saqlash amalga oshmadi'));
  }

  const externalUrl = signed.public_url || signed.key;
  return {
    url: externalUrl,
    storageUrl: externalUrl,
    key: signed.key,
    bucket: signed.bucket,
    type: contentType,
    name: filename,
    size: file.size,
  };
}

export async function uploadMedia(
  file: File | Blob,
  options: MediaUploadOptions = {}
): Promise<MediaUploadResult> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (!session?.access_token || !session.user?.id) {
    throw new Error('Sessiya topilmadi - qaytadan tizimga kiring');
  }

  const filename = options.filename || (file instanceof File ? file.name : 'upload.bin');
  const contentType = file.type || 'application/octet-stream';
  const kind = options.type || 'file';
  const visibility: MediaVisibility = options.visibility ?? 'public';

  // 1) Tashqi API faqat PUBLIC fayllar uchun ishlatiladi.
  // Private/friends obyektlar doimo RLS boshqaradigan Supabase bucketga ketadi.
  if (EXTERNAL_API && visibility === 'public') {
    try {
      return await uploadViaExternalApi(
        file,
        session.access_token,
        filename,
        contentType,
        options
      );
    } catch (err) {
      // Tashqi server o'chgan yoki CORS bermagan bo'lsa - Storage'ga o'tamiz.
      console.warn('Tashqi media API ishlamadi, Supabase Storage ishlatiladi:', err);
    }
  }

  // 2) Asosiy yo'l: Supabase Storage.
  return uploadToStorage(file, session.user.id, filename, contentType, kind, visibility);
}
