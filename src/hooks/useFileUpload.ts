import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { uploadMedia } from '@/lib/mediaUpload';

interface UploadResult {
  url: string;
  /** Faylning MIME turi, masalan image/jpeg */
  type: string;
  name: string;
  size: number;
  /** Chatda ishlatiladigan tur: image | video | audio | document */
  kind: 'image' | 'video' | 'audio' | 'document';
}

export type UploadKind = UploadResult['kind'];

function detectKind(mimeType: string, fileName?: string): UploadKind {
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';

  // Ba'zi brauzerlar MIME turini bo'sh qoldiradi - kengaytma bo'yicha aniqlaymiz
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp'].includes(ext))
    return 'image';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', '3gp'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'].includes(ext)) return 'audio';
  return 'document';
}

export function useFileUpload() {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File): Promise<UploadResult | null> => {
      if (!user) {
        setError('Avval tizimga kiring');
        return null;
      }

      setUploading(true);
      setProgress(0);
      setError(null);

      try {
        const uploaded = await uploadMedia(file, { type: 'chat', visibility: 'public' });
        setProgress(100);
        return {
          url: uploaded.url,
          type: file.type || uploaded.type,
          name: file.name,
          size: file.size,
          kind: detectKind(file.type || uploaded.type, file.name),
        };
      } catch (err) {
        // Aniq sababni ko'rsatamiz: "xatolik" degan umumiy matn foydasiz
        const message =
          err instanceof Error ? err.message : 'Faylni yuklashda kutilmagan xatolik';
        console.error('Upload error:', err);
        setError(message);
        return null;
      } finally {
        setUploading(false);
      }
    },
    [user]
  );

  const uploadMultiple = useCallback(
    async (files: File[]): Promise<UploadResult[]> => {
      const results: UploadResult[] = [];

      for (let i = 0; i < files.length; i++) {
        const result = await uploadFile(files[i]);
        if (result) results.push(result);
        setProgress(((i + 1) / files.length) * 100);
      }

      return results;
    },
    [uploadFile]
  );

  const getFileType = useCallback(
    (mimeType: string, fileName?: string): UploadKind => detectKind(mimeType, fileName),
    []
  );

  return {
    uploadFile,
    uploadMultiple,
    uploading,
    progress,
    error,
    getFileType,
  };
}
