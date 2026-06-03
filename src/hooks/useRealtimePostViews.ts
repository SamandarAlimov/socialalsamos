import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribes to realtime INSERTs on post_views for the given post.
 * Returns a live view count that can be animated by the consumer.
 */
export function useRealtimePostViews(postId: string, initialCount: number) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount, postId]);

  useEffect(() => {
    if (!postId) return;

    const channel = supabase
      .channel(`post-views:${postId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'post_views',
          filter: `post_id=eq.${postId}`,
        },
        () => {
          setCount((c) => c + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId]);

  return count;
}
