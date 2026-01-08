import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  website: string | null;
  location: string | null;
  is_verified: boolean;
  is_online: boolean;
  followers_count: number;
  following_count: number;
  posts_count: number;
  created_at: string;
  last_seen: string | null;
}

export interface UserPost {
  id: string;
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
  is_liked?: boolean;
}

export function useUserProfile(userId?: string) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [postsCount, setPostsCount] = useState(0);
  const { user } = useAuth();
  const { toast } = useToast();

  const targetUserId = userId || user?.id;

  const fetchProfile = useCallback(async () => {
    if (!targetUserId) {
      setIsLoading(false);
      return;
    }

    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (profileData) {
        setProfile(profileData as UserProfile);
        setFollowersCount(profileData.followers_count || 0);
        setFollowingCount(profileData.following_count || 0);
        setPostsCount(profileData.posts_count || 0);
      }

      // Check if current user is following this profile
      if (user && userId && user.id !== userId) {
        const { data: followData } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', userId)
          .maybeSingle();

        setIsFollowing(!!followData);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setIsLoading(false);
    }
  }, [targetUserId, user, userId]);

  const fetchPosts = useCallback(async () => {
    if (!targetUserId) return;

    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', targetUserId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Check like status for current user
      if (user && data) {
        const postIds = data.map(p => p.id);
        const { data: likes } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user.id)
          .in('post_id', postIds);

        const likedIds = new Set(likes?.map(l => l.post_id) || []);
        const postsWithLikes = data.map(post => ({
          ...post,
          media_urls: post.media_urls || [],
          is_liked: likedIds.has(post.id),
        }));
        setPosts(postsWithLikes);
      } else {
        setPosts(data?.map(p => ({ ...p, media_urls: p.media_urls || [] })) || []);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
    }
  }, [targetUserId, user]);

  const fetchCounts = useCallback(async () => {
    if (!targetUserId) return;

    try {
      // Get real followers count
      const { count: followers } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', targetUserId);

      // Get real following count
      const { count: following } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', targetUserId);

      // Get real posts count
      const { count: postsCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', targetUserId);

      setFollowersCount(followers || 0);
      setFollowingCount(following || 0);
      setPostsCount(postsCount || 0);

      // Update profile counts in database
      await supabase
        .from('profiles')
        .update({
          followers_count: followers || 0,
          following_count: following || 0,
          posts_count: postsCount || 0,
        })
        .eq('id', targetUserId);
    } catch (error) {
      console.error('Error fetching counts:', error);
    }
  }, [targetUserId]);

  const toggleFollow = useCallback(async () => {
    if (!user || !userId || user.id === userId) return;

    try {
      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);

        setIsFollowing(false);
        setFollowersCount(prev => Math.max(0, prev - 1));
        toast({ title: 'Unfollowed', description: 'You unfollowed this user.' });
      } else {
        await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: userId });

        setIsFollowing(true);
        setFollowersCount(prev => prev + 1);
        toast({ title: 'Following', description: 'You are now following this user.' });
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast({ title: 'Error', description: 'Failed to update follow status', variant: 'destructive' });
    }
  }, [user, userId, isFollowing, toast]);

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
            ? { ...p, is_liked: false, likes_count: Math.max(0, p.likes_count - 1) }
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
      setPostsCount(prev => Math.max(0, prev - 1));
      toast({ title: 'Deleted', description: 'Post has been deleted.' });
    } catch (error) {
      console.error('Error deleting post:', error);
      toast({ title: 'Error', description: 'Failed to delete post', variant: 'destructive' });
    }
  }, [user, toast]);

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
        p.id === postId ? { ...p, is_pinned: !p.is_pinned } : p
      ).sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }));

      toast({
        title: post.is_pinned ? 'Unpinned' : 'Pinned',
        description: post.is_pinned ? 'Post unpinned from profile.' : 'Post pinned to profile.',
      });
    } catch (error) {
      console.error('Error pinning post:', error);
    }
  }, [user, posts, toast]);

  // Initial fetch
  useEffect(() => {
    fetchProfile();
    fetchPosts();
    fetchCounts();
  }, [fetchProfile, fetchPosts, fetchCounts]);

  // Real-time subscription for posts and counts
  useEffect(() => {
    if (!targetUserId) return;

    const channel = supabase
      .channel(`profile-posts-${targetUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts',
          filter: `user_id=eq.${targetUserId}`,
        },
        (payload) => {
          // Handle post count updates in real-time
          if (payload.eventType === 'UPDATE') {
            const newData = payload.new as any;
            setPosts(prev => prev.map(p => 
              p.id === newData.id 
                ? { 
                    ...p, 
                    likes_count: newData.likes_count ?? p.likes_count,
                    comments_count: newData.comments_count ?? p.comments_count,
                    shares_count: newData.shares_count ?? p.shares_count,
                    bookmarks_count: newData.bookmarks_count ?? p.bookmarks_count,
                  }
                : p
            ));
          } else {
            fetchPosts();
            fetchCounts();
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
          const postId = (payload.new as any)?.post_id || (payload.old as any)?.post_id;
          // Update like count for specific post
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
          event: '*',
          schema: 'public',
          table: 'follows',
          filter: `following_id=eq.${targetUserId}`,
        },
        () => {
          fetchCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetUserId, fetchPosts, fetchCounts, user?.id]);

  // Real-time subscription for profile updates
  useEffect(() => {
    if (!targetUserId) return;

    const channel = supabase
      .channel(`profile-updates-${targetUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${targetUserId}`,
        },
        (payload) => {
          setProfile(payload.new as UserProfile);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetUserId]);

  return {
    profile,
    posts,
    isLoading,
    isFollowing,
    followersCount,
    followingCount,
    postsCount,
    isOwnProfile: !userId || user?.id === userId,
    toggleFollow,
    likePost,
    deletePost,
    pinPost,
    refresh: () => {
      fetchProfile();
      fetchPosts();
      fetchCounts();
    },
  };
}
