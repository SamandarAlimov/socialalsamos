import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uploadMedia } from '@/lib/mediaUpload';

export interface ProfilePhoto {
  id: string;
  user_id: string;
  image_url: string;
  position: number;
  created_at: string;
}

// profile_photos jadvali generated types'ga hali kirmagan bo'lishi mumkin
const db = supabase as any;

export function useProfilePhotos(userId?: string | null) {
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchPhotos = useCallback(async () => {
    if (!userId) {
      setPhotos([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await db
        .from('profile_photos')
        .select('*')
        .eq('user_id', userId)
        .order('position', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPhotos((data || []) as ProfilePhoto[]);
    } catch (error) {
      console.error('Profil rasmlarini yuklashda xatolik:', error);
      setPhotos([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  /** Yangi rasm qo'shadi va uni asosiy avatar qiladi */
  const addPhoto = useCallback(
    async (file: File): Promise<string | null> => {
      if (!userId) return null;

      setUploading(true);
      try {
        const uploaded = await uploadMedia(file, { type: 'avatar', visibility: 'public' });

        const { error } = await db
          .from('profile_photos')
          .insert({ user_id: userId, image_url: uploaded.url });

        if (error) throw error;

        await fetchPhotos();
        return uploaded.url;
      } finally {
        setUploading(false);
      }
    },
    [userId, fetchPhotos]
  );

  /** Galereyadagi rasmni asosiy avatar qiladi */
  const setMainPhoto = useCallback(
    async (photoId: string) => {
      const { error } = await db.rpc('set_main_profile_photo', { p_photo_id: photoId });
      if (error) throw error;
      await fetchPhotos();
    },
    [fetchPhotos]
  );

  /** Rasmni o'chiradi; asosiy bo'lsa, keyingisi avtomatik asosiy bo'ladi */
  const deletePhoto = useCallback(
    async (photoId: string) => {
      const { error } = await db.from('profile_photos').delete().eq('id', photoId);
      if (error) throw error;
      await fetchPhotos();
    },
    [fetchPhotos]
  );

  return {
    photos,
    isLoading,
    uploading,
    refresh: fetchPhotos,
    addPhoto,
    setMainPhoto,
    deletePhoto,
  };
}
