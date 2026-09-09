import { supabase } from '@/integrations/supabase/client';
import db from '@/lib/supabaseAny';

export interface CanonicalPostEngagement {
  id: string;
  likes_count: number;
  comments_count: number;
  views_count: number;
  reposts_count: number;
  is_liked?: boolean;
}

type CountTable = 'post_likes' | 'comments' | 'post_views' | 'reposts';

type EngagementPost = {
  id: string;
  likes_count: number;
  comments_count: number;
  views_count?: number;
  reposts_count?: number;
  is_liked?: boolean;
};

export const emptyCanonicalPostEngagement = (postId: string): CanonicalPostEngagement => ({
  id: postId,
  likes_count: 0,
  comments_count: 0,
  views_count: 0,
  reposts_count: 0,
  is_liked: false,
});

async function exactCount(table: CountTable, postId: string): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId);

  if (error) throw error;
  return Math.max(0, Number(count ?? 0));
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index]);
      }
    },
  );

  await Promise.all(runners);
  return results;
}

export async function fetchCanonicalPostEngagement(
  postId: string,
  userId: string | null = null,
): Promise<CanonicalPostEngagement> {
  const [likes, comments, views, reposts, currentUserLike] = await Promise.all([
    exactCount('post_likes', postId),
    exactCount('comments', postId),
    exactCount('post_views', postId),
    exactCount('reposts', postId),
    userId
      ? supabase
          .from('post_likes')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (currentUserLike.error) throw currentUserLike.error;

  return {
    id: postId,
    likes_count: likes,
    comments_count: comments,
    views_count: views,
    reposts_count: reposts,
    is_liked: Boolean(currentUserLike.data),
  };
}

export async function hydrateCanonicalPostEngagement<T extends EngagementPost>(
  posts: T[],
  userId: string | null = null,
  concurrency = 6,
): Promise<T[]> {
  if (posts.length === 0) return posts;

  const uniqueIds = Array.from(new Set(posts.map((post) => post.id).filter(Boolean)));
  const rows = await mapWithConcurrency(uniqueIds, concurrency, async (postId) => {
    try {
      return await fetchCanonicalPostEngagement(postId, userId);
    } catch (error) {
      console.warn('Canonical post engagement could not be loaded:', postId, error);
      return null;
    }
  });

  const byId = new Map<string, CanonicalPostEngagement>();
  uniqueIds.forEach((postId, index) => {
    const row = rows[index];
    if (row) byId.set(postId, row);
  });

  return posts.map((post) => {
    const canonical = byId.get(post.id);
    if (!canonical) return post;

    return {
      ...post,
      likes_count: canonical.likes_count,
      comments_count: canonical.comments_count,
      ...(typeof post.views_count === 'number' ? { views_count: canonical.views_count } : {}),
      ...(typeof post.reposts_count === 'number' ? { reposts_count: canonical.reposts_count } : {}),
      ...(userId ? { is_liked: canonical.is_liked } : {}),
    };
  });
}
