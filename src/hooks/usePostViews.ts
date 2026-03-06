import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function usePostViews() {
  const { user } = useAuth();

  const recordView = useCallback(async (postId: string) => {
    if (!user) return;
    
    try {
      await supabase
        .from('post_views')
        .upsert(
          { post_id: postId, user_id: user.id },
          { onConflict: 'post_id,user_id' }
        );
    } catch (error) {
      // Silently fail - view tracking is non-critical
    }
  }, [user]);

  return { recordView };
}
