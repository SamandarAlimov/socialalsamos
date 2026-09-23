import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import db from '@/lib/supabaseAny';
import {
  POST_LIKE_OPTIMISTIC_EVENT,
  type PostLikeOptimisticEventDetail,
} from '@/lib/postLikes';

export interface PostCounts {
  id: string;
  likes_count: number;
  comments_count: number;
  views_count: number;
  reposts_count: number;
  is_liked?: boolean;
}

type CountTable = 'post_likes' | 'comments' | 'post_views' | 'reposts';

type PendingOptimisticLike = {
  mutationId: string;
  userId: string;
  isLiked: boolean;
};

const EMPTY_COUNTS = (postId: string): PostCounts => ({
  id: postId,
  likes_count: 0,
  comments_count: 0,
  views_count: 0,
  reposts_count: 0,
  // `undefined` is intentional. Until canonical state has loaded, callers
  // should keep their already-hydrated/optimistic local like state instead of
  // having an artificial `false` override it.
  is_liked: undefined,
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
  const optimisticLikesRef = useRef<Map<string, PendingOptimisticLike>>(new Map());

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

  const overlayOptimisticLike = useCallback((postId: string, canonical: PostCounts) => {
    const pending = optimisticLikesRef.current.get(postId);
    if (!pending || !userId || pending.userId !== userId) return canonical;

    // Once the canonical query sees the requested state, the optimistic layer
    // has served its purpose and can be dropped without a visual jump.
    if (canonical.is_liked === pending.isLiked) {
      optimisticLikesRef.current.delete(postId);
      return canonical;
    }

    return {
      ...canonical,
      likes_count: Math.max(
        0,
        canonical.likes_count + (pending.isLiked ? 1 : -1),
      ),
      is_liked: pending.isLiked,
    };
  }, [userId]);

  const refreshPost = useCallback(async (postId: string) => {
    if (!postId || !trackedIds.has(postId)) return;

    try {
      const canonical = await fetchCanonicalPostCounts(postId, userId);
      const next = overlayOptimisticLike(postId, canonical);
      setCounts((current) => {
        const updated = new Map(current);
        updated.set(postId, next);
        return updated;
      });
    } catch (error) {
      console.warn('Canonical post counters could not be refreshed:', postId, error);
    }
  }, [overlayOptimisticLike, trackedIds, userId]);

  const fetchCounts = useCallback(async () => {
    if (stablePostIds.length === 0) {
      setCounts(new Map());
      return;
    }

    const rows = await mapWithConcurrency(stablePostIds, 6, async (postId) => {
      try {
        const canonical = await fetchCanonicalPostCounts(postId, userId);
        return overlayOptimisticLike(postId, canonical);
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
  }, [overlayOptimisticLike, stablePostIds, userId]);

  const scheduleRefresh = useCallback((postId: string) => {
    if (!trackedIds.has(postId)) return;

    const existing = refreshTimersRef.current.get(postId);
    if (existing) clearTimeout(existing);

    // Realtime/local optimistic events update the visible heart immediately.
    // This exact read only reconciles races and missed websocket events.
    const timer = setTimeout(() => {
      refreshTimersRef.current.delete(postId);
      void refreshPost(postId);
    }, 120);
    refreshTimersRef.current.set(postId, timer);
  }, [refreshPost, trackedIds]);

  const applyRealtimeLike = useCallback((payload: any) => {
    const newRow = payload?.new as Record<string, unknown> | null | undefined;
    const oldRow = payload?.old as Record<string, unknown> | null | undefined;
    const postId = String(newRow?.post_id ?? oldRow?.post_id ?? '');
    if (!postId || !trackedIds.has(postId)) return;

    const actorId = String(newRow?.user_id ?? oldRow?.user_id ?? '');
    const eventType = String(payload?.eventType ?? '').toUpperCase();
    const isCurrentUser = Boolean(userId && actorId && actorId === userId);
    const pending = optimisticLikesRef.current.get(postId);
    const confirmsPending = Boolean(
      isCurrentUser &&
        pending &&
        pending.userId === userId &&
        ((eventType === 'INSERT' && pending.isLiked) ||
          (eventType === 'DELETE' && !pending.isLiked)),
    );

    if (confirmsPending) optimisticLikesRef.current.delete(postId);

    setCounts((current) => {
      const existing = current.get(postId);
      if (!existing) return current;

      const alreadyAppliedForCurrentUser =
        isCurrentUser &&
        ((eventType === 'INSERT' && existing.is_liked === true) ||
          (eventType === 'DELETE' && existing.is_liked === false));
      const rawDelta = eventType === 'INSERT' ? 1 : eventType === 'DELETE' ? -1 : 0;
      const delta = confirmsPending || alreadyAppliedForCurrentUser ? 0 : rawDelta;
      const nextLiked = isCurrentUser
        ? eventType === 'INSERT'
          ? true
          : eventType === 'DELETE'
            ? false
            : existing.is_liked
        : existing.is_liked;

      const next = new Map(current);
      next.set(postId, {
        ...existing,
        likes_count: Math.max(0, existing.likes_count + delta),
        is_liked: nextLiked,
      });
      return next;
    });

    scheduleRefresh(postId);
  }, [scheduleRefresh, trackedIds, userId]);

  useEffect(() => {
    void fetchCounts();
  }, [fetchCounts]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOptimisticLike = (event: Event) => {
      const detail = (event as CustomEvent<PostLikeOptimisticEventDetail>).detail;
      if (
        !detail ||
        !userId ||
        detail.userId !== userId ||
        !trackedIds.has(detail.postId)
      ) {
        return;
      }

      if (detail.phase === 'optimistic') {
        optimisticLikesRef.current.set(detail.postId, {
          mutationId: detail.mutationId,
          userId: detail.userId,
          isLiked: detail.isLiked,
        });

        setCounts((current) => {
          const existing = current.get(detail.postId);
          // If canonical counts have not loaded yet, the caller's own hydrated
          // local state remains the fallback. Do not introduce a fake zero count.
          if (!existing) return current;

          const alreadyInRequestedState = existing.is_liked === detail.isLiked;
          const next = new Map(current);
          next.set(detail.postId, {
            ...existing,
            likes_count: Math.max(
              0,
              existing.likes_count + (alreadyInRequestedState ? 0 : detail.delta),
            ),
            is_liked: detail.isLiked,
          });
          return next;
        });
        return;
      }

      if (detail.phase === 'rollback') {
        const pending = optimisticLikesRef.current.get(detail.postId);
        if (pending?.mutationId === detail.mutationId) {
          optimisticLikesRef.current.delete(detail.postId);
        }

        setCounts((current) => {
          const existing = current.get(detail.postId);
          if (!existing) return current;

          const alreadyRolledBack = existing.is_liked === detail.isLiked;
          const next = new Map(current);
          next.set(detail.postId, {
            ...existing,
            likes_count: Math.max(
              0,
              existing.likes_count + (alreadyRolledBack ? 0 : detail.delta),
            ),
            is_liked: detail.isLiked,
          });
          return next;
        });
        scheduleRefresh(detail.postId);
        return;
      }

      // `confirmed` keeps the optimistic overlay until a websocket/exact read
      // observes the canonical row. This prevents a stale in-flight fetch from
      // flashing the heart back to its previous state.
      scheduleRefresh(detail.postId);
    };

    window.addEventListener(POST_LIKE_OPTIMISTIC_EVENT, handleOptimisticLike);
    return () => {
      window.removeEventListener(POST_LIKE_OPTIMISTIC_EVENT, handleOptimisticLike);
    };
  }, [scheduleRefresh, trackedIds, userId]);

  useEffect(() => {
    if (stablePostIds.length === 0) return;

    const channel = supabase
      .channel(`canonical-post-counts-${postIdsKey.slice(0, 80)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, (payload) => {
        // Apply the heart/count change from the realtime row immediately. The
        // exact-count query remains as a short reconciliation pass only.
        applyRealtimeLike(payload);
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
  }, [applyRealtimeLike, postIdsKey, scheduleRefresh, stablePostIds.length]);

  const getPostCounts = useCallback((postId: string) => {
    return counts.get(postId) || EMPTY_COUNTS(postId);
  }, [counts]);

  return { counts, getPostCounts, refetch: fetchCounts, refreshPost };
}
