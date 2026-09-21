import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  attachProfiles,
  createProfileEmbedGuard,
  runWithProfileEmbedFallback,
  type EmbedQueryResult,
} from '@/lib/profileEmbed';

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  likes_count: number;
  created_at: string;
  is_pinned?: boolean;
  pinned_at?: string | null;
  pinned_by?: string | null;
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

// Named FK embed faqat `comments_user_id_fkey` constraint bazada bo'lsa
// ishlaydi. Bo'lmasa PostgREST butun so'rovni rad etadi, shuning uchun
// embedsiz variant ham saqlanadi (profil keyin alohida olinadi).
const COMMENT_SELECT_WITH_PROFILE = `
  *,
  profile:profiles!comments_user_id_fkey (
    id,
    username,
    display_name,
    avatar_url,
    is_verified
  )
`;

const COMMENT_SELECT_PLAIN = '*';

const commentEmbedGuard = createProfileEmbedGuard();

type CommentRow = Record<string, unknown>;

function buildCommentTree(
  data: Comment[],
  likedIds: Set<string>,
): Comment[] {
  const commentsMap = new Map<string, Comment>();
  const rootComments: Comment[] = [];

  data.forEach((comment) => {
    commentsMap.set(comment.id, {
      ...comment,
      is_liked: likedIds.has(comment.id),
      replies: [],
    });
  });

  data.forEach((comment) => {
    const item = commentsMap.get(comment.id);
    if (!item) return;

    if (comment.parent_id) {
      const parent = commentsMap.get(comment.parent_id);
      if (parent) {
        parent.replies?.push(item);
        return;
      }
    }

    rootComments.push(item);
  });

  const sortReplies = (items: Comment[]) => {
    items.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    items.forEach((item) => {
      if (item.replies?.length) sortReplies(item.replies);
    });
  };

  // Pinned comments stay at the top, newest pin first. Ordinary comments keep
  // their conversational chronological order; replies are never promoted.
  rootComments.sort((a, b) => {
    const pinDelta = Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned));
    if (pinDelta !== 0) return pinDelta;

    if (a.is_pinned && b.is_pinned) {
      const aPinnedAt = a.pinned_at ? new Date(a.pinned_at).getTime() : 0;
      const bPinnedAt = b.pinned_at ? new Date(b.pinned_at).getTime() : 0;
      if (aPinnedAt !== bPinnedAt) return bPinnedAt - aPinnedAt;
    }

    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  rootComments.forEach((item) => {
    if (item.replies?.length) sortReplies(item.replies);
  });

  return rootComments;
}

function findCommentRecursive(
  items: Comment[],
  commentId: string,
): Comment | null {
  for (const item of items) {
    if (item.id === commentId) return item;
    if (item.replies?.length) {
      const nested = findCommentRecursive(item.replies, commentId);
      if (nested) return nested;
    }
  }
  return null;
}

export function useComments(postId: string | null) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [postOwnerId, setPostOwnerId] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchComments = useCallback(async () => {
    if (!postId) return;
    setIsLoading(true);

    try {
      const [commentsResult, postResult] = await Promise.all([
        runWithProfileEmbedFallback<CommentRow>(
        commentEmbedGuard,
        (select) =>
          supabase
            .from('comments')
            .select(select)
            .eq('post_id', postId)
            .order('created_at', { ascending: true }) as unknown as PromiseLike<
            EmbedQueryResult<CommentRow>
          >,
          {
            embedSelect: COMMENT_SELECT_WITH_PROFILE,
            plainSelect: COMMENT_SELECT_PLAIN,
          },
        ),
        supabase
          .from('posts')
          .select('user_id')
          .eq('id', postId)
          .maybeSingle(),
      ]);

      const { data: rows, error } = commentsResult;
      if (error) throw error;
      if (postResult.error) throw postResult.error;

      setPostOwnerId(postResult.data?.user_id ?? null);
      const data = (rows ?? []) as unknown as Comment[];
      let likedIds = new Set<string>();

      if (user && data.length > 0) {
        const commentIds = data.map((comment) => comment.id);
        const { data: likes } = await supabase
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', commentIds);

        likedIds = new Set(likes?.map((like) => like.comment_id) || []);
      }

      // Tree har doim quriladi — login bo'lmagan foydalanuvchi ham nested
      // reply'larni to'g'ri ko'rishi kerak.
      setComments(buildCommentTree(data, likedIds));
    } catch (error) {
      console.error('Error fetching comments:', error);
      toast.error("Izohlarni yuklab bo'lmadi");
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
      // Insert dan keyin embed talab qilmaymiz: aks holda FK nomi yo'q bo'lsa
      // izoh saqlangan bo'lsa ham xato ko'rsatilardi.
      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content,
          parent_id: parentId || null,
        })
        .select(COMMENT_SELECT_PLAIN)
        .single();

      if (error) throw error;

      const [withProfile] = await attachProfiles([
        (data ?? {}) as CommentRow,
      ]);

      toast.success('Comment added');
      return withProfile as unknown as Comment;
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
      return null;
    }
  }, [user, postId]);

  const likeComment = useCallback(async (commentId: string) => {
    if (!user) return;

    const comment = findCommentRecursive(comments, commentId);
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

  const togglePinComment = useCallback(async (commentId: string, pinned: boolean) => {
    if (!user || !postId || postOwnerId !== user.id) return false;

    try {
      const rpc = supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message?: string } | null }>;

      const { error } = await rpc('toggle_comment_pin', {
        p_comment_id: commentId,
        p_pinned: pinned,
      });

      if (error) throw error;
      toast.success(pinned ? 'Izoh mahkamlandi' : 'Izoh mahkamlashdan olindi');
      await fetchComments();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      console.error('Error toggling comment pin:', error);
      toast.error(
        message.includes('at most 3')
          ? 'Bitta postga ko‘pi bilan 3 ta izohni mahkamlash mumkin'
          : 'Izohni mahkamlab bo‘lmadi',
      );
      return false;
    }
  }, [fetchComments, postId, postOwnerId, user]);

  return {
    comments,
    isLoading,
    addComment,
    likeComment,
    deleteComment,
    togglePinComment,
    canPinComments: Boolean(user && postOwnerId === user.id),
    refresh: fetchComments,
  };
}
