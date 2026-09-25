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

export interface StoryHighlightDraftItem {
  story_id: string;
  media_url: string;
  media_type: string;
  caption?: string | null;
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

  const createHighlight = useCallback(async (
    name: string,
    coverUrl?: string,
    initialItems: StoryHighlightDraftItem[] = [],
  ) => {
    if (!user) {
      toast.error('Please login to create highlights');
      return null;
    }

    let createdHighlightId: string | null = null;

    try {
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
      createdHighlightId = data.id;

      if (initialItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('story_highlight_items')
          .insert(
            initialItems.map((item, index) => ({
              highlight_id: data.id,
              story_id: item.story_id,
              media_url: item.media_url,
              media_type: item.media_type,
              caption: item.caption || null,
              position: index,
            })),
          );

        if (itemsError) throw itemsError;
      }

      toast.success('Highlight created');
      await fetchHighlights();
      return data;
    } catch (error) {
      if (createdHighlightId) {
        await supabase
          .from('story_highlights')
          .delete()
          .eq('id', createdHighlightId)
          .eq('user_id', user.id);
      }
      console.error('Error creating highlight:', error);
      toast.error('Failed to create highlight');
      return null;
    }
  }, [user, highlights, fetchHighlights]);

  const updateHighlight = useCallback(async (
    highlightId: string,
    updates: { name?: string; cover_url?: string | null },
  ) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('story_highlights')
        .update(updates)
        .eq('id', highlightId)
        .eq('user_id', user.id);

      if (error) throw error;

      await fetchHighlights();
      return true;
    } catch (error) {
      console.error('Error updating highlight:', error);
      toast.error('Failed to update highlight');
      return false;
    }
  }, [user, fetchHighlights]);

  const syncHighlightItems = useCallback(async (
    highlightId: string,
    items: StoryHighlightDraftItem[],
  ) => {
    if (!user) return false;

    try {
      const { data: ownedHighlight, error: ownerError } = await supabase
        .from('story_highlights')
        .select('id')
        .eq('id', highlightId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (ownerError) throw ownerError;
      if (!ownedHighlight) throw new Error('Highlight not found');

      const { data: existingRows, error: existingError } = await supabase
        .from('story_highlight_items')
        .select('story_id')
        .eq('highlight_id', highlightId);

      if (existingError) throw existingError;

      const nextIds = new Set(items.map((item) => item.story_id));
      const removedIds = (existingRows || [])
        .map((row) => row.story_id)
        .filter((storyId) => !nextIds.has(storyId));

      if (removedIds.length > 0) {
        const { error: removeError } = await supabase
          .from('story_highlight_items')
          .delete()
          .eq('highlight_id', highlightId)
          .in('story_id', removedIds);
        if (removeError) throw removeError;
      }

      for (const [position, item] of items.entries()) {
        const { error: upsertError } = await supabase
          .from('story_highlight_items')
          .upsert(
            {
              highlight_id: highlightId,
              story_id: item.story_id,
              media_url: item.media_url,
              media_type: item.media_type,
              caption: item.caption || null,
              position,
            },
            { onConflict: 'highlight_id,story_id' },
          );
        if (upsertError) throw upsertError;
      }

      await fetchHighlights();
      return true;
    } catch (error) {
      console.error('Error syncing highlight stories:', error);
      toast.error('Tanlangan storylarini yangilab bo‘lmadi');
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
      await fetchHighlights();
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
    caption?: string,
  ) => {
    if (!user) return false;

    try {
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
      await fetchHighlights();
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
      const highlight = highlights.find((item) => item.id === highlightId);
      const removedItem = highlight?.items?.find((item) => item.story_id === storyId);
      const coverWasRemoved = Boolean(
        highlight?.cover_url && removedItem?.media_url === highlight.cover_url,
      );

      const { error } = await supabase
        .from('story_highlight_items')
        .delete()
        .eq('highlight_id', highlightId)
        .eq('story_id', storyId);

      if (error) throw error;

      if (coverWasRemoved && highlight) {
        const remainingItems = (highlight.items || []).filter((item) => item.story_id !== storyId);
        const fallbackCover =
          remainingItems.find((item) => item.media_type !== 'video')?.media_url ||
          remainingItems[0]?.media_url ||
          null;

        const { error: coverError } = await supabase
          .from('story_highlights')
          .update({ cover_url: fallbackCover })
          .eq('id', highlightId)
          .eq('user_id', user.id);

        if (coverError) throw coverError;
      }

      toast.success('Tanlangandan olib tashlandi');
      await fetchHighlights();
      return true;
    } catch (error) {
      console.error('Error removing story from highlight:', error);
      toast.error('Tanlangandan olib tashlab bo‘lmadi');
      return false;
    }
  }, [user, highlights, fetchHighlights]);

  const reorderHighlights = useCallback(async (highlightIds: string[]) => {
    if (!user) return false;

    try {
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

      await fetchHighlights();
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
    syncHighlightItems,
    deleteHighlight,
    addStoryToHighlight,
    removeStoryFromHighlight,
    reorderHighlights,
    isOwnProfile: user?.id === targetUserId,
  };
}
