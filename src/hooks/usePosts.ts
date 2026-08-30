import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { PollInput } from '@/lib/polls';
import type {
  PostLocationInput,
  PostMediaInput,
  PostMusicInput,
} from '@/lib/postMeta';
import { MAX_COLLABORATORS } from '@/lib/postComposer';

export interface Post {
  id: string;
  user_id: string;
  content: string | null;
  media_urls: string[];
  media_type: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  bookmarks_count: number;
  reposts_count: number;
  views_count: number;
  is_pinned: boolean;
  visibility: string;
  created_at: string;
  updated_at: string;
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

export type PostVisibility = 'public' | 'friends' | 'private';

/** Post yaratishda qo'shimcha strukturali ma'lumotlar. */
export interface CreatePostOptions {
  /** MUHIM: ilgari bu qiymat saqlanmasdan tushib qolar edi (maxfiylik bug'i). */
  visibility?: PostVisibility;
  postKind?: 'post' | 'reel' | 'story' | 'location' | 'poll' | 'file';
  /** Rejalashtirilgan vaqt — berilsa post 'scheduled' holatda saqlanadi. */
  scheduledAt?: string | null;
  media?: PostMediaInput[];
  poll?: PollInput | null;
  location?: PostLocationInput | null;
  music?: PostMusicInput | null;
  /** Tahrir holati (filtr, aspect ratio, overlaylar) — reproduksiya uchun. */
  editState?: Record<string, unknown> | null;
}

export function usePosts(filter: 'global' | 'friends' | 'following' = 'global') {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const { user } = useAuth();
  const { toast } = useToast();
  const PAGE_SIZE = 10;

  const fetchPosts = useCallback(async (pageNum: number, refresh = false) => {
    setIsLoading(true);

    try {
      // Fetch all post types including videos/reels
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
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (filter === 'following' && user) {
        const { data: following } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);

        if (following && following.length > 0) {
          const followingIds = following.map(f => f.following_id);
          query = query.in('user_id', followingIds);
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      // Check if user has liked/bookmarked these posts
      if (user && data) {
        const postIds = data.map(p => p.id);
        
        const [likesResult, bookmarksResult] = await Promise.all([
          supabase
            .from('post_likes')
            .select('post_id')
            .eq('user_id', user.id)
            .in('post_id', postIds),
          // For now, just return empty since we don't have bookmarks table
          { data: [] as any[], error: null }
        ]);

        const likedPostIds = new Set(likesResult.data?.map(l => l.post_id) || []);

        const postsWithStatus = data.map(post => ({
          ...post,
          is_liked: likedPostIds.has(post.id),
          is_bookmarked: false,
        }));

        if (refresh) {
          setPosts(postsWithStatus as Post[]);
        } else {
          setPosts(prev => [...prev, ...(postsWithStatus as Post[])]);
        }
      } else {
        if (refresh) {
          setPosts(data as Post[]);
        } else {
          setPosts(prev => [...prev, ...(data as Post[])]);
        }
      }

      setHasMore(data ? data.length === PAGE_SIZE : false);
    } catch (error: any) {
      console.error('Error fetching posts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load posts',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [filter, user, toast]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchPosts(nextPage);
    }
  }, [isLoading, hasMore, page, fetchPosts]);

  const refresh = useCallback(() => {
    setPage(0);
    setHasMore(true);
    fetchPosts(0, true);
  }, [fetchPosts]);

  const createPost = useCallback(async (
    content: string,
    mediaUrls: string[] = [],
    mediaType = 'text',
    collaboratorIds: string[] = [],
    options: CreatePostOptions = {}
  ) => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to post',
        variant: 'destructive',
      });
      return null;
    }

    const visibility = options.visibility ?? 'public';
    const isScheduled = Boolean(options.scheduledAt);
    const collaborators = Array.from(new Set(collaboratorIds))
      .filter((id) => id !== user.id)
      .slice(0, MAX_COLLABORATORS);

    try {
      // P0: post + barcha strukturali meta bitta PostgreSQL transaction ichida.
      // Biror meta yozuvi xato qilsa, yarimta post bazada qolmaydi.
      const payload = {
        content,
        mediaUrls,
        mediaType,
        collaboratorIds: collaborators,
        visibility,
        postKind: options.postKind ?? 'post',
        scheduledAt: options.scheduledAt ?? null,
        media: options.media ?? [],
        poll: options.poll ?? null,
        location: options.location ?? null,
        music: options.music ?? null,
        editState: options.editState ?? null,
      };

      const { data: postId, error: publishError } = await (supabase as any).rpc(
        'publish_post_draft',
        { p_payload: payload },
      );

      if (publishError) throw publishError;
      if (!postId) throw new Error('Post identifikatori qaytmadi');

      // RPC atomik yozadi; UI uchun profil bilan tayyor postni qayta o'qiymiz.
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
        .eq('id', postId)
        .single();

      if (error) throw error;

      if (!isScheduled && visibility === 'public') {
        setPosts((prev) => [data as Post, ...prev]);
      }

      toast({
        title: isScheduled ? 'Rejalashtirildi' : 'Posted!',
        description: isScheduled
          ? 'Post belgilangan vaqtda e\\u2018lon qilinadi.'
          : collaborators.length > 0
            ? 'Post joylandi va hammualliflarga taklif yuborildi.'
            : 'Post muvaffaqiyatli joylandi.',
      });

      return data;
    } catch (error: any) {
      console.error('Error creating post:', error);
      toast({
        title: 'Post joylanmadi',
        description: error?.message ?? 'Postni yaratishda xatolik yuz berdi',
        variant: 'destructive',
      });
      return null;
    }
  }, [user, toast]);

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
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;

      setPosts(prev => prev.filter(p => p.id !== postId));
      toast({
        title: 'Deleted',
        description: 'Post has been deleted.',
      });
    } catch (error) {
      console.error('Error deleting post:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete post',
        variant: 'destructive',
      });
    }
  }, [toast]);

  useEffect(() => {
    fetchPosts(0, true);
  }, [filter]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('posts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
        },
        async (payload) => {
          // Fetch the full post with profile
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
            setPosts(prev => [data as Post, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return {
    posts,
    isLoading,
    hasMore,
    loadMore,
    refresh,
    createPost,
    likePost,
    deletePost,
  };
}
