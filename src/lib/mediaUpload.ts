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

/** Ommaviy media buckchasi (supabase/migrations/*_media_storage_bucket.sql). */
export const MEDIA_BUCKET = 'media';

const EXTERNAL_API = String(import.meta.env.VITE_MEDIA_API_URL ?? '').replace(/\/+$/, '');

export interface MediaUploadResult {
  url: string;
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
  visibility?: 'public' | 'private';
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
  kind: string
): Promise<MediaUploadResult> {
  const key = `${userId}/${kind}/${Date.now()}-${randomId()}-${safeFileName(filename)}`;

  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(key, file, {
    contentType,
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    throw new Error(`Faylni saqlash amalga oshmadi: ${error.message}`);
  }

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(key);

  return {
    url: data.publicUrl,
    key,
    bucket: MEDIA_BUCKET,
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

  return {
    url: signed.public_url || signed.key,
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

  // 1) Tashqi API faqat aniq sozlangan bo'lsa ishlatiladi.
  if (EXTERNAL_API) {
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
  return uploadToStorage(file, session.user.id, filename, contentType, kind);
}
