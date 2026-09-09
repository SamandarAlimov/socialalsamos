import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import db from '@/lib/supabaseAny';
import { useAuth } from '@/contexts/AuthContext';
import {
  createProfileEmbedGuard,
  runWithProfileEmbedFallback,
  type EmbedQueryResult,
} from '@/lib/profileEmbed';
import { hydratePlayableVideoPosts } from '@/lib/videoPostMedia';

export interface VideoPost {
  id: string;
  user_id: string;
  content: string | null;
  media_urls: string[];
  media_type: string;
  media_candidates?: string[];
  poster_url?: string | null;
  poster_candidates?: string[];
  likes_count: number;
  comments_count: number;
  shares_count: number;
  bookmarks_count: number;
  views_count: number;
  created_at: string;
  hashtags?: string[] | null;
  post_kind?: string | null;
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

const PAGE_SIZE = 12;
const SCAN_SIZE = 36;
const MAX_SCAN_WINDOWS = 4;
const QUALITY_POOL_SIZE = 14;
const QUALITY_SCAN_SIZE = 48;
const GLOBAL_POOL_SIZE = 20;

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

type VideoPageResult = {
  videos: VideoPost[];
  nextCursor: string | null;
  hasMore: boolean;
};

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

async function fetchExactPostLikeCount(postId: string): Promise<number | null> {
  const { count, error } = await supabase
    .from('post_likes')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId);

  if (error) {
    console.warn('Video like count reconciliation failed:', error);
    return null;
  }
  return Math.max(0, count ?? 0);
}

async function hydrateRows(rows: PostRow[]): Promise<VideoPost[]> {
  const hydrated = await hydratePlayableVideoPosts(
    rows as Array<VideoPost & Record<string, unknown>>,
  );
  return hydrated as unknown as VideoPost[];
}

