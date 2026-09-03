import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import db from '@/lib/supabaseAny';
import { useAuth } from '@/contexts/AuthContext';
import {
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
  is_following?: boolean;
}

/**
 * Bir sahifada nechta video yuklanadi.
 *
 * Ilgari `.limit(50)` edi va pagination yo'q edi: birinchi ochilishda 50 ta
 * post metadatasi kelardi, sahifa esa 50 ta <video> element yaratardi.
 * Endi kichik sahifalar bilan ishlaymiz va foydalanuvchi oxiriga
 * yaqinlashganda keyingisi yuklanadi.
 */
const PAGE_SIZE = 12;

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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const { user } = useAuth();
  const userId = user?.id ?? null;

  /** Keyset pagination kursori: oxirgi yuklangan videoning created_at qiymati. */
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  /** Like / bookmark holatini bir sahifa uchun to'ldiradi. */
  const attachUserState = useCallback(
    async (rows: VideoPost[]): Promise<VideoPost[]> => {
      if (!userId || rows.length === 0) return rows;

      const postIds = rows.map((post) => post.id);

      const { data: likesData } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds);

      const likedPostIds = new Set(likesData?.map((l) => l.post_id) || []);

      const creatorIds = Array.from(
        new Set(
          rows
            .map((post) => post.user_id)
            .filter((creatorId) => creatorId && creatorId !== userId),
        ),
      );

      let followingIds = new Set<string>();
      if (creatorIds.length > 0) {
        const { data: followingData, error: followingError } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', userId)
          .in('following_id', creatorIds);

        if (followingError) {
          console.warn('Video follow holatini yuklab bo‘lmadi:', followingError);
        } else {
          followingIds = new Set(
            (followingData ?? []).map((row) => String(row.following_id)),
          );
        }
      }

      // Saqlanganlar (bookmark) holati: jadval mavjud bo'lmasa yoki ruxsat
      // bo'lmasa sahifa ishlashda davom etadi, faqat holat bo'sh qoladi.
      let bookmarkedPostIds = new Set<string>();
      try {
        const { data: bookmarksData, error: bookmarksError } = await db
          .from('post_bookmarks')
          .select('post_id')
          .eq('user_id', userId)
          .in('post_id', postIds);

        if (!bookmarksError) {
          bookmarkedPostIds = new Set(
            (bookmarksData ?? []).map((row: any) => row.post_id as string),
          );
        }
      } catch (bookmarksError) {
        console.warn('Bookmark holatini yuklab bolmadi:', bookmarksError);
      }

      return rows.map((post) => ({
        ...post,
        is_liked: likedPostIds.has(post.id),
        is_bookmarked: bookmarkedPostIds.has(post.id),
        is_following:
          post.user_id === userId ? false : followingIds.has(post.user_id),
      }));
    },
    [userId],
  );

  /** Bitta sahifani oladi. `before` - kursor (undan eskirog'i olinadi). */
  const fetchPage = useCallback(async (before: string | null): Promise<VideoPost[]> => {
    const { data: rows, error } = await runWithProfileEmbedFallback<PostRow>(
      videoEmbedGuard,
      (select) => {
        const base = supabase
          .from('posts')
          .select(select)
          .eq('media_type', 'video')
          .eq('visibility', 'public');

        const filtered = before ? base.lt('created_at', before) : base;

        return filtered
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE) as unknown as PromiseLike<EmbedQueryResult<PostRow>>;
      },
      {
        embedSelect: VIDEO_SELECT_WITH_PROFILE,
        plainSelect: VIDEO_SELECT_PLAIN,
      },
    );

    if (error) throw error;

    return (rows ?? []) as unknown as VideoPost[];
  }, []);

  const fetchVideos = useCallback(async () => {
    // Faqat birinchi bootstrapda skeleton ko'rsatamiz. Auth token refresh,
    // manual refresh yoki background reconciliation player DOMini unmount qilmaydi.
    if (!hasLoadedOnceRef.current) setIsLoading(true);
    cursorRef.current = null;

    try {
      const page = await fetchPage(null);

      // Kursor deep-link aralashuvidan oldin, xom natijadan olinadi.
      const last = page[page.length - 1];
      cursorRef.current = last ? last.created_at : null;
      setHasMore(page.length === PAGE_SIZE);

      let data = page;

      // ── Deep-link: aynan so'ralgan video birinchi bo'lib ko'rsatiladi ──
      const deepLinkId = readDeepLinkVideoId();
      if (deepLinkId) {
        const existing = data.find((video) => video.id === deepLinkId);

        if (existing) {
          data = [existing, ...data.filter((video) => video.id !== deepLinkId)];
        } else {
          // Birinchi sahifaga tushmagan (eski) video ham ochilishi kerak.
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

      setVideos(await attachUserState(data));
    } catch (error) {
      console.error('Error fetching videos:', error);
    } finally {
      hasLoadedOnceRef.current = true;
      setIsLoading(false);
    }
  }, [fetchPage, attachUserState]);

  /** Keyingi sahifa. Foydalanuvchi ro'yxat oxiriga yaqinlashganda chaqiriladi. */
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;

    const cursor = cursorRef.current;
    if (!cursor) return;

    loadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const page = await fetchPage(cursor);

      if (page.length < PAGE_SIZE) setHasMore(false);

      if (page.length > 0) {
        cursorRef.current = page[page.length - 1].created_at;
        const decorated = await attachUserState(page);

        setVideos((prev) => {
          const seen = new Set(prev.map((video) => video.id));
          const fresh = decorated.filter((video) => !seen.has(video.id));
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }
    } catch (error) {
      console.error('Error loading more videos:', error);
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMore, fetchPage, attachUserState]);

  const likeVideo = useCallback(async (postId: string) => {
    if (!userId) return;

    const video = videos.find(v => v.id === postId);
    if (!video) return;

    try {
      if (video.is_liked) {
        await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', userId);

        setVideos(prev => prev.map(v => 
          v.id === postId 
            ? { ...v, is_liked: false, likes_count: v.likes_count - 1 }
            : v
        ));
      } else {
        await supabase
          .from('post_likes')
          .insert({ post_id: postId, user_id: userId });

        setVideos(prev => prev.map(v => 
          v.id === postId 
            ? { ...v, is_liked: true, likes_count: v.likes_count + 1 }
            : v
        ));
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  }, [userId, videos]);

  const toggleFollow = useCallback(async (targetUserId: string) => {
    if (!user || !targetUserId || targetUserId === userId) return;

    const targetVideo = videos.find((video) => video.user_id === targetUserId);
    const wasFollowing = Boolean(targetVideo?.is_following);

    setVideos((previous) =>
      previous.map((video) =>
        video.user_id === targetUserId
          ? { ...video, is_following: !wasFollowing }
          : video,
      ),
    );

    try {
      if (wasFollowing) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', userId)
          .eq('following_id', targetUserId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: userId, following_id: targetUserId });
        if (error) throw error;
      }
    } catch (error) {
      console.error('Video follow holatini o‘zgartirib bo‘lmadi:', error);
      setVideos((previous) =>
        previous.map((video) =>
          video.user_id === targetUserId
            ? { ...video, is_following: wasFollowing }
            : video,
        ),
      );
    }
  }, [userId, videos]);

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

    if (!userId) return;

    try {
      if (wasBookmarked) {
        const { error } = await db
          .from('post_bookmarks')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await db
          .from('post_bookmarks')
          .insert({ post_id: postId, user_id: userId });
        if (error) throw error;
      }
    } catch (error) {
      // Jadval hali yaratilmagan bo'lsa foydalanuvchini bezovta qilmaymiz,
      // lekin holatni ham yolg'on ko'rsatmaslik uchun konsolga yozamiz.
      console.warn('Bookmark saqlanmadi:', error);
    }
  }, [userId, videos]);

  const refresh = useCallback(() => {
    setHasMore(true);
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

          if (data && data.user_id !== userId) {
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
                is_liked: newData?.user_id === userId ? true : v.is_liked
              };
            } else if (payload.eventType === 'DELETE') {
              return {
                ...v,
                likes_count: Math.max(0, v.likes_count - 1),
                is_liked: oldData?.user_id === userId ? false : v.is_liked
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
          table: 'follows',
          ...(userId ? { filter: `follower_id=eq.${userId}` } : {}),
        },
        (payload) => {
          if (!userId) return;

          const inserted = payload.new as {
            follower_id?: string;
            following_id?: string;
          } | null;
          const removed = payload.old as {
            follower_id?: string;
            following_id?: string;
          } | null;
          const row = inserted?.following_id ? inserted : removed;

          if (!row?.following_id || row.follower_id !== userId) return;

          const isFollowing = payload.eventType === 'INSERT';
          setVideos((previous) =>
            previous.map((video) =>
              video.user_id === row.following_id
                ? { ...video, is_following: isFollowing }
                : video,
            ),
          );
        },
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
  }, [userId, videos.length]);

  return {
    videos,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    refresh,
    likeVideo,
    toggleBookmark,
    toggleFollow,
  };
}
