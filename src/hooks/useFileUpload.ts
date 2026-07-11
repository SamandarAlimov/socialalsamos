import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { uploadMedia } from '@/lib/mediaUpload';

interface UploadResult {
  url: string;
  type: string;
  name: string;
  size: number;
}

export function useFileUpload() {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadFile = useCallback(async (file: File): Promise<UploadResult | null> => {
    if (!user) return null;

    setUploading(true);
    setProgress(0);

    try {
      const uploaded = await uploadMedia(file, { type: 'chat', visibility: 'public' });
      setProgress(100);
      return {
        url: uploaded.url,
        type: file.type,
        name: file.name,
        size: file.size,
      };
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    } finally {
      setUploading(false);
    }
  }, [user]);

  const uploadMultiple = useCallback(async (files: File[]): Promise<UploadResult[]> => {
    const results: UploadResult[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const result = await uploadFile(files[i]);
      if (result) {
        results.push(result);
      }
      setProgress(((i + 1) / files.length) * 100);
    }

    return results;
  }, [uploadFile]);

  const getFileType = useCallback((mimeType: string): 'image' | 'video' | 'audio' | 'document' => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  }, []);

  return {
    uploadFile,
    uploadMultiple,
    uploading,
    progress,
    getFileType,
  };
}
