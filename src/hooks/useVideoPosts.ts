import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import db from '@/lib/supabaseAny';
import { useAuth } from '@/contexts/AuthContext';
import {
  attachProfiles,
  createProfileEmbedGuard,
  runWithProfileEmbedFallback,
  type EmbedQueryResult,
} from '@/lib/profileEmbed';

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
  views_count: number;
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

// `posts_user_id_fkey` nomi bazada bo'lmasa PostgREST butun so'rovni rad etadi
// va Videolar sahifasi bo'sh qoladi. Shuning uchun embedsiz variant ham bor.
const VIDEO_SELECT_WITH_PROFILE = `
  *,
  profile:profiles!posts_user_id_fkey (
    id,
    username,
    display_name,
    avatar_url,
    is_verified
  )
`;

const VIDEO_SELECT_PLAIN = '*';

const videoEmbedGuard = createProfileEmbedGuard();

type PostRow = Record<string, unknown>;

/**
 * Deep-link qilingan post ID sini URL dan o'qiydi.
 *
 * Discover va qidiruv natijalari `/videos?v=<id>` ga o'tadi. Ilgari sahifa
 * har doim eng yangi videodan boshlanar edi, ya'ni tugma bosilgani bilan
 * boshqa video ochilardi. Shu sababli deep-link videosini ro'yxat boshiga
 * chiqaramiz.
 */
function readDeepLinkVideoId(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('v') || params.get('post') || params.get('id');
    const clean = raw?.trim();
    return clean ? clean : null;
  } catch {
    return null;
  }
}

export function useVideoPosts() {
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchVideos = useCallback(async () => {
    setIsLoading(true);

    try {
      const { data: rows, error } = await runWithProfileEmbedFallback<PostRow>(
        videoEmbedGuard,
        (select) =>
          supabase
            .from('posts')
            .select(select)
            .eq('media_type', 'video')
            .eq('visibility', 'public')
            .order('created_at', { ascending: false })
            .limit(50) as unknown as PromiseLike<EmbedQueryResult<PostRow>>,
        {
          embedSelect: VIDEO_SELECT_WITH_PROFILE,
          plainSelect: VIDEO_SELECT_PLAIN,
        },
      );

      if (error) throw error;

      let data = (rows ?? []) as unknown as VideoPost[];

      // ── Deep-link: aynan so'ralgan video birinchi bo'lib ko'rsatiladi ──
      const deepLinkId = readDeepLinkVideoId();
      if (deepLinkId) {
        const existing = data.find((video) => video.id === deepLinkId);

        if (existing) {
          data = [existing, ...data.filter((video) => video.id !== deepLinkId)];
        } else {
          // Oxirgi 50 talikka tushmagan (eski) video ham ochilishi kerak.
          const { data: singleRows, error: singleError } =
            await runWithProfileEmbedFallback<PostRow>(
              videoEmbedGuard,
              (select) =>
                supabase
                  .from('posts')
                  .select(select)
                  .eq('id', deepLinkId)
                  .limit(1) as unknown as PromiseLike<EmbedQueryResult<PostRow>>,
              {
                embedSelect: VIDEO_SELECT_WITH_PROFILE,
                plainSelect: VIDEO_SELECT_PLAIN,
              },
            );

          const single = !singleError
            ? ((singleRows ?? [])[0] as unknown as VideoPost | undefined)
            : undefined;

          if (single?.media_urls?.length) {
            data = [single, ...data.filter((video) => video.id !== single.id)];
          }
        }
      }

      if (user && data.length > 0) {
        const postIds = data.map(p => p.id);

        const { data: likesData } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user.id)
          .in('post_id', postIds);

        const likedPostIds = new Set(likesData?.map(l => l.post_id) || []);

        // Saqlanganlar (bookmark) holati: jadval mavjud bo'lmasa yoki ruxsat
        // bo'lmasa sahifa ishlashda davom etadi, faqat holat bo'sh qoladi.
        let bookmarkedPostIds = new Set<string>();
        try {
          const { data: bookmarksData, error: bookmarksError } = await db
            .from('post_bookmarks')
            .select('post_id')
            .eq('user_id', user.id)
            .in('post_id', postIds);

          if (!bookmarksError) {
            bookmarkedPostIds = new Set(
              (bookmarksData ?? []).map((row: any) => row.post_id as string),
            );
          }
        } catch (bookmarksError) {
          console.warn('Bookmark holatini yuklab bolmadi:', bookmarksError);
        }

        const videosWithStatus = data.map(post => ({
          ...post,
          is_liked: likedPostIds.has(post.id),
          is_bookmarked: bookmarkedPostIds.has(post.id),
        }));

        setVideos(videosWithStatus as VideoPost[]);
      } else {
        setVideos(data);
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

  const toggleBookmark = useCallback(async (postId: string) => {
    const video = videos.find(v => v.id === postId);
    if (!video) return;

    const wasBookmarked = !!video.is_bookmarked;

    // Optimistik UI: tugma darhol javob beradi.
    setVideos(prev => prev.map(v =>
      v.id === postId
        ? { ...v, is_bookmarked: !wasBookmarked }
        : v
    ));

    if (!user) return;

    try {
      if (wasBookmarked) {
        const { error } = await db
          .from('post_bookmarks')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await db
          .from('post_bookmarks')
          .insert({ post_id: postId, user_id: user.id });
        if (error) throw error;
      }
    } catch (error) {
      // Jadval hali yaratilmagan bo'lsa foydalanuvchini bezovta qilmaymiz,
      // lekin holatni ham yolg'on ko'rsatmaslik uchun konsolga yozamiz.
      console.warn('Bookmark saqlanmadi:', error);
    }
  }, [user, videos]);

  const refresh = useCallback(() => {
    fetchVideos();
  }, [fetchVideos]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Real-time subscription for new videos, likes, and comments
  useEffect(() => {
    const hasVideos = videos.length > 0;
    if (!hasVideos) return;

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
          const newId = (payload.new as { id?: string } | null)?.id;
          if (!newId) return;

          const { data: rows, error } = await runWithProfileEmbedFallback<PostRow>(
            videoEmbedGuard,
            (select) =>
              supabase
                .from('posts')
                .select(select)
                .eq('id', newId)
                .limit(1) as unknown as PromiseLike<EmbedQueryResult<PostRow>>,
            {
              embedSelect: VIDEO_SELECT_WITH_PROFILE,
              plainSelect: VIDEO_SELECT_PLAIN,
            },
          );

          if (error) {
            console.error('Error loading new video:', error);
            return;
          }

          const data = (rows ?? [])[0] as unknown as VideoPost | undefined;

          if (data && data.user_id !== user?.id) {
            setVideos(prev => (prev.some(v => v.id === data.id) ? prev : [data, ...prev]));
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
  }, [user?.id, videos.length]);

  return {
    videos,
    isLoading,
    refresh,
    likeVideo,
    toggleBookmark,
  };
}
