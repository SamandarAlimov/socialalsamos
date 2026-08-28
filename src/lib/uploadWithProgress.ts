import { supabase } from '@/integrations/supabase/client';
import { MEDIA_BUCKET, uploadMedia } from '@/lib/mediaUpload';

/**
 * Foizli progress bilan fayl yuklash.
 *
 * `uploadMedia()` Supabase SDK orqali yuklaydi va progress bermaydi — shu
 * sababli Create sahifasida progress bar 0 dan to'g'ridan-to'g'ri 100 ga
 * sakrardi. Bu yerda signed upload URL olinadi va XHR bilan yuklanadi,
 * shuning uchun `onProgress` haqiqiy foizni qaytaradi.
 *
 * Signed URL olinmasa (eski Supabase versiyasi, ruxsat muammosi) avtomatik
 * ravishda `uploadMedia()` ga qaytadi — yuklash to'xtab qolmaydi.
 */

export interface UploadProgressResult {
  url: string;
  key: string;
  name: string;
  size: number;
  type: string;
}

export interface UploadWithProgressOptions {
  /** Mantiqiy tur: post | story | reel | chat | file */
  kind?: string;
  onProgress?: (percent: number) => void;
  /** Yuklashni bekor qilish uchun. */
  signal?: AbortSignal;
}

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

function putWithProgress(
  signedUrl: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl, true);
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('cache-control', '3600');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`Yuklash amalga oshmadi (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Tarmoq xatosi — internetni tekshiring'));
    xhr.ontimeout = () => reject(new Error('Yuklash vaqti tugadi'));

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        reject(new DOMException('Bekor qilindi', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.onabort = () => reject(new DOMException('Bekor qilindi', 'AbortError'));

    xhr.send(file);
  });
}

export async function uploadFileWithProgress(
  file: File,
  options: UploadWithProgressOptions = {},
): Promise<UploadProgressResult> {
  const { kind = 'post', onProgress, signal } = options;
  const contentType = file.type || 'application/octet-stream';

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;

  if (!userId) {
    throw new Error('Sessiya topilmadi — qaytadan tizimga kiring');
  }

  const key = `${userId}/${kind}/${Date.now()}-${randomId()}-${safeFileName(file.name)}`;

  try {
    const { data, error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUploadUrl(key);

    if (error || !data?.signedUrl) {
      throw error ?? new Error('Signed URL olinmadi');
    }

    onProgress?.(1);
    await putWithProgress(data.signedUrl, file, contentType, onProgress, signal);

    const { data: publicData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(key);

    return {
      url: publicData.publicUrl,
      key,
      name: file.name,
      size: file.size,
      type: contentType,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;

    // Signed URL yo'li ishlamadi — eski, ishonchli yo'lga qaytamiz.
    console.warn('Progressli yuklash ishlamadi, uploadMedia() ishlatiladi:', error);

    const uploaded = await uploadMedia(file, { type: kind, visibility: 'public' });
    onProgress?.(100);

    return {
      url: uploaded.url,
      key: uploaded.key,
      name: uploaded.name,
      size: uploaded.size,
      type: uploaded.type,
    };
  }
}
