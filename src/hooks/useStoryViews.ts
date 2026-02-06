import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface StoryViewRecord {
  story_id: string;
  viewer_id: string;
  viewed_at: string;
}

/**
 * Hook for tracking story views using database as source of truth
 * with real-time subscriptions for instant updates
 */
export function useStoryViews() {
  const { user } = useAuth();
  const [viewedStoryIds, setViewedStoryIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial viewed stories from database
  useEffect(() => {
    if (!user) {
      setViewedStoryIds(new Set());
      setIsLoading(false);
      return;
    }

    const fetchViewedStories = async () => {
      try {
        const { data, error } = await supabase
          .from('story_views')
          .select('story_id')
          .eq('viewer_id', user.id);

        if (error) throw error;

        const ids = new Set(data?.map(v => v.story_id) || []);
        setViewedStoryIds(ids);
      } catch (error) {
        console.error('Error fetching viewed stories:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchViewedStories();
  }, [user]);

  // Subscribe to real-time updates for user's story views
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`user-story-views-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'story_views',
          filter: `viewer_id=eq.${user.id}`,
        },
        (payload) => {
          const newView = payload.new as StoryViewRecord;
          setViewedStoryIds(prev => {
            const updated = new Set(prev);
            updated.add(newView.story_id);
            return updated;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'story_views',
          filter: `viewer_id=eq.${user.id}`,
        },
        (payload) => {
          const oldView = payload.old as StoryViewRecord;
          setViewedStoryIds(prev => {
            const updated = new Set(prev);
            updated.delete(oldView.story_id);
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Mark a story as viewed
  const markAsViewed = useCallback(async (storyId: string) => {
    if (!user) return;

    // Optimistic update
    setViewedStoryIds(prev => {
      const updated = new Set(prev);
      updated.add(storyId);
      return updated;
    });

    try {
      await supabase
        .from('story_views')
        .upsert({
          story_id: storyId,
          viewer_id: user.id,
        }, { onConflict: 'story_id,viewer_id' });
    } catch (error) {
      console.error('Error marking story as viewed:', error);
      // Rollback on error
      setViewedStoryIds(prev => {
        const updated = new Set(prev);
        updated.delete(storyId);
        return updated;
      });
    }
  }, [user]);

  // Check if a story has been viewed
  const hasViewed = useCallback((storyId: string) => {
    return viewedStoryIds.has(storyId);
  }, [viewedStoryIds]);

  // Check if all stories in an array have been viewed
  const hasViewedAll = useCallback((storyIds: string[]) => {
    if (storyIds.length === 0) return true;
    return storyIds.every(id => viewedStoryIds.has(id));
  }, [viewedStoryIds]);

  // Check if any story in the group is unviewed
  const hasUnviewed = useCallback((storyIds: string[]) => {
    if (storyIds.length === 0) return false;
    return storyIds.some(id => !viewedStoryIds.has(id));
  }, [viewedStoryIds]);

  return {
    viewedStoryIds,
    isLoading,
    markAsViewed,
    hasViewed,
    hasViewedAll,
    hasUnviewed,
  };
}

/**
 * Hook for getting real-time viewer count and list for a specific story
 * Used by story owners to see who viewed their stories
 */
export function useStoryViewers(storyId: string | null) {
  const [viewers, setViewers] = useState<Array<{
    id: string;
    viewer_id: string;
    viewed_at: string;
    profile?: {
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    };
  }>>([]);
  const [viewCount, setViewCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial viewers
  useEffect(() => {
    if (!storyId) {
      setViewers([]);
      setViewCount(0);
      setIsLoading(false);
      return;
    }

    const fetchViewers = async () => {
      try {
        const { data, error } = await supabase
          .from('story_views')
          .select(`
            id,
            viewer_id,
            viewed_at,
            profile:profiles!story_views_viewer_id_fkey (
              id,
              username,
              display_name,
              avatar_url
            )
          `)
          .eq('story_id', storyId)
          .order('viewed_at', { ascending: false });

        if (error) throw error;
        
        setViewers(data as any || []);
        setViewCount(data?.length || 0);
      } catch (error) {
        console.error('Error fetching story viewers:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchViewers();
  }, [storyId]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!storyId) return;

    const channel = supabase
      .channel(`story-viewers-${storyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'story_views',
          filter: `story_id=eq.${storyId}`,
        },
        async (payload) => {
          // Fetch profile for new viewer
          const { data: viewerProfile } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .eq('id', payload.new.viewer_id)
            .single();

          if (viewerProfile) {
            const newViewer = {
              id: payload.new.id as string,
              viewer_id: payload.new.viewer_id as string,
              viewed_at: payload.new.viewed_at as string,
              profile: viewerProfile,
            };

            setViewers(prev => [newViewer, ...prev.filter(v => v.viewer_id !== newViewer.viewer_id)]);
            setViewCount(prev => prev + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'story_views',
          filter: `story_id=eq.${storyId}`,
        },
        (payload) => {
          setViewers(prev => prev.filter(v => v.id !== payload.old.id));
          setViewCount(prev => Math.max(0, prev - 1));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [storyId]);

  return { viewers, viewCount, isLoading };
}

/**
 * Hook for real-time story views_count on stories table
 * Useful for displaying view count in story archive/thumbnails
 */
export function useRealtimeStoryCount(storyId: string | null) {
  const [viewsCount, setViewsCount] = useState(0);

  // Subscribe to story table updates for views_count
  useEffect(() => {
    if (!storyId) return;

    // Fetch initial count
    const fetchCount = async () => {
      const { data } = await supabase
        .from('stories')
        .select('views_count')
        .eq('id', storyId)
        .single();
      
      if (data) {
        setViewsCount(data.views_count || 0);
      }
    };

    fetchCount();

    const channel = supabase
      .channel(`story-count-${storyId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stories',
          filter: `id=eq.${storyId}`,
        },
        (payload) => {
          setViewsCount(payload.new.views_count || 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [storyId]);

  return viewsCount;
}
