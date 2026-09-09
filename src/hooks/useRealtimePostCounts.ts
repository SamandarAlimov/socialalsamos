import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  emptyCanonicalPostEngagement,
  fetchCanonicalPostEngagement,
  mapWithConcurrency,
  type CanonicalPostEngagement,
} from '@/lib/postEngagement';

export type PostCounts = CanonicalPostEngagement;

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
      const next = await fetchCanonicalPostEngagement(postId, userId);
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
        return await fetchCanonicalPostEngagement(postId, userId);
      } catch (error) {
        console.warn('Canonical post counters could not be loaded:', postId, error);
        return null;
      }
    });

    setCounts((current) => {
      const next = new Map<string, PostCounts>();
      stablePostIds.forEach((postId, index) => {
        next.set(postId, rows[index] ?? current.get(postId) ?? emptyCanonicalPostEngagement(postId));
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
    return counts.get(postId) || emptyCanonicalPostEngagement(postId);
  }, [counts]);

  return { counts, getPostCounts, refetch: fetchCounts, refreshPost };
}
