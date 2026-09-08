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
const PROFILE_FALLBACK_BUCKET = 'media';

function safeAvatarFileName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .toLowerCase();
  return cleaned.slice(-80) || 'avatar.jpg';
}

function shortRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Profil rasmi identity-critical media hisoblanadi. Asosiy Alsamos media API
 * vaqtincha 5xx/Cloudflare xato qaytarsa foydalanuvchi profilini butunlay
 * bloklab qo'ymaslik uchun eski public `media` bucketga favqulodda fallback
 * qilamiz. Bu faqat aynan tizimga kirgan userning o'z papkasiga yozadi.
 */
async function uploadAvatarEmergencyFallback(
  file: File,
  userId: string,
): Promise<{ url: string; key: string }> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user?.id || data.session.user.id !== userId) {
    throw new Error('Profil rasmini yuklash uchun sessiyani yangilang');
  }

  const key = `${userId}/avatar/${Date.now()}-${shortRandomId()}-${safeAvatarFileName(file.name)}`;
  const { error } = await supabase.storage.from(PROFILE_FALLBACK_BUCKET).upload(key, file, {
    contentType: file.type || 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    throw new Error(`Profil rasmi fallback yuklashda xatolik: ${error.message}`);
  }

  const url = supabase.storage.from(PROFILE_FALLBACK_BUCKET).getPublicUrl(key).data.publicUrl;
  if (!url) {
    await supabase.storage.from(PROFILE_FALLBACK_BUCKET).remove([key]).catch(() => undefined);
    throw new Error('Profil rasmi uchun public URL olinmadi');
  }

  return { url, key };
}

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
      let fallbackKey: string | null = null;

      try {
        let imageUrl: string;

        try {
          const uploaded = await uploadMedia(file, { type: 'avatar', visibility: 'public' });
          imageUrl = uploaded.url;
        } catch (mediaError) {
          // api.alsamos.com / media-presign ishlamay qolsa profil rasmini
          // yuklash user uchun baribir ishlashi kerak.
          console.warn(
            '[ProfilePhotos] Primary media upload failed; using authenticated Supabase fallback.',
            mediaError,
          );
          const fallback = await uploadAvatarEmergencyFallback(file, userId);
          imageUrl = fallback.url;
          fallbackKey = fallback.key;
        }

        const { error } = await db
          .from('profile_photos')
          .insert({ user_id: userId, image_url: imageUrl });

        if (error) {
          if (fallbackKey) {
            await supabase.storage
              .from(PROFILE_FALLBACK_BUCKET)
              .remove([fallbackKey])
              .catch(() => undefined);
          }
          throw error;
        }

        await fetchPhotos();
        return imageUrl;
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
