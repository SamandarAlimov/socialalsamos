import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface VideoPost {
  id: string;
  user_id: string;
  content: string | null;
  media_urls: string[];
  media_type: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  bookmarks_count: number;
  created_at: string;
  profile?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
  is_liked?: boolean;
  is_bookmarked?: boolean;
}

export function useVideoPosts() {
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchVideos = useCallback(async () => {
    setIsLoading(true);

    try {
      const { data, error } = await supabase
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
        .eq('media_type', 'video')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      if (user && data) {
        const postIds = data.map(p => p.id);
        
        const { data: likesData } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user.id)
          .in('post_id', postIds);

        const likedPostIds = new Set(likesData?.map(l => l.post_id) || []);

        const videosWithStatus = data.map(post => ({
          ...post,
          is_liked: likedPostIds.has(post.id),
          is_bookmarked: false,
        }));

        setVideos(videosWithStatus as VideoPost[]);
      } else {
        setVideos((data || []) as VideoPost[]);
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const likeVideo = useCallback(async (postId: string) => {
    if (!user) return;

    const video = videos.find(v => v.id === postId);
    if (!video) return;

    try {
      if (video.is_liked) {
        await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id);

        setVideos(prev => prev.map(v => 
          v.id === postId 
            ? { ...v, is_liked: false, likes_count: v.likes_count - 1 }
            : v
        ));
      } else {
        await supabase
          .from('post_likes')
          .insert({ post_id: postId, user_id: user.id });

        setVideos(prev => prev.map(v => 
          v.id === postId 
            ? { ...v, is_liked: true, likes_count: v.likes_count + 1 }
            : v
        ));
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  }, [user, videos]);

  const toggleBookmark = useCallback((postId: string) => {
    setVideos(prev => prev.map(v => 
      v.id === postId 
        ? { ...v, is_bookmarked: !v.is_bookmarked }
        : v
    ));
  }, []);

  const refresh = useCallback(() => {
    fetchVideos();
  }, [fetchVideos]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Real-time subscription for new videos, likes, and comments
  useEffect(() => {
    const postIds = videos.map(v => v.id);
    if (postIds.length === 0) return;

    const channel = supabase
      .channel('video-posts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
          filter: 'media_type=eq.video',
        },
        async (payload) => {
          const { data } = await supabase
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
            .eq('id', payload.new.id)
            .single();

          if (data && data.user_id !== user?.id) {
            setVideos(prev => [data as VideoPost, ...prev]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_likes',
        },
        (payload) => {
          const newData = payload.new as { post_id?: string; user_id?: string } | null;
          const oldData = payload.old as { post_id?: string; user_id?: string } | null;
          const postId = newData?.post_id || oldData?.post_id;
          if (!postId) return;

          setVideos(prev => prev.map(v => {
            if (v.id !== postId) return v;
            
            if (payload.eventType === 'INSERT') {
              return {
                ...v,
                likes_count: v.likes_count + 1,
                is_liked: newData?.user_id === user?.id ? true : v.is_liked
              };
            } else if (payload.eventType === 'DELETE') {
              return {
                ...v,
                likes_count: Math.max(0, v.likes_count - 1),
                is_liked: oldData?.user_id === user?.id ? false : v.is_liked
              };
            }
            return v;
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
          const newData = payload.new as { post_id?: string } | null;
          const oldData = payload.old as { post_id?: string } | null;
          const postId = newData?.post_id || oldData?.post_id;
          if (!postId) return;

          setVideos(prev => prev.map(v => {
            if (v.id !== postId) return v;
            
            if (payload.eventType === 'INSERT') {
              return { ...v, comments_count: v.comments_count + 1 };
            } else if (payload.eventType === 'DELETE') {
              return { ...v, comments_count: Math.max(0, v.comments_count - 1) };
            }
            return v;
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
          const newData = payload.new as { id?: string; likes_count?: number; comments_count?: number; shares_count?: number; bookmarks_count?: number } | null;
          if (!newData?.id) return;

          setVideos(prev => prev.map(v => {
            if (v.id !== newData.id) return v;
            return {
              ...v,
              likes_count: newData.likes_count ?? v.likes_count,
              comments_count: newData.comments_count ?? v.comments_count,
              shares_count: newData.shares_count ?? v.shares_count,
              bookmarks_count: newData.bookmarks_count ?? v.bookmarks_count,
            };
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, videos.length > 0]);

  return {
    videos,
    isLoading,
    refresh,
    likeVideo,
    toggleBookmark,
  };
}
