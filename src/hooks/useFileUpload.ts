import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('message-attachments')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    setUploading(false);
    setProgress(100);

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('message-attachments')
      .getPublicUrl(data.path);

    return {
      url: urlData.publicUrl,
      type: file.type,
      name: file.name,
      size: file.size,
    };
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
