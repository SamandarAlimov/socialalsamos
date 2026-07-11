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

export async function uploadMedia(
  file: File | Blob,
  options: { filename?: string; type?: string; visibility?: 'public' | 'private' } = {}
): Promise<MediaUploadResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Not authenticated');
  }

  const filename = options.filename || (file instanceof File ? file.name : 'upload.bin');
  const contentType = file.type || 'application/octet-stream';
  const presign = await fetch(`${API_BASE}/api/media/presign`, {
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
    const error = await presign.json().catch(() => ({}));
    throw new Error(error.error || `Upload presign failed (${presign.status})`);
  }

  const signed = await presign.json();
  const upload = await fetch(signed.upload_url, {
    method: signed.method || 'PUT',
    headers: signed.headers || { 'Content-Type': contentType },
    body: file,
  });

  if (!upload.ok) {
    throw new Error(`MinIO upload failed (${upload.status})`);
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
