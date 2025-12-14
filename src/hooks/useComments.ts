import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  likes_count: number;
  created_at: string;
  profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
  is_liked?: boolean;
  replies?: Comment[];
}

export function useComments(postId: string | null) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  const fetchComments = useCallback(async () => {
    if (!postId) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('comments')
        .select(`
          *,
          profile:profiles!comments_user_id_fkey (
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

      // Check likes if user is logged in
      if (user && data) {
        const commentIds = data.map(c => c.id);
        const { data: likes } = await supabase
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', commentIds);

        const likedIds = new Set(likes?.map(l => l.comment_id) || []);
        
        // Organize into tree structure
        const commentsMap = new Map<string, Comment>();
        const rootComments: Comment[] = [];

        data.forEach(comment => {
          commentsMap.set(comment.id, {
            ...comment,
            is_liked: likedIds.has(comment.id),
            replies: []
          });
        });

        data.forEach(comment => {
          const commentWithReplies = commentsMap.get(comment.id)!;
          if (comment.parent_id) {
            const parent = commentsMap.get(comment.parent_id);
            if (parent) {
              parent.replies?.push(commentWithReplies);
            }
          } else {
            rootComments.push(commentWithReplies);
          }
        });

        setComments(rootComments);
      } else {
        setComments(data as Comment[]);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [postId, user]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Real-time subscription
  useEffect(() => {
    if (!postId) return;

    const channel = supabase
      .channel(`comments:${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${postId}`,
        },
        () => {
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId, fetchComments]);

  const addComment = useCallback(async (content: string, parentId?: string) => {
    if (!user || !postId) return null;

    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content,
          parent_id: parentId || null,
        })
        .select(`
          *,
          profile:profiles!comments_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .single();

      if (error) throw error;

      toast.success('Comment added');
      return data;
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
      return null;
    }
  }, [user, postId]);

  const likeComment = useCallback(async (commentId: string) => {
    if (!user) return;

    const comment = comments.find(c => c.id === commentId) || 
                   comments.flatMap(c => c.replies || []).find(c => c.id === commentId);
    if (!comment) return;

    try {
      if (comment.is_liked) {
        await supabase
          .from('comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('comment_likes')
          .insert({ comment_id: commentId, user_id: user.id });
      }
      fetchComments();
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  }, [user, comments, fetchComments]);

  const deleteComment = useCallback(async (commentId: string) => {
    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      toast.success('Comment deleted');
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Failed to delete comment');
    }
  }, []);

  return {
    comments,
    isLoading,
    addComment,
    likeComment,
    deleteComment,
    refresh: fetchComments,
  };
}
