// Post like'larini bitta joydan boshqarish.
//
// Ilgari Discover bo'limlaridagi like tugmalari faqat local state'ni
// o'zgartirar edi — sahifa yangilanganda like yo'qolib ketardi. Bu helper
// haqiqiy `post_likes` yozuvini yaratadi/o'chiradi, shuning uchun web va
// Flutter (alsamos-superapp) mijozlari bir xil ma'lumot bilan ishlaydi.

import { supabase } from '@/integrations/supabase/client';

export const POST_LIKE_OPTIMISTIC_EVENT = 'alsamos:post-like-optimistic';

export type PostLikeOptimisticPhase = 'optimistic' | 'confirmed' | 'rollback';

export interface PostLikeOptimisticEventDetail {
  postId: string;
  userId: string;
  isLiked: boolean;
  previousLiked: boolean;
  delta: number;
  mutationId: string;
  phase: PostLikeOptimisticPhase;
}

function createMutationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emitOptimisticLike(detail: PostLikeOptimisticEventDetail) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<PostLikeOptimisticEventDetail>(POST_LIKE_OPTIMISTIC_EVENT, {
      detail,
    }),
  );
}

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
 * Muhim: UI server javobini kutmaydi. Mutation boshlanishidan oldin shu tabdagi
 * Home/Videos canonical counter hook'lariga optimistik event yuboriladi. Xato
 * bo'lsa ayni mutation rollback eventi bilan qaytariladi; DB realtime eventi esa
 * keyin canonical tasdiq vazifasini bajaradi.
 *
 * @returns yangi like holati (`true` — like qo'yildi)
 * @throws Supabase xatosi — chaqiruvchi o'z local state'ini ham qaytarib olishi kerak
 */
export async function togglePostLike(
  postId: string,
  userId: string,
  isLikedNow: boolean,
): Promise<boolean> {
  const mutationId = createMutationId();
  const nextLiked = !isLikedNow;
  const delta = nextLiked ? 1 : -1;

  emitOptimisticLike({
    postId,
    userId,
    isLiked: nextLiked,
    previousLiked: isLikedNow,
    delta,
    mutationId,
    phase: 'optimistic',
  });

  try {
    if (isLikedNow) {
      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('post_likes')
        .insert({ post_id: postId, user_id: userId });

      if (error) throw error;
    }

    emitOptimisticLike({
      postId,
      userId,
      isLiked: nextLiked,
      previousLiked: isLikedNow,
      delta: 0,
      mutationId,
      phase: 'confirmed',
    });

    return nextLiked;
  } catch (error) {
    emitOptimisticLike({
      postId,
      userId,
      isLiked: isLikedNow,
      previousLiked: nextLiked,
      delta: -delta,
      mutationId,
      phase: 'rollback',
    });
    throw error;
  }
}
