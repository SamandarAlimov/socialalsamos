import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface UserPost {
  id: string;
  user_id: string;
  content: string | null;
  media_urls: string[];
  media_type: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  bookmarks_count: number;
  is_pinned: boolean;
  visibility: string;
  created_at: string;
  profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
  is_liked?: boolean;
}

export function useUserPosts(userId: string | undefined) {
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchPosts = useCallback(async () => {
    if (!userId) return;
    
    setIsLoading(true);

    try {
      // If viewing own profile, show all posts
      // If viewing other user's profile, show only public posts
      const isOwnProfile = user?.id === userId;
      
      let query = supabase
        .from('posts')
        .select(`
          *,
          profile:profiles!posts_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .eq('user_id', userId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      // Only filter by visibility for other users' profiles
      if (!isOwnProfile) {
        query = query.eq('visibility', 'public');
      }

      const { data, error } = await query;

      if (error) throw error;

      // Get liked status for current user
      if (user && data) {
        const postIds = data.map(p => p.id);
        
        const { data: likesData } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user.id)
          .in('post_id', postIds);

        const likedPostIds = new Set(likesData?.map(l => l.post_id) || []);

        const postsWithStatus = data.map(post => ({
          ...post,
          media_urls: post.media_urls || [],
          is_pinned: post.is_pinned || false,
          is_liked: likedPostIds.has(post.id),
        }));

        setPosts(postsWithStatus as UserPost[]);
      } else {
        setPosts((data || []).map(post => ({
          ...post,
          media_urls: post.media_urls || [],
          is_pinned: post.is_pinned || false,
        })) as UserPost[]);
      }
    } catch (error) {
      console.error('Error fetching user posts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, user?.id]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Real-time subscription for post counts
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`user-posts-realtime-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_likes',
        },
        (payload) => {
          const postId = (payload.new as any)?.post_id || (payload.old as any)?.post_id;
          setPosts(prev => prev.map(p => {
            if (p.id !== postId) return p;
            const delta = payload.eventType === 'INSERT' ? 1 : payload.eventType === 'DELETE' ? -1 : 0;
            const isLiked = payload.eventType === 'INSERT' && (payload.new as any)?.user_id === user?.id
              ? true 
              : payload.eventType === 'DELETE' && (payload.old as any)?.user_id === user?.id
              ? false 
              : p.is_liked;
            return { ...p, likes_count: Math.max(0, p.likes_count + delta), is_liked: isLiked };
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
        },
        (payload) => {
          const postId = (payload.new as any)?.post_id || (payload.old as any)?.post_id;
          setPosts(prev => prev.map(p => {
            if (p.id !== postId) return p;
            const delta = payload.eventType === 'INSERT' ? 1 : payload.eventType === 'DELETE' ? -1 : 0;
            return { ...p, comments_count: Math.max(0, p.comments_count + delta) };
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'posts',
        },
        (payload) => {
          const newData = payload.new as any;
          if (!newData?.id) return;
          setPosts(prev => prev.map(p => {
            if (p.id !== newData.id) return p;
            return {
              ...p,
              likes_count: newData.likes_count ?? p.likes_count,
              comments_count: newData.comments_count ?? p.comments_count,
              shares_count: newData.shares_count ?? p.shares_count,
              bookmarks_count: newData.bookmarks_count ?? p.bookmarks_count,
            };
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, user?.id]);

  const likePost = useCallback(async (postId: string) => {
    if (!user) return;

    const post = posts.find(p => p.id === postId);
    if (!post) return;

    try {
      if (post.is_liked) {
        await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id);

        setPosts(prev => prev.map(p => 
          p.id === postId 
            ? { ...p, is_liked: false, likes_count: p.likes_count - 1 }
            : p
        ));
      } else {
        await supabase
          .from('post_likes')
          .insert({ post_id: postId, user_id: user.id });

        setPosts(prev => prev.map(p => 
          p.id === postId 
            ? { ...p, is_liked: true, likes_count: p.likes_count + 1 }
            : p
        ));
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  }, [user, posts]);

  const deletePost = useCallback(async (postId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', user.id);

      if (error) throw error;

      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (error) {
      console.error('Error deleting post:', error);
      throw error;
    }
  }, [user]);

  const pinPost = useCallback(async (postId: string) => {
    if (!user) return;

    const post = posts.find(p => p.id === postId);
    if (!post) return;

    try {
      const { error } = await supabase
        .from('posts')
        .update({ is_pinned: !post.is_pinned })
        .eq('id', postId)
        .eq('user_id', user.id);

      if (error) throw error;

      setPosts(prev => prev.map(p => 
        p.id === postId 
          ? { ...p, is_pinned: !p.is_pinned }
          : p
      ));
    } catch (error) {
      console.error('Error pinning post:', error);
      throw error;
    }
  }, [user, posts]);

  return {
    posts,
    isLoading,
    refresh: fetchPosts,
    likePost,
    deletePost,
    pinPost,
  };
}
