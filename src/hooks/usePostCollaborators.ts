import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '@/lib/db';
import { supabase } from '@/integrations/supabase/client';
import { isMissingStructuredPostSchemaError } from '@/lib/structuredPostSchema';

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

/** Joriy foydalanuvchi id-si (fallback yozuvlar uchun kerak). */
async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('Avval tizimga kiring');
  return id;
}

export function usePostCollaborators(postId: string | null | undefined) {
  const [collaborators, setCollaborators] = useState<PostCollaborator[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(postId));

  /*
    Bir postda hook ikki joyda ishlatiladi (avatar to'plami va hammuallif
    satri). Realtime kanal nomi bir xil bo'lsa ikkinchi obuna birinchisini
    buzadi, shuning uchun har bir nusxaga alohida nom beramiz.
  */
  const instanceIdRef = useRef(Math.random().toString(36).slice(2, 10));

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
      .channel(`post-collaborators-${postId}-${instanceIdRef.current}`)
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

      // Serverda RPC hali mavjud bo'lmasa jadvalga to'g'ridan-to'g'ri yozamiz.
      if (error) {
        if (!isMissingStructuredPostSchemaError(error)) throw error;

        const invitedBy = await requireUserId();
        const { error: insertError } = await db.from('post_collaborators').insert({
          post_id: postId,
          user_id: userId,
          invited_by: invitedBy,
          status: 'pending',
          role: 'collaborator',
        });
        if (insertError) throw insertError;
      }

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

      if (error) {
        if (!isMissingStructuredPostSchemaError(error)) throw error;

        const userId = await requireUserId();
        const { error: updateError } = await db
          .from('post_collaborators')
          .update({
            status: accept ? 'accepted' : 'declined',
            responded_at: new Date().toISOString(),
          })
          .eq('id', collaborationId)
          .eq('user_id', userId);
        if (updateError) throw updateError;
      }

      await load();
    },
    [load],
  );

  const remove = useCallback(
    async (collaborationId: string) => {
      const { error } = await db.rpc('remove_post_collaborator', {
        p_collaboration_id: collaborationId,
      });

      if (error) {
        if (!isMissingStructuredPostSchemaError(error)) throw error;

        const { error: deleteError } = await db
          .from('post_collaborators')
          .delete()
          .eq('id', collaborationId);
        if (deleteError) throw deleteError;
      }

      await load();
    },
    [load],
  );

  const leave = useCallback(
    async (collaborationId: string) => {
      const { error } = await db.rpc('leave_post_collaboration', {
        p_collaboration_id: collaborationId,
      });

      if (error) {
        if (!isMissingStructuredPostSchemaError(error)) throw error;

        const userId = await requireUserId();
        const { error: deleteError } = await db
          .from('post_collaborators')
          .delete()
          .eq('id', collaborationId)
          .eq('user_id', userId);
        if (deleteError) throw deleteError;
      }

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
