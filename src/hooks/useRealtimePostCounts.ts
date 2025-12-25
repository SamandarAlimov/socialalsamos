import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PostCounts {
  id: string;
  likes_count: number;
  comments_count: number;
  is_liked?: boolean;
}

export function useRealtimePostCounts(postIds: string[], userId: string | null) {
  const [counts, setCounts] = useState<Map<string, PostCounts>>(new Map());
  const channelsRef = useRef<any[]>([]);

  const fetchCounts = useCallback(async () => {
    if (postIds.length === 0) return;

    // Fetch likes counts
    const { data: likesData } = await supabase
      .from('post_likes')
      .select('post_id')
      .in('post_id', postIds);

    // Count likes per post
    const likesCountMap = new Map<string, number>();
    (likesData || []).forEach(like => {
      const current = likesCountMap.get(like.post_id) || 0;
      likesCountMap.set(like.post_id, current + 1);
    });

    // Fetch comments counts
    const { data: commentsData } = await supabase
      .from('comments')
      .select('post_id')
      .in('post_id', postIds);

    // Count comments per post
    const commentsCountMap = new Map<string, number>();
    (commentsData || []).forEach(comment => {
      const current = commentsCountMap.get(comment.post_id) || 0;
      commentsCountMap.set(comment.post_id, current + 1);
    });

    // Check user likes
    let userLikes = new Set<string>();
    if (userId) {
      const { data: userLikesData } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds);

      userLikes = new Set((userLikesData || []).map(l => l.post_id));
    }

    // Update counts
    const newCounts = new Map<string, PostCounts>();
    postIds.forEach(postId => {
      newCounts.set(postId, {
        id: postId,
        likes_count: likesCountMap.get(postId) || 0,
        comments_count: commentsCountMap.get(postId) || 0,
        is_liked: userLikes.has(postId),
      });
    });

    setCounts(newCounts);
  }, [postIds, userId]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Real-time subscriptions
  useEffect(() => {
    if (postIds.length === 0) return;

    // Clean up previous channels
    channelsRef.current.forEach(channel => {
      supabase.removeChannel(channel);
    });
    channelsRef.current = [];

    // Subscribe to likes changes
    const likesChannel = supabase
      .channel('realtime-likes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_likes',
        },
        (payload) => {
          const postId = (payload.new as any)?.post_id || (payload.old as any)?.post_id;
          if (postIds.includes(postId)) {
            fetchCounts();
          }
        }
      )
      .subscribe();

    // Subscribe to comments changes
    const commentsChannel = supabase
      .channel('realtime-comments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
        },
        (payload) => {
          const postId = (payload.new as any)?.post_id || (payload.old as any)?.post_id;
          if (postIds.includes(postId)) {
            fetchCounts();
          }
        }
      )
      .subscribe();

    channelsRef.current = [likesChannel, commentsChannel];

    return () => {
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel);
      });
    };
  }, [postIds, fetchCounts]);

  const getPostCounts = useCallback((postId: string) => {
    return counts.get(postId) || { id: postId, likes_count: 0, comments_count: 0, is_liked: false };
  }, [counts]);

  return { counts, getPostCounts, refetch: fetchCounts };
}
