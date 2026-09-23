import db from '@/lib/supabaseAny';

export type ContentHideReason =
  | 'not_interested'
  | 'irrelevant'
  | 'seen_too_often';

export interface ContentHideChangeDetail {
  postId: string;
  userId: string;
  hidden: boolean;
  reason?: ContentHideReason;
}

export const CONTENT_HIDE_CHANGE_EVENT = 'alsamos:content-hide-change';

export function announceContentHideChange(detail: ContentHideChangeDetail) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ContentHideChangeDetail>(CONTENT_HIDE_CHANGE_EVENT, {
      detail,
    }),
  );
}

export async function hideContentPost(
  postId: string,
  userId: string,
  reason: ContentHideReason = 'not_interested',
) {
  const { error } = await db.from('content_hides').upsert(
    {
      post_id: postId,
      user_id: userId,
      reason,
    },
    {
      onConflict: 'user_id,post_id',
      ignoreDuplicates: true,
    },
  );

  if (error) throw error;

  announceContentHideChange({
    postId,
    userId,
    hidden: true,
    reason,
  });
}

export async function unhideContentPost(postId: string, userId: string) {
  const { error } = await db
    .from('content_hides')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', userId);

  if (error) throw error;

  announceContentHideChange({
    postId,
    userId,
    hidden: false,
  });
}

export async function fetchHiddenPostIds(
  userId: string,
  postIds?: string[],
): Promise<Set<string>> {
  let query = db
    .from('content_hides')
    .select('post_id')
    .eq('user_id', userId);

  if (postIds && postIds.length > 0) query = query.in('post_id', postIds);

  const { data, error } = await query;
  if (error) throw error;

  return new Set(
    (data ?? [])
      .map((row: any) => String(row.post_id ?? ''))
      .filter(Boolean),
  );
}
