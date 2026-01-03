import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface StoryHighlightItem {
  id: string;
  highlight_id: string;
  story_id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  position: number;
  created_at: string;
}

export interface StoryHighlight {
  id: string;
  user_id: string;
  name: string;
  cover_url: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  items?: StoryHighlightItem[];
}

export function useStoryHighlights(userId?: string) {
  const { user } = useAuth();
  const [highlights, setHighlights] = useState<StoryHighlight[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const targetUserId = userId || user?.id;

  const fetchHighlights = useCallback(async () => {
    if (!targetUserId) {
      setHighlights([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('story_highlights')
        .select(`
          *,
          items:story_highlight_items(*)
        `)
        .eq('user_id', targetUserId)
        .order('position', { ascending: true });

      if (error) throw error;
      
      // Sort items by position within each highlight
      const highlightsWithSortedItems = (data || []).map(h => ({
        ...h,
        items: (h.items || []).sort((a: StoryHighlightItem, b: StoryHighlightItem) => a.position - b.position),
      }));

      setHighlights(highlightsWithSortedItems as StoryHighlight[]);
    } catch (error) {
      console.error('Error fetching highlights:', error);
    } finally {
      setIsLoading(false);
    }
  }, [targetUserId]);

  const createHighlight = useCallback(async (name: string, coverUrl?: string) => {
    if (!user) {
      toast.error('Please login to create highlights');
      return null;
    }

    try {
      // Get max position
      const maxPosition = highlights.reduce((max, h) => Math.max(max, h.position), -1);

      const { data, error } = await supabase
        .from('story_highlights')
        .insert({
          user_id: user.id,
          name,
          cover_url: coverUrl || null,
          position: maxPosition + 1,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Highlight created');
      fetchHighlights();
      return data;
    } catch (error) {
      console.error('Error creating highlight:', error);
      toast.error('Failed to create highlight');
      return null;
    }
  }, [user, highlights, fetchHighlights]);

  const updateHighlight = useCallback(async (highlightId: string, updates: { name?: string; cover_url?: string }) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('story_highlights')
        .update(updates)
        .eq('id', highlightId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Highlight updated');
      fetchHighlights();
      return true;
    } catch (error) {
      console.error('Error updating highlight:', error);
      toast.error('Failed to update highlight');
      return false;
    }
  }, [user, fetchHighlights]);

  const deleteHighlight = useCallback(async (highlightId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('story_highlights')
        .delete()
        .eq('id', highlightId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Highlight deleted');
      fetchHighlights();
      return true;
    } catch (error) {
      console.error('Error deleting highlight:', error);
      toast.error('Failed to delete highlight');
      return false;
    }
  }, [user, fetchHighlights]);

  const addStoryToHighlight = useCallback(async (
    highlightId: string, 
    storyId: string, 
    mediaUrl: string, 
    mediaType: string, 
    caption?: string
  ) => {
    if (!user) return false;

    try {
      // Get max position in highlight
      const highlight = highlights.find(h => h.id === highlightId);
      const maxPosition = highlight?.items?.reduce((max, item) => Math.max(max, item.position), -1) ?? -1;

      const { error } = await supabase
        .from('story_highlight_items')
        .insert({
          highlight_id: highlightId,
          story_id: storyId,
          media_url: mediaUrl,
          media_type: mediaType,
          caption: caption || null,
          position: maxPosition + 1,
        });

      if (error) throw error;

      toast.success('Added to highlight');
      fetchHighlights();
      return true;
    } catch (error: any) {
      if (error.code === '23505') {
        toast.error('Story already in this highlight');
      } else {
        console.error('Error adding story to highlight:', error);
        toast.error('Failed to add to highlight');
      }
      return false;
    }
  }, [user, highlights, fetchHighlights]);

  const removeStoryFromHighlight = useCallback(async (highlightId: string, storyId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('story_highlight_items')
        .delete()
        .eq('highlight_id', highlightId)
        .eq('story_id', storyId);

      if (error) throw error;

      toast.success('Removed from highlight');
      fetchHighlights();
      return true;
    } catch (error) {
      console.error('Error removing story from highlight:', error);
      toast.error('Failed to remove from highlight');
      return false;
    }
  }, [user, fetchHighlights]);

  const reorderHighlights = useCallback(async (highlightIds: string[]) => {
    if (!user) return false;

    try {
      // Update positions
      const updates = highlightIds.map((id, index) => ({
        id,
        position: index,
      }));

      for (const update of updates) {
        await supabase
          .from('story_highlights')
          .update({ position: update.position })
          .eq('id', update.id)
          .eq('user_id', user.id);
      }

      fetchHighlights();
      return true;
    } catch (error) {
      console.error('Error reordering highlights:', error);
      toast.error('Failed to reorder highlights');
      return false;
    }
  }, [user, fetchHighlights]);

  useEffect(() => {
    fetchHighlights();
  }, [fetchHighlights]);

  return {
    highlights,
    isLoading,
    refresh: fetchHighlights,
    createHighlight,
    updateHighlight,
    deleteHighlight,
    addStoryToHighlight,
    removeStoryFromHighlight,
    reorderHighlights,
    isOwnProfile: user?.id === targetUserId,
  };
}
