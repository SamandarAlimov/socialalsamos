import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { resolveStorageUrl } from '@/lib/mediaUpload';
import { db } from '@/lib/db';

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  post_id?: string | null;
  media_id?: string | null;
  storage_bucket?: string | null;
  storage_key?: string | null;
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

type StoryVisibility = 'public' | 'friends' | 'private';

function storyPublishPayload(
  mediaUrl: string,
  mediaType: string,
  caption: string | undefined,
  visibility: StoryVisibility,
) {
  const kind = mediaType === 'video' ? 'video' : 'image';

  return {
    content: caption?.trim() ?? '',
    mediaUrls: visibility === 'public' ? [mediaUrl] : [],
    mediaType: kind,
    collaboratorIds: [],
    visibility,
    postKind: 'story',
    scheduledAt: null,
    media: [
      {
        storageUrl: mediaUrl,
        kind,
      },
    ],
    poll: null,
    location: null,
    music: null,
    formattedContent: null,
    editState: null,
  };
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
        .or('is_active.is.null,is_active.eq.true')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const resolvedStories = await Promise.all(
        (data || []).map(async (story: any) => {
          try {
            const mediaUrl = await resolveStorageUrl(
              String(story.media_url ?? ''),
              story.storage_bucket ? String(story.storage_bucket) : null,
              story.storage_key ? String(story.storage_key) : null,
            );

            return { ...story, media_url: mediaUrl } as Story & {
              profile?: Story['profile'];
            };
          } catch (resolveError) {
            console.warn('Story media URL olinmadi:', resolveError);
            return { ...story, media_url: '' } as Story & {
              profile?: Story['profile'];
            };
          }
        }),
      );

      const groupsMap = new Map<string, StoryGroup>();

      resolvedStories.forEach((story) => {
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
            has_unviewed: true,
            all_story_ids: [],
          });
        }

        const group = groupsMap.get(userId);
        if (group) {
          group.stories.push(story);
          group.all_story_ids.push(story.id);
        }
      });

      // Current user's stories always stay first in the Home rail.
      const groups = Array.from(groupsMap.values());
      if (user) {
        const userIndex = groups.findIndex((group) => group.user_id === user.id);
        if (userIndex > 0) {
          const [userGroup] = groups.splice(userIndex, 1);
          groups.unshift(userGroup);
        }
      }

      setStoryGroups(groups);
    } catch (error) {
      console.error('Error fetching stories:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  /**
   * Programmatic compatibility API. The visible Create UI uses StoryComposer,
   * but old callers must still publish through the canonical linked graph.
   * Direct `stories.insert()` is deliberately forbidden here.
   */
  const createStory = useCallback(async (
    mediaUrl: string,
    mediaType: string,
    caption?: string,
    visibility: StoryVisibility = 'public',
  ) => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'Story yaratish uchun tizimga kiring',
        variant: 'destructive',
      });
      return null;
    }

    if (mediaType !== 'image' && mediaType !== 'video') {
      toast({
        title: 'Story media turi noto‘g‘ri',
        description: 'Story faqat rasm yoki video bo‘lishi mumkin.',
        variant: 'destructive',
      });
      return null;
    }

    try {
      const { data, error } = await db.rpc('publish_story_draft', {
        p_payload: storyPublishPayload(mediaUrl, mediaType, caption, visibility),
      });

      if (error) throw error;

      await fetchStories();
      toast({
        title: 'Story joylandi',
        description: 'Story 24 soat davomida ko‘rinadi.',
      });

      return data;
    } catch (error) {
      console.error('Error creating story:', error);
      toast({
        title: 'Story joylanmadi',
        description:
          error instanceof Error
            ? error.message
            : 'Story yaratishda xatolik yuz berdi',
        variant: 'destructive',
      });
      return null;
    }
  }, [user, toast, fetchStories]);

  /**
   * Unified Story graph is deleted transactionally by the DB RPC. A direct
   * stories.delete() would leave the linked post/media/stickers orphaned.
   */
  const deleteStory = useCallback(async (storyId: string) => {
    if (!user) return false;

    try {
      const { error } = await db.rpc('delete_story', {
        p_story_id: storyId,
      });

      if (error) throw error;

      await fetchStories();
      toast({
        title: 'Story o‘chirildi',
        description: 'Story va unga bog‘langan ma’lumotlar olib tashlandi.',
      });
      return true;
    } catch (error) {
      console.error('Error deleting story:', error);
      toast({
        title: 'Story o‘chirilmadi',
        description:
          error instanceof Error
            ? error.message
            : 'Storini o‘chirishda xatolik yuz berdi',
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchStories, toast, user]);

  useEffect(() => {
    void fetchStories();
  }, [fetchStories]);

  useEffect(() => {
    const storiesChannel = supabase
      .channel('stories-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stories',
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
            void fetchStories();
          } else if (payload.eventType === 'UPDATE') {
            const updatedStory = payload.new as Partial<Story> & { id?: string };
            if (!updatedStory.id) return;

            // Draft activation/deactivation changes rail visibility, so those
            // updates require a canonical refetch. View counters can stay local.
            if ('is_active' in (payload.new as Record<string, unknown>)) {
              void fetchStories();
              return;
            }

            setStoryGroups((previous) =>
              previous.map((group) => ({
                ...group,
                stories: group.stories.map((story) =>
                  story.id === updatedStory.id
                    ? {
                        ...story,
                        views_count:
                          typeof updatedStory.views_count === 'number'
                            ? updatedStory.views_count
                            : story.views_count,
                      }
                    : story,
                ),
              })),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(storiesChannel);
    };
  }, [fetchStories]);

  return {
    storyGroups,
    isLoading,
    refresh: fetchStories,
    createStory,
    deleteStory,
  };
}
