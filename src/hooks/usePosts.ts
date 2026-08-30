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
import { MEDIA_BUCKET, PRIVATE_MEDIA_BUCKET } from '@/lib/mediaUpload';

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

async function cleanupUnpublishedMedia(items: PostMediaInput[]): Promise<void> {
  const byBucket = new Map<string, Set<string>>();

  const add = (bucket?: string | null, key?: string | null) => {
    if (!bucket || !key) return;
    if (bucket !== MEDIA_BUCKET && bucket !== PRIVATE_MEDIA_BUCKET) return;
    const keys = byBucket.get(bucket) ?? new Set<string>();
    keys.add(key);
    byBucket.set(bucket, keys);
  };

  for (const item of items) {
    add(item.storageBucket, item.storageKey);
    add(item.thumbnailBucket, item.thumbnailKey);
  }

  await Promise.all(
    Array.from(byBucket.entries()).map(async ([bucket, keys]) => {
      const { error } = await supabase.storage.from(bucket).remove(Array.from(keys));
      if (error) console.warn('Yarim qolgan uploadni tozalab bo‘lmadi:', error);
    }),
  );
}

async function cleanupUnpublishedMusic(input?: PostMusicInput | null): Promise<void> {
  if (!input || input.trackId || !input.track) return;

  const bucket = input.track.storageBucket;
  const key = input.track.storageKey;
  if (!bucket || !key) return;
  if (bucket !== MEDIA_BUCKET && bucket !== PRIVATE_MEDIA_BUCKET) return;

  const { error } = await supabase.storage.from(bucket).remove([key]);
  if (error) console.warn('Yarim qolgan music uploadni tozalab bo‘lmadi:', error);
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
      // Feed query visibility bilan bir xil semantikaga ega bo'lishi kerak.
      // RLS oxirgi himoya qatlamidir; client esa keraksiz qatorlarni so'ramaydi.
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
        .order('created_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (filter === 'global') {
        query = query.eq('visibility', 'public');
      } else if (filter === 'following') {
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

        const followingIds = (following ?? []).map((row) => row.following_id);
        if (followingIds.length === 0) {
          if (refresh) setPosts([]);
          setHasMore(false);
          return;
        }

        query = query
          .eq('visibility', 'public')
          .in('user_id', followingIds);
      } else {
        // "friends" = mutual follow. Faqat ikki tomonlama follow bo'lgan
        // foydalanuvchilarning public + friends postlari olinadi.
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
        if (outgoingIds.length === 0) {
          if (refresh) setPosts([]);
          setHasMore(false);
          return;
        }

        const { data: reciprocal, error: reciprocalError } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('following_id', user.id)
          .in('follower_id', outgoingIds);

        if (reciprocalError) throw reciprocalError;

        const friendIds = (reciprocal ?? []).map((row) => row.follower_id);
        if (friendIds.length === 0) {
          if (refresh) setPosts([]);
          setHasMore(false);
          return;
        }

        query = query
          .in('visibility', ['public', 'friends'])
          .in('user_id', friendIds);
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

      if (publishError || !postId) {
        // Binary upload DB transaction ichida emas. DB publish yiqilsa
        // hech qayerga bog'lanmagan Supabase obyektlarini best-effort tozalaymiz.
        await Promise.all([
          cleanupUnpublishedMedia(options.media ?? []),
          cleanupUnpublishedMusic(options.music),
        ]);
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const createdPost = error || !data ? fallbackPost : (data as Post);

      if (error) {
        console.warn('Post yaratildi, lekin UI refetch bajarilmadi:', error);
      }

      if (!isScheduled && visibility === 'public') {
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
