import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PostCounts {
  id: string;
  likes_count: number;
  comments_count: number;
  views_count: number;
  is_liked?: boolean;
}

export function useRealtimePostCounts(postIds: string[], userId: string | null) {
  const [counts, setCounts] = useState<Map<string, PostCounts>>(new Map());
  const channelsRef = useRef<any[]>([]);

  const fetchCounts = useCallback(async () => {
    if (postIds.length === 0) return;

    const [likesData, commentsData, viewsData, userLikesData] = await Promise.all([
      supabase.from('post_likes').select('post_id').in('post_id', postIds),
      supabase.from('comments').select('post_id').in('post_id', postIds),
      supabase.from('post_views').select('post_id').in('post_id', postIds),
      userId
        ? supabase.from('post_likes').select('post_id').eq('user_id', userId).in('post_id', postIds)
        : { data: [] },
    ]);

    const likesCountMap = new Map<string, number>();
    (likesData.data || []).forEach(l => likesCountMap.set(l.post_id, (likesCountMap.get(l.post_id) || 0) + 1));

    const commentsCountMap = new Map<string, number>();
    (commentsData.data || []).forEach(c => commentsCountMap.set(c.post_id, (commentsCountMap.get(c.post_id) || 0) + 1));

    const viewsCountMap = new Map<string, number>();
    (viewsData.data || []).forEach(v => viewsCountMap.set(v.post_id, (viewsCountMap.get(v.post_id) || 0) + 1));

    const userLikes = new Set(((userLikesData as any).data || []).map((l: any) => l.post_id));

    const newCounts = new Map<string, PostCounts>();
    postIds.forEach(postId => {
      newCounts.set(postId, {
        id: postId,
        likes_count: likesCountMap.get(postId) || 0,
        comments_count: commentsCountMap.get(postId) || 0,
        views_count: viewsCountMap.get(postId) || 0,
        is_liked: userLikes.has(postId),
      });
    });

    setCounts(newCounts);
  }, [postIds, userId]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useEffect(() => {
    if (postIds.length === 0) return;

    channelsRef.current.forEach(channel => supabase.removeChannel(channel));
    channelsRef.current = [];

    const likesChannel = supabase
      .channel('realtime-likes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, (payload) => {
        const postId = (payload.new as any)?.post_id || (payload.old as any)?.post_id;
        if (postIds.includes(postId)) fetchCounts();
      })
      .subscribe();

    const commentsChannel = supabase
      .channel('realtime-comments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
        const postId = (payload.new as any)?.post_id || (payload.old as any)?.post_id;
        if (postIds.includes(postId)) fetchCounts();
      })
      .subscribe();

    const viewsChannel = supabase
      .channel('realtime-views')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_views' }, (payload) => {
        const postId = (payload.new as any)?.post_id;
        if (postIds.includes(postId)) fetchCounts();
      })
      .subscribe();

    channelsRef.current = [likesChannel, commentsChannel, viewsChannel];

    return () => {
      channelsRef.current.forEach(channel => supabase.removeChannel(channel));
    };
  }, [postIds, fetchCounts]);

  const getPostCounts = useCallback((postId: string) => {
    return counts.get(postId) || { id: postId, likes_count: 0, comments_count: 0, views_count: 0, is_liked: false };
  }, [counts]);

  return { counts, getPostCounts, refetch: fetchCounts };
}
