import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import db from '@/lib/supabaseAny';

export interface PostCounts {
  id: string;
  likes_count: number;
  comments_count: number;
  views_count: number;
  reposts_count: number;
  is_liked?: boolean;
}

type CountTable = 'post_likes' | 'comments' | 'post_views' | 'reposts';

const EMPTY_COUNTS = (postId: string): PostCounts => ({
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

async function mapWithConcurrency<T, R>(
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

async function fetchCanonicalPostCounts(
  postId: string,
  userId: string | null,
): Promise<PostCounts> {
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

export function useRealtimePostCounts(postIds: string[], userId: string | null) {
  const [counts, setCounts] = useState<Map<string, PostCounts>>(new Map());
  const refreshTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Callers frequently create a new `postIds` array every render. A stable key
  // prevents an otherwise endless refetch/subscription cycle.
  const postIdsKey = useMemo(
    () => Array.from(new Set(postIds.filter(Boolean))).sort().join('|'),
    [postIds],
  );
  const stablePostIds = useMemo(
    () => (postIdsKey ? postIdsKey.split('|') : []),
    [postIdsKey],
  );
  const trackedIds = useMemo(() => new Set(stablePostIds), [stablePostIds]);

  const refreshPost = useCallback(async (postId: string) => {
    if (!postId || !trackedIds.has(postId)) return;

    try {
      const next = await fetchCanonicalPostCounts(postId, userId);
      setCounts((current) => {
        const updated = new Map(current);
        updated.set(postId, next);
        return updated;
      });
    } catch (error) {
      console.warn('Canonical post counters could not be refreshed:', postId, error);
    }
  }, [trackedIds, userId]);

  const fetchCounts = useCallback(async () => {
    if (stablePostIds.length === 0) {
      setCounts(new Map());
      return;
    }

    const rows = await mapWithConcurrency(stablePostIds, 6, async (postId) => {
      try {
        return await fetchCanonicalPostCounts(postId, userId);
      } catch (error) {
        console.warn('Canonical post counters could not be loaded:', postId, error);
        return null;
      }
    });

    setCounts((current) => {
      const next = new Map<string, PostCounts>();
      stablePostIds.forEach((postId, index) => {
        next.set(postId, rows[index] ?? current.get(postId) ?? EMPTY_COUNTS(postId));
      });
      return next;
    });
  }, [stablePostIds, userId]);

  const scheduleRefresh = useCallback((postId: string) => {
    if (!trackedIds.has(postId)) return;

    const existing = refreshTimersRef.current.get(postId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      refreshTimersRef.current.delete(postId);
      void refreshPost(postId);
    }, 90);
    refreshTimersRef.current.set(postId, timer);
  }, [refreshPost, trackedIds]);

  useEffect(() => {
    void fetchCounts();
  }, [fetchCounts]);

  useEffect(() => {
    if (stablePostIds.length === 0) return;

    const channel = supabase
      .channel(`canonical-post-counts-${postIdsKey.slice(0, 80)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, (payload) => {
        const postId = String((payload.new as any)?.post_id || (payload.old as any)?.post_id || '');
        if (postId) scheduleRefresh(postId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
        const postId = String((payload.new as any)?.post_id || (payload.old as any)?.post_id || '');
        if (postId) scheduleRefresh(postId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_views' }, (payload) => {
        const postId = String((payload.new as any)?.post_id || (payload.old as any)?.post_id || '');
        if (postId) scheduleRefresh(postId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reposts' }, (payload) => {
        const postId = String((payload.new as any)?.post_id || (payload.old as any)?.post_id || '');
        if (postId) scheduleRefresh(postId);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      refreshTimersRef.current.forEach((timer) => clearTimeout(timer));
      refreshTimersRef.current.clear();
    };
  }, [postIdsKey, scheduleRefresh, stablePostIds.length]);

  const getPostCounts = useCallback((postId: string) => {
    return counts.get(postId) || EMPTY_COUNTS(postId);
  }, [counts]);

  return { counts, getPostCounts, refetch: fetchCounts, refreshPost };
}
