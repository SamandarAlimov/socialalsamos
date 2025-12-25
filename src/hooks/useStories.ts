import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  views_count: number;
  expires_at: string;
  created_at: string;
  profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

export interface StoryGroup {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  stories: Story[];
  has_unviewed: boolean;
  all_story_ids: string[];
}

export function useStories() {
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchStories = useCallback(async () => {
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('stories')
        .select(`
          *,
          profile:profiles!stories_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group stories by user
      const groupsMap = new Map<string, StoryGroup>();

      (data || []).forEach(story => {
        const userId = story.user_id;
        const profile = story.profile;

        if (!groupsMap.has(userId)) {
          groupsMap.set(userId, {
            user_id: userId,
            username: profile?.username ?? null,
            display_name: profile?.display_name ?? null,
            avatar_url: profile?.avatar_url ?? null,
            is_verified: profile?.is_verified ?? false,
            stories: [],
            has_unviewed: true, // Will be calculated by component using useStoryViews
            all_story_ids: [],
          });
        }

        const group = groupsMap.get(userId);
        if (group) {
          group.stories.push(story as Story);
          group.all_story_ids.push(story.id);
        }
      });

      // Put current user's stories first
      const groups = Array.from(groupsMap.values());
      if (user) {
        const userIndex = groups.findIndex(g => g.user_id === user.id);
        if (userIndex > 0) {
          const [userGroup] = groups.splice(userIndex, 1);
          groups.unshift(userGroup);
        }
      }

      setStoryGroups(groups);
    } catch (error: any) {
      console.error('Error fetching stories:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const createStory = useCallback(async (mediaUrl: string, mediaType: string, caption?: string) => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to create a story',
        variant: 'destructive',
      });
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('stories')
        .insert({
          user_id: user.id,
          media_url: mediaUrl,
          media_type: mediaType,
          caption,
        })
        .select()
        .single();

      if (error) throw error;

      fetchStories();
      toast({
        title: 'Story Created',
        description: 'Your story is now live!',
      });

      return data;
    } catch (error: any) {
      console.error('Error creating story:', error);
      toast({
        title: 'Error',
        description: 'Failed to create story',
        variant: 'destructive',
      });
      return null;
    }
  }, [user, toast, fetchStories]);

  const deleteStory = useCallback(async (storyId: string) => {
    try {
      const { error } = await supabase
        .from('stories')
        .delete()
        .eq('id', storyId);

      if (error) throw error;

      fetchStories();
      toast({
        title: 'Story Deleted',
        description: 'Your story has been removed.',
      });
    } catch (error: any) {
      console.error('Error deleting story:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete story',
        variant: 'destructive',
      });
    }
  }, [toast, fetchStories]);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  return {
    storyGroups,
    isLoading,
    refresh: fetchStories,
    createStory,
    deleteStory,
  };
}