export function useVideoPosts() {
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  const attachUserState = useCallback(
    async (rows: VideoPost[]): Promise<VideoPost[]> => {
      if (!userId || rows.length === 0) return rows;

      const postIds = rows.map((post) => post.id);
      const { data: likesData } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds);
      const likedPostIds = new Set(likesData?.map((row) => row.post_id) || []);

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
          followingIds = new Set((followingData ?? []).map((row) => String(row.following_id)));
        }
      }

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
        is_following: post.user_id === userId ? false : followingIds.has(post.user_id),
      }));
    },
    [userId],
  );

  const fetchPostRows = useCallback(async (options: {
    before?: string | null;
    limit: number;
    quality?: boolean;
    cutoff?: string | null;
  }): Promise<PostRow[]> => {
    const { data: rows, error } = await runWithProfileEmbedFallback<PostRow>(
      videoEmbedGuard,
      (select) => {
        let query = supabase
          .from('posts')
          .select(select)
          // Historical rows used NULL as the default public visibility. Keep
          // Videos aligned with Home; RLS remains the final visibility authority.
          .or('visibility.eq.public,visibility.is.null');

        if (options.before) query = query.lt('created_at', options.before);
        if (options.cutoff) query = query.gte('created_at', options.cutoff);

        if (options.quality) {
          query = query
            .order('likes_count', { ascending: false })
            .order('comments_count', { ascending: false })
            .order('views_count', { ascending: false })
            .order('created_at', { ascending: false });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        return query.limit(options.limit) as unknown as PromiseLike<EmbedQueryResult<PostRow>>;
      },
      { embedSelect: VIDEO_SELECT_WITH_PROFILE, plainSelect: VIDEO_SELECT_PLAIN },
    );

    if (error) throw error;
    return (rows ?? []) as PostRow[];
  }, []);

  const fetchPage = useCallback(async (before: string | null): Promise<VideoPageResult> => {
    const collected: VideoPost[] = [];
    let scanCursor = before;
    let exhausted = false;

    for (let windowIndex = 0; windowIndex < MAX_SCAN_WINDOWS; windowIndex += 1) {
      const rows = await fetchPostRows({ before: scanCursor, limit: SCAN_SIZE });
      if (rows.length === 0) {
        exhausted = true;
        break;
      }

      const hydrated = await hydrateRows(rows);
      for (const video of hydrated) {
        collected.push(video);
        if (collected.length >= PAGE_SIZE) {
          // Cursor the last returned VIDEO rather than the last scanned post.
          // Otherwise videos that were already inside this scan window but came
          // after PAGE_SIZE would be skipped forever on the next pagination call.
          return {
            videos: collected.slice(0, PAGE_SIZE),
            nextCursor: collected[PAGE_SIZE - 1]?.created_at ?? null,
            hasMore: true,
          };
        }
      }

      scanCursor = String(rows[rows.length - 1]?.created_at ?? '') || null;
      if (rows.length < SCAN_SIZE || !scanCursor) {
        exhausted = true;
        break;
      }
    }

    return {
      videos: collected,
      nextCursor: scanCursor,
      hasMore: !exhausted && Boolean(scanCursor),
    };
  }, [fetchPostRows]);

  const fetchQualityCandidates = useCallback(async (): Promise<VideoPost[]> => {
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const rows = await fetchPostRows({
        limit: QUALITY_SCAN_SIZE,
        quality: true,
        cutoff,
      });
      return (await hydrateRows(rows)).slice(0, QUALITY_POOL_SIZE);
    } catch (error) {
      console.warn('Video quality candidate pool unavailable:', error);
      return [];
    }
  }, [fetchPostRows]);

  const fetchGlobalRankCandidates = useCallback(async (): Promise<VideoPost[]> => {
    try {
      const { data: rankingRows, error: rankingError } = await db
        .from('recommendation_global_rankings')
        .select('post_id, score')
        .eq('content_mode', 'video')
        .order('score', { ascending: false })
        .limit(GLOBAL_POOL_SIZE);
      if (rankingError || !rankingRows?.length) return [];

      const ids = rankingRows.map((row: any) => String(row.post_id)).filter(Boolean);
      if (ids.length === 0) return [];

      const { data: rows, error } = await runWithProfileEmbedFallback<PostRow>(
        videoEmbedGuard,
        (select) =>
          supabase
            .from('posts')
            .select(select)
            .in('id', ids)
            .or('visibility.eq.public,visibility.is.null') as unknown as PromiseLike<EmbedQueryResult<PostRow>>,
        { embedSelect: VIDEO_SELECT_WITH_PROFILE, plainSelect: VIDEO_SELECT_PLAIN },
      );
      if (error) return [];

      const hydrated = await hydrateRows((rows ?? []) as PostRow[]);
      const byId = new Map(hydrated.map((video) => [video.id, video]));
      return ids.map((id) => byId.get(id)).filter((video): video is VideoPost => Boolean(video));
    } catch {
      return [];
    }
  }, []);

  const fetchSingleVideo = useCallback(async (
    postId: string,
    publicOnly = false,
  ): Promise<VideoPost | null> => {
    const { data: rows, error } = await runWithProfileEmbedFallback<PostRow>(
      videoEmbedGuard,
      (select) => {
        let query = supabase
          .from('posts')
          .select(select)
          .eq('id', postId);
        if (publicOnly) query = query.or('visibility.eq.public,visibility.is.null');
        return query.limit(1) as unknown as PromiseLike<EmbedQueryResult<PostRow>>;
      },
      { embedSelect: VIDEO_SELECT_WITH_PROFILE, plainSelect: VIDEO_SELECT_PLAIN },
    );
    if (error) return null;

    const hydrated = await hydrateRows((rows ?? []) as PostRow[]);
    return hydrated[0] ?? null;
  }, []);

  const fetchVideos = useCallback(async () => {
    if (!hasLoadedOnceRef.current) setIsLoading(true);
    cursorRef.current = null;

    try {
      const [pageResult, qualityPool, globalPool] = await Promise.all([
        fetchPage(null),
        fetchQualityCandidates(),
        fetchGlobalRankCandidates(),
      ]);

      cursorRef.current = pageResult.nextCursor;
      setHasMore(pageResult.hasMore);

      const merged = new Map<string, VideoPost>();
      for (const video of [...pageResult.videos, ...qualityPool, ...globalPool]) {
        if (!merged.has(video.id)) merged.set(video.id, video);
      }
      let data = Array.from(merged.values());

      const deepLinkId = readDeepLinkVideoId();
      if (deepLinkId) {
        const existing = data.find((video) => video.id === deepLinkId);
        if (existing) {
          data = [existing, ...data.filter((video) => video.id !== deepLinkId)];
        } else {
          const single = await fetchSingleVideo(deepLinkId);
          if (single) {
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
  }, [
    attachUserState,
    fetchGlobalRankCandidates,
    fetchPage,
    fetchQualityCandidates,
    fetchSingleVideo,
  ]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    const cursor = cursorRef.current;
    if (!cursor) return;

    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const pageResult = await fetchPage(cursor);
      setHasMore(pageResult.hasMore);
      cursorRef.current = pageResult.nextCursor;

      if (pageResult.videos.length > 0) {
        const decorated = await attachUserState(pageResult.videos);
        setVideos((previous) => {
          const seen = new Set(previous.map((video) => video.id));
          const fresh = decorated.filter((video) => !seen.has(video.id));
          return fresh.length > 0 ? [...previous, ...fresh] : previous;
        });
      }
    } catch (error) {
      console.error('Error loading more videos:', error);
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [attachUserState, fetchPage, hasMore]);

  const reconcileLikeCount = useCallback(async (postId: string) => {
    const exactCount = await fetchExactPostLikeCount(postId);
    if (exactCount === null) return;
    setVideos((previous) =>
      previous.map((video) =>
        video.id === postId ? { ...video, likes_count: exactCount } : video,
      ),
    );
  }, []);

  const likeVideo = useCallback(async (postId: string) => {
    if (!userId) return;
    const video = videos.find((item) => item.id === postId);
    if (!video) return;

    const wasLiked = Boolean(video.is_liked);
    const previousCount = Math.max(0, video.likes_count || 0);
    setVideos((previous) =>
      previous.map((item) =>
        item.id === postId
          ? {
              ...item,
              is_liked: !wasLiked,
              likes_count: Math.max(0, previousCount + (wasLiked ? -1 : 1)),
            }
          : item,
      ),
    );

    try {
      if (wasLiked) {
        const { error } = await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('post_likes')
          .insert({ post_id: postId, user_id: userId });
        if (error) throw error;
      }
      await reconcileLikeCount(postId);
    } catch (error) {
      console.error('Error toggling like:', error);
      setVideos((previous) =>
        previous.map((item) =>
          item.id === postId
            ? { ...item, is_liked: wasLiked, likes_count: previousCount }
            : item,
        ),
      );
      void reconcileLikeCount(postId);
    }
  }, [reconcileLikeCount, userId, videos]);

  const toggleFollow = useCallback(async (targetUserId: string) => {
    if (!userId || !targetUserId || targetUserId === userId) return;
    const targetVideo = videos.find((video) => video.user_id === targetUserId);
    const wasFollowing = Boolean(targetVideo?.is_following);

    setVideos((previous) =>
      previous.map((video) =>
        video.user_id === targetUserId ? { ...video, is_following: !wasFollowing } : video,
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
          video.user_id === targetUserId ? { ...video, is_following: wasFollowing } : video,
        ),
      );
    }
  }, [userId, videos]);

  const toggleBookmark = useCallback(async (postId: string) => {
    const video = videos.find((item) => item.id === postId);
    if (!video) return;
    const wasBookmarked = Boolean(video.is_bookmarked);

    setVideos((previous) =>
      previous.map((item) =>
        item.id === postId ? { ...item, is_bookmarked: !wasBookmarked } : item,
      ),
    );
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
      console.warn('Bookmark saqlanmadi:', error);
    }
  }, [userId, videos]);

  const refresh = useCallback(() => {
    setHasMore(true);
    void fetchVideos();
  }, [fetchVideos]);

  useEffect(() => {
    void fetchVideos();
  }, [fetchVideos]);

  useEffect(() => {
    const upsertHydratedVideo = async (postId: string) => {
      const loaded = await fetchSingleVideo(postId, true);
      if (!loaded || loaded.user_id === userId) return;
      const [decorated] = await attachUserState([loaded]);
      if (!decorated) return;

      setVideos((previous) => {
        const index = previous.findIndex((video) => video.id === decorated.id);
        if (index < 0) return [decorated, ...previous];
        const next = [...previous];
        next[index] = { ...next[index], ...decorated };
        return next;
      });
    };

    const channel = supabase
      .channel('video-posts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        (payload) => {
          const newId = (payload.new as { id?: string; visibility?: string | null } | null)?.id;
          const visibility = (payload.new as { visibility?: string | null } | null)?.visibility;
          if (!newId || (visibility && visibility !== 'public')) return;
          void upsertHydratedVideo(newId);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_media' },
        (payload) => {
          const postId = String(
            (payload.new as { post_id?: string } | null)?.post_id ||
              (payload.old as { post_id?: string } | null)?.post_id ||
              '',
          );
          if (postId) void upsertHydratedVideo(postId);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_likes' },
        (payload) => {
          const newData = payload.new as { post_id?: string; user_id?: string } | null;
          const oldData = payload.old as { post_id?: string; user_id?: string } | null;
          const postId = newData?.post_id || oldData?.post_id;
          if (!postId) return;

          if (userId) {
            setVideos((previous) =>
              previous.map((video) => {
                if (video.id !== postId) return video;
                if (payload.eventType === 'INSERT' && newData?.user_id === userId) {
                  return { ...video, is_liked: true };
                }
                if (payload.eventType === 'DELETE' && oldData?.user_id === userId) {
                  return { ...video, is_liked: false };
                }
                return video;
              }),
            );
          }

          // Never add/subtract from a possibly stale local base. Re-read the
          // canonical row count so realtime ordering cannot double-count likes.
          void reconcileLikeCount(postId);
        },
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
          const inserted = payload.new as { follower_id?: string; following_id?: string } | null;
          const removed = payload.old as { follower_id?: string; following_id?: string } | null;
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
        { event: '*', schema: 'public', table: 'comments' },
        (payload) => {
          const newData = payload.new as { post_id?: string } | null;
          const oldData = payload.old as { post_id?: string } | null;
          const postId = newData?.post_id || oldData?.post_id;
          if (!postId) return;
          setVideos((previous) =>
            previous.map((video) => {
              if (video.id !== postId) return video;
              if (payload.eventType === 'INSERT') {
                return { ...video, comments_count: video.comments_count + 1 };
              }
              if (payload.eventType === 'DELETE') {
                return { ...video, comments_count: Math.max(0, video.comments_count - 1) };
              }
              return video;
            }),
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts' },
        (payload) => {
          const newData = payload.new as {
            id?: string;
            likes_count?: number;
            comments_count?: number;
            shares_count?: number;
            bookmarks_count?: number;
          } | null;
          if (!newData?.id) return;
          setVideos((previous) =>
            previous.map((video) =>
              video.id === newData.id
                ? {
                    ...video,
                    likes_count: newData.likes_count ?? video.likes_count,
                    comments_count: newData.comments_count ?? video.comments_count,
                    shares_count: newData.shares_count ?? video.shares_count,
                    bookmarks_count: newData.bookmarks_count ?? video.bookmarks_count,
                  }
                : video,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [attachUserState, fetchSingleVideo, reconcileLikeCount, userId]);

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
