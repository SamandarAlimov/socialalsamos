import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { supabase } from '@/integrations/supabase/client';

export type CollaborationStatus = 'pending' | 'accepted' | 'declined';

export interface PostCollaboratorProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified?: boolean;
}

export interface PostCollaborator {
  id: string;
  post_id: string;
  user_id: string;
  invited_by: string;
  status: CollaborationStatus;
  role: string;
  created_at: string;
  responded_at: string | null;
  profile: PostCollaboratorProfile | null;
}

export function usePostCollaborators(postId: string | null | undefined) {
  const [collaborators, setCollaborators] = useState<PostCollaborator[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(postId));

  const load = useCallback(async () => {
    if (!postId) {
      setCollaborators([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await db
        .from('post_collaborators')
        .select(`
          id,
          post_id,
          user_id,
          invited_by,
          status,
          role,
          created_at,
          responded_at,
          profile:profiles!post_collaborators_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setCollaborators((data ?? []) as unknown as PostCollaborator[]);
    } catch (error) {
      console.error('Hammualliflarni yuklash xatosi:', error);
      setCollaborators([]);
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!postId) return;

    const channel = supabase
      .channel(`post-collaborators-${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_collaborators',
          filter: `post_id=eq.${postId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, postId]);

  const invite = useCallback(
    async (userId: string) => {
      if (!postId) throw new Error('Post topilmadi');
      const { error } = await db.rpc('invite_post_collaborator', {
        p_post_id: postId,
        p_user_id: userId,
      });
      if (error) throw error;
      await load();
    },
    [load, postId],
  );

  const respond = useCallback(
    async (collaborationId: string, accept: boolean) => {
      const { error } = await db.rpc('respond_post_collaboration', {
        p_collaboration_id: collaborationId,
        p_accept: accept,
      });
      if (error) throw error;
      await load();
    },
    [load],
  );

  const remove = useCallback(
    async (collaborationId: string) => {
      const { error } = await db.rpc('remove_post_collaborator', {
        p_collaboration_id: collaborationId,
      });
      if (error) throw error;
      await load();
    },
    [load],
  );

  const leave = useCallback(
    async (collaborationId: string) => {
      const { error } = await db.rpc('leave_post_collaboration', {
        p_collaboration_id: collaborationId,
      });
      if (error) throw error;
      await load();
    },
    [load],
  );

  return {
    collaborators,
    isLoading,
    refresh: load,
    invite,
    respond,
    remove,
    leave,
  };
}
