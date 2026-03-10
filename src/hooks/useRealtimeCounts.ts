import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PostCounts {
  likes_count: number;
  comments_count: number;
  shares_count: number;
  bookmarks_count: number;
  views_count: number;
}

export function useRealtimeCounts(postId: string | null) {
  const [counts, setCounts] = useState<PostCounts>({
    likes_count: 0,
    comments_count: 0,
    shares_count: 0,
    bookmarks_count: 0,
    views_count: 0,
  });

  const fetchCounts = useCallback(async () => {
    if (!postId) return;

    const [likesResult, commentsResult, viewsResult] = await Promise.all([
      supabase
        .from('post_likes')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', postId),
      supabase
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', postId),
      supabase
        .from('post_views')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', postId),
    ]);

    setCounts(prev => ({
      ...prev,
      likes_count: likesResult.count ?? 0,
      comments_count: commentsResult.count ?? 0,
      views_count: viewsResult.count ?? 0,
    }));
  }, [postId]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useEffect(() => {
    if (!postId) return;

    const likesChannel = supabase
      .channel(`likes-${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_likes',
          filter: `post_id=eq.${postId}`,
        },
        () => fetchCounts()
      )
      .subscribe();

    const commentsChannel = supabase
      .channel(`comments-${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${postId}`,
        },
        () => fetchCounts()
      )
      .subscribe();

    const viewsChannel = supabase
      .channel(`views-${postId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'post_views',
          filter: `post_id=eq.${postId}`,
        },
        () => fetchCounts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(likesChannel);
      supabase.removeChannel(commentsChannel);
      supabase.removeChannel(viewsChannel);
    };
  }, [postId, fetchCounts]);

  return counts;
}

// Re-export from dedicated hook for backward compatibility
export { useStoryViews } from './useStoryViews';
