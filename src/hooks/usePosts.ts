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
import type { AlsamosRichTextDocument } from '@/lib/richTextDocument';
import db from '@/lib/supabaseAny';

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
  formatted_content?: AlsamosRichTextDocument | null;
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

function isMissingPostKindError(error: unknown): boolean {
  const value = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  } | null;
  const text = [value?.code, value?.message, value?.details, value?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    text.includes('post_kind') &&
    (
      text.includes('column') ||
      text.includes('schema cache') ||
      text.includes('does not exist') ||
      value?.code === '42703' ||
      value?.code === 'PGRST204'
    )
  );
}

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
  formattedContent?: AlsamosRichTextDocument | null;
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
      let allowedUserIds: string[] | null = null;
      let visibility: 'public' | Array<'public' | 'friends'> =
        filter === 'friends' ? ['public', 'friends'] : 'public';

      if (filter === 'following') {
        if (!user) {
          if (refresh) setPosts([]);
          setHasMore(false);
          return;
        }

        const { data: following, error: followingError } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);

        if (followingError) throw followingError;
        allowedUserIds = (following ?? []).map((row) => row.following_id);
      } else if (filter === 'friends') {
        if (!user) {
          if (refresh) setPosts([]);
          setHasMore(false);
          return;
        }

        const { data: outgoing, error: outgoingError } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);

        if (outgoingError) throw outgoingError;

        const outgoingIds = (outgoing ?? []).map((row) => row.following_id);
        if (outgoingIds.length > 0) {
          const { data: reciprocal, error: reciprocalError } = await supabase
            .from('follows')
            .select('follower_id')
            .eq('following_id', user.id)
            .in('follower_id', outgoingIds);

          if (reciprocalError) throw reciprocalError;
          allowedUserIds = (reciprocal ?? []).map((row) => row.follower_id);
        } else {
          allowedUserIds = [];
        }
      }

      if (allowedUserIds && allowedUserIds.length === 0) {
        if (refresh) setPosts([]);
        setHasMore(false);
        return;
      }

      const buildQuery = (includePostKind: boolean) => {
        let query = db
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
          .order('created_at', { ascending: false })
          .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

        // Production may briefly lag behind the app migration. Only this
        // optional discriminator gets a compatibility retry; RLS still applies.
        if (includePostKind) query = query.neq('post_kind', 'story');

        query = Array.isArray(visibility)
          ? query.in('visibility', visibility)
          : query.eq('visibility', visibility);

        if (allowedUserIds) query = query.in('user_id', allowedUserIds);
        return query;
      };

      let result = await buildQuery(true);
      if (result.error && isMissingPostKindError(result.error)) {
        result = await buildQuery(false);
      }

      const { data, error } = result;
      if (error) throw error;

      if (user && data && data.length > 0) {
        const postIds = data.map((post) => post.id);
        const { data: likes, error: likesError } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user.id)
          .in('post_id', postIds);

        if (likesError) {
          console.warn('Post like state hydrate failed:', likesError);
        }

        const likedPostIds = new Set((likes ?? []).map((row) => row.post_id));
        const postsWithStatus = data.map((post) => ({
          ...post,
          is_liked: likedPostIds.has(post.id),
          is_bookmarked: false,
        }));

        setPosts((previous) =>
          refresh ? (postsWithStatus as Post[]) : [...previous, ...(postsWithStatus as Post[])]
        );
      } else {
        setPosts((previous) =>
          refresh ? ((data ?? []) as Post[]) : [...previous, ...((data ?? []) as Post[])]
        );
      }

      setHasMore(Boolean(data && data.length === PAGE_SIZE));
    } catch (error: any) {
      console.error('Error fetching posts:', error);

      // A failed page must not keep infinite-scroll requesting offset
      // 10/20/30/... forever. Stop until an explicit refresh.
      setHasMore(false);

      if (refresh || pageNum === 0) {
        toast({
          title: 'Error',
          description: 'Failed to load posts',
          variant: 'destructive',
        });
      }
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
        formattedContent: options.formattedContent ?? null,
        editState: options.editState ?? null,
      };

      const { data: postId, error: publishError } = await (supabase as any).rpc(
        'publish_post_draft',
        { p_payload: payload },
      );

      if (publishError || !postId) {
        // Uploadlar draft lifecycle tomonidan saqlanadi: foydalanuvchi shu
        // composer ichida darhol qayta urinishi mumkin. Route yopilsa hook
        // orphan obyektlarni o'zi tozalaydi.
        throw publishError ?? new Error('Post identifikatori qaytmadi');
      }

      // RPC atomik yozdi. Bundan keyin obyektlarni rollback qilib bo'lmaydi:
      // UI refetch xatosi post yaratilmagan degani emas.
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

      const fallbackPost: Post = {
        id: String(postId),
        user_id: user.id,
        content,
        media_urls: mediaUrls,
        media_type: mediaType,
        likes_count: 0,
        comments_count: 0,
        shares_count: 0,
        bookmarks_count: 0,
        reposts_count: 0,
        views_count: 0,
        is_pinned: false,
        visibility,
        formatted_content: options.formattedContent ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const createdPost = error || !data ? fallbackPost : (data as Post);

      if (error) {
        console.warn('Post yaratildi, lekin UI refetch bajarilmadi:', error);
      }

      if (
        !isScheduled &&
        visibility === 'public' &&
        (options.postKind ?? 'post') !== 'story'
      ) {
        setPosts((prev) => [createdPost, ...prev]);
      }

      toast({
        title: isScheduled ? 'Rejalashtirildi' : 'Posted!',
        description: isScheduled
          ? 'Post belgilangan vaqtda e\\u2018lon qilinadi.'
          : collaborators.length > 0
            ? 'Post joylandi va hammualliflarga taklif yuborildi.'
            : 'Post muvaffaqiyatli joylandi.',
      });

      return createdPost;
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
          if (payload.new.post_kind === 'story') return;

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
