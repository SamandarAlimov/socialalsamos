import { supabase } from '@/integrations/supabase/client';

const API_BASE = 'https://api.alsamos.com';

export interface MediaUploadResult {
  url: string;
  key: string;
  bucket: string;
  type: string;
  name: string;
  size: number;
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

export async function uploadMedia(
  file: File | Blob,
  options: { filename?: string; type?: string; visibility?: 'public' | 'private' } = {}
): Promise<MediaUploadResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Sessiya topilmadi - qaytadan tizimga kiring');
  }

  const filename = options.filename || (file instanceof File ? file.name : 'upload.bin');
  const contentType = file.type || 'application/octet-stream';

  let presign: Response;
  try {
    presign = await fetch(`${API_BASE}/api/media/presign`, {
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
  } catch {
    throw new Error('Serverga ulanib bo\u2018lmadi - internetni tekshirib qayta urinib ko\u2018ring');
  }

  if (!presign.ok) {
    throw new Error(await readError(presign, 'Yuklash uchun ruxsat olinmadi'));
  }

  const signed = await presign.json();

  let upload: Response;
  try {
    upload = await fetch(signed.upload_url, {
      method: signed.method || 'PUT',
      headers: signed.headers || { 'Content-Type': contentType },
      body: file,
    });
  } catch {
    throw new Error('Fayl saqlash serveriga yuborilmadi - qayta urinib ko\u2018ring');
  }

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
