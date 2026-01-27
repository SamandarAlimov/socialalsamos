import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Collaboration {
  id: string;
  post_id: string;
  user_id: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  responded_at: string | null;
  post?: {
    id: string;
    content: string | null;
    media_urls: string[];
    media_type: string;
    created_at: string;
  };
  inviter?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
  collaborator?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

export function useCollaborations() {
  const { user } = useAuth();
  const [pendingRequests, setPendingRequests] = useState<Collaboration[]>([]);
  const [sentRequests, setSentRequests] = useState<Collaboration[]>([]);
  const [acceptedCollaborations, setAcceptedCollaborations] = useState<Collaboration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPendingRequests = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('post_collaborators')
        .select(`
          *,
          post:posts!post_collaborators_post_id_fkey (
            id,
            content,
            media_urls,
            media_type,
            created_at
          ),
          inviter:profiles!post_collaborators_invited_by_fkey (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingRequests((data || []) as Collaboration[]);
    } catch (error) {
      console.error('Error fetching pending requests:', error);
    }
  }, [user]);

  const fetchSentRequests = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('post_collaborators')
        .select(`
          *,
          post:posts!post_collaborators_post_id_fkey (
            id,
            content,
            media_urls,
            media_type,
            created_at
          ),
          collaborator:profiles!post_collaborators_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .eq('invited_by', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSentRequests((data || []) as Collaboration[]);
    } catch (error) {
      console.error('Error fetching sent requests:', error);
    }
  }, [user]);

  const fetchAcceptedCollaborations = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('post_collaborators')
        .select(`
          *,
          post:posts!post_collaborators_post_id_fkey (
            id,
            content,
            media_urls,
            media_type,
            created_at
          ),
          inviter:profiles!post_collaborators_invited_by_fkey (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          ),
          collaborator:profiles!post_collaborators_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .eq('status', 'accepted')
        .or(`user_id.eq.${user.id},invited_by.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAcceptedCollaborations((data || []) as Collaboration[]);
    } catch (error) {
      console.error('Error fetching accepted collaborations:', error);
    }
  }, [user]);

  const inviteCollaborator = useCallback(async (postId: string, userId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('post_collaborators')
        .insert({
          post_id: postId,
          user_id: userId,
          invited_by: user.id,
          status: 'pending'
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('User has already been invited to collaborate');
          return false;
        }
        throw error;
      }

      toast.success('Collaboration request sent!');
      fetchSentRequests();
      return true;
    } catch (error) {
      console.error('Error inviting collaborator:', error);
      toast.error('Failed to send collaboration request');
      return false;
    }
  }, [user, fetchSentRequests]);

  const respondToRequest = useCallback(async (collaborationId: string, accept: boolean) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('post_collaborators')
        .update({
          status: accept ? 'accepted' : 'declined',
          responded_at: new Date().toISOString()
        })
        .eq('id', collaborationId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success(accept ? 'Collaboration accepted!' : 'Collaboration declined');
      fetchPendingRequests();
      if (accept) fetchAcceptedCollaborations();
      return true;
    } catch (error) {
      console.error('Error responding to request:', error);
      toast.error('Failed to respond to request');
      return false;
    }
  }, [user, fetchPendingRequests, fetchAcceptedCollaborations]);

  const cancelRequest = useCallback(async (collaborationId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('post_collaborators')
        .delete()
        .eq('id', collaborationId);

      if (error) throw error;

      toast.success('Collaboration request cancelled');
      fetchSentRequests();
      return true;
    } catch (error) {
      console.error('Error cancelling request:', error);
      toast.error('Failed to cancel request');
      return false;
    }
  }, [user, fetchSentRequests]);

  const getPostCollaborators = useCallback(async (postId: string) => {
    const { data, error } = await supabase
      .from('post_collaborators')
      .select(`
        *,
        collaborator:profiles!post_collaborators_user_id_fkey (
          id,
          username,
          display_name,
          avatar_url,
          is_verified
        )
      `)
      .eq('post_id', postId)
      .eq('status', 'accepted');

    if (error) {
      console.error('Error fetching post collaborators:', error);
      return [];
    }

    return data as Collaboration[];
  }, []);

  useEffect(() => {
    if (user) {
      setIsLoading(true);
      Promise.all([
        fetchPendingRequests(),
        fetchSentRequests(),
        fetchAcceptedCollaborations()
      ]).finally(() => setIsLoading(false));
    }
  }, [user, fetchPendingRequests, fetchSentRequests, fetchAcceptedCollaborations]);

  // Real-time subscription for collaboration updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('collaborations-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_collaborators',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          fetchPendingRequests();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_collaborators',
          filter: `invited_by=eq.${user.id}`
        },
        () => {
          fetchSentRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchPendingRequests, fetchSentRequests]);

  return {
    pendingRequests,
    sentRequests,
    acceptedCollaborations,
    isLoading,
    inviteCollaborator,
    respondToRequest,
    cancelRequest,
    getPostCollaborators,
    refresh: () => {
      fetchPendingRequests();
      fetchSentRequests();
      fetchAcceptedCollaborations();
    }
  };
}
