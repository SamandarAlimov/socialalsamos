// Post like'larini bitta joydan boshqarish.
//
// Ilgari Discover bo'limlaridagi like tugmalari faqat local state'ni
// o'zgartirar edi — sahifa yangilanganda like yo'qolib ketardi. Bu helper
// haqiqiy `post_likes` yozuvini yaratadi/o'chiradi, shuning uchun web va
// Flutter (alsamos-superapp) mijozlari bir xil ma'lumot bilan ishlaydi.

import { supabase } from '@/integrations/supabase/client';

/** Berilgan postlar uchun foydalanuvchi like qilgan ID'lar to'plamini qaytaradi. */
export async function fetchLikedPostIds(
  userId: string | undefined,
  postIds: string[],
): Promise<Set<string>> {
  if (!userId || postIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds);

  if (error) {
    console.warn('Like holatini yuklash muvaffaqiyatsiz:', error);
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.post_id as string));
}

/**
 * Like'ni bazada almashtiradi.
 *
 * @returns yangi like holati (`true` — like qo'yildi)
 * @throws Supabase xatosi — chaqiruvchi optimistik state'ni qaytarib olishi kerak
 */
export async function togglePostLike(
  postId: string,
  userId: string,
  isLikedNow: boolean,
): Promise<boolean> {
  if (isLikedNow) {
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);

    if (error) throw error;
    return false;
  }

  const { error } = await supabase
    .from('post_likes')
    .insert({ post_id: postId, user_id: userId });

  if (error) throw error;
  return true;
}
