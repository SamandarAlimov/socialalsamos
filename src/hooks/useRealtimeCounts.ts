import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PostCounts {
  likes_count: number;
  comments_count: number;
  shares_count: number;
  bookmarks_count: number;
}

export function useRealtimeCounts(postId: string | null) {
  const [counts, setCounts] = useState<PostCounts>({
    likes_count: 0,
    comments_count: 0,
    shares_count: 0,
    bookmarks_count: 0,
  });

  const fetchCounts = useCallback(async () => {
    if (!postId) return;

    // Fetch actual counts from database
    const [likesResult, commentsResult] = await Promise.all([
      supabase
        .from('post_likes')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', postId),
      supabase
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', postId),
    ]);

    setCounts(prev => ({
      ...prev,
      likes_count: likesResult.count ?? 0,
      comments_count: commentsResult.count ?? 0,
    }));
  }, [postId]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Subscribe to real-time changes
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
        () => {
          fetchCounts();
        }
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
        () => {
          fetchCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(likesChannel);
      supabase.removeChannel(commentsChannel);
    };
  }, [postId, fetchCounts]);

  return counts;
}

// Hook for tracking story views
export function useStoryViews(userId: string | null) {
  const [viewedStories, setViewedStories] = useState<Set<string>>(new Set());

  // Load viewed stories from localStorage
  useEffect(() => {
    if (!userId) return;
    
    const stored = localStorage.getItem(`viewed_stories_${userId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setViewedStories(new Set(parsed));
      } catch (e) {
        console.error('Error parsing viewed stories:', e);
      }
    }
  }, [userId]);

  const markAsViewed = useCallback((storyId: string) => {
    if (!userId) return;
    
    setViewedStories(prev => {
      const newSet = new Set(prev);
      newSet.add(storyId);
      localStorage.setItem(`viewed_stories_${userId}`, JSON.stringify([...newSet]));
      return newSet;
    });
  }, [userId]);

  const hasViewed = useCallback((storyId: string) => {
    return viewedStories.has(storyId);
  }, [viewedStories]);

  const hasViewedAll = useCallback((storyIds: string[]) => {
    return storyIds.every(id => viewedStories.has(id));
  }, [viewedStories]);

  return { viewedStories, markAsViewed, hasViewed, hasViewedAll };
}
