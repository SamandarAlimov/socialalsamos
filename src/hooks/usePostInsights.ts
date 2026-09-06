import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/db';

export interface PostInsightTimelinePoint {
  date: string;
  views: number;
  interactions: number;
}

export interface PostInsightBreakdown {
  source?: string;
  device?: string;
  sessions: number;
  percentage: number;
}

export interface PostInsightRetentionPoint {
  position: number;
  viewers: number;
  rate: number;
}

export interface PostInsightsData {
  post: {
    id: string;
    created_at: string | null;
    content_type: string | null;
    media_type: string | null;
    video_duration: number | null;
    content?: string | null;
    media_urls?: string[] | null;
  };
  overview: {
    views: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    reposts: number;
    saves: number;
    interactions: number;
    engagement_rate: number;
    profile_clicks: number;
  };
  audience: {
    followers: number;
    non_followers: number;
    followers_percentage: number;
    non_followers_percentage: number;
  };
  watch: {
    sessions: number;
    video_sessions: number;
    total_watch_ms: number;
    average_watch_ms: number;
    average_dwell_ms: number;
    completion_rate: number;
    skip_rate: number;
  };
  timeline: PostInsightTimelinePoint[];
  sources: PostInsightBreakdown[];
  devices: PostInsightBreakdown[];
  retention: PostInsightRetentionPoint[];
  data_quality: {
    historical_metrics: boolean;
    telemetry_sessions: number;
    telemetry_started_at: string | null;
    window_days: number;
  };
}

export interface PostInsightsPreview {
  id: string;
  user_id: string;
  content: string | null;
  media_urls: string[] | null;
  media_type: string | null;
  content_type: string | null;
  created_at: string | null;
  profile: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  } | null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isMissingInsightsRpc(error: unknown): boolean {
  const item = error as { code?: string; message?: string } | null;
  const text = `${item?.code ?? ''} ${item?.message ?? ''}`.toLowerCase();
  return (
    item?.code === 'PGRST202' ||
    item?.code === '42883' ||
    text.includes('get_post_insights') &&
      (text.includes('schema cache') || text.includes('could not find'))
  );
}

function dayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function makeTimeline(days: number): PostInsightTimelinePoint[] {
  const result: PostInsightTimelinePoint[] = [];
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - offset);
    result.push({ date: date.toISOString().slice(0, 10), views: 0, interactions: 0 });
  }
  return result;
}

async function fallbackInsights(
  post: any,
  days: number,
): Promise<PostInsightsData> {
  const [viewsResult, likesResult, commentsResult, repostsResult, bookmarksResult] =
    await Promise.all([
      db.from('post_views').select('user_id, viewed_at').eq('post_id', post.id),
      db.from('post_likes').select('created_at').eq('post_id', post.id),
      db.from('comments').select('created_at').eq('post_id', post.id),
      db.from('reposts').select('created_at').eq('post_id', post.id),
      db.from('bookmarks').select('created_at').eq('post_id', post.id),
    ]);

  const views = (viewsResult.data ?? []) as Array<{ user_id: string; viewed_at: string }>;
  const likes = (likesResult.data ?? []) as Array<{ created_at: string | null }>;
  const comments = (commentsResult.data ?? []) as Array<{ created_at: string | null }>;
  const reposts = (repostsResult.data ?? []) as Array<{ created_at: string | null }>;
  const bookmarks = (bookmarksResult.data ?? []) as Array<{ created_at: string | null }>;

  const viewerIds = Array.from(new Set(views.map((view) => view.user_id).filter(Boolean)));
  const followerIds = new Set<string>();

  // Keep fallback requests bounded. The production RPC performs this aggregation
  // server-side and has no such browser payload limit.
  for (let start = 0; start < viewerIds.length; start += 400) {
    const batch = viewerIds.slice(start, start + 400);
    if (batch.length === 0) break;
    const { data } = await db
      .from('follows')
      .select('follower_id')
      .eq('following_id', post.user_id)
      .in('follower_id', batch);
    for (const row of (data ?? []) as Array<{ follower_id: string }>) {
      followerIds.add(row.follower_id);
    }
  }

  const timeline = makeTimeline(days);
  const timelineMap = new Map(timeline.map((point) => [point.date, point]));
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  const addTimeline = (
    rows: Array<{ created_at?: string | null; viewed_at?: string | null }>,
    field: 'views' | 'interactions',
    uniqueUserRows?: Array<{ user_id: string; viewed_at: string }>,
  ) => {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      const timestamp = row.viewed_at ?? row.created_at;
      if (!timestamp || new Date(timestamp) < since) return;
      const key = dayKey(timestamp);
      if (!key) return;
      if (uniqueUserRows) {
        const source = uniqueUserRows[index];
        const uniqueKey = `${key}:${source?.user_id ?? index}`;
        if (seen.has(uniqueKey)) return;
        seen.add(uniqueKey);
      }
      const point = timelineMap.get(key);
      if (point) point[field] += 1;
    });
  };

  addTimeline(views, 'views', views);
  addTimeline(likes, 'interactions');
  addTimeline(comments, 'interactions');
  addTimeline(reposts, 'interactions');
  addTimeline(bookmarks, 'interactions');

  const reach = viewerIds.length;
  const likesCount = Math.max(numberValue(post.likes_count), likes.length);
  const commentsCount = Math.max(numberValue(post.comments_count), comments.length);
  const sharesCount = numberValue(post.shares_count);
  const repostsCount = Math.max(numberValue(post.reposts_count), reposts.length);
  const savesCount = Math.max(numberValue(post.bookmarks_count), bookmarks.length);
  const interactions = likesCount + commentsCount + sharesCount + repostsCount + savesCount;
  const followerCount = viewerIds.filter((id) => followerIds.has(id)).length;
  const nonFollowerCount = Math.max(0, reach - followerCount);

  return {
    post: {
      id: post.id,
      created_at: post.created_at ?? null,
      content_type: post.content_type ?? null,
      media_type: post.media_type ?? null,
      video_duration: post.video_duration ?? null,
      content: post.content ?? null,
      media_urls: post.media_urls ?? null,
    },
    overview: {
      views: Math.max(numberValue(post.views_count), reach),
      reach,
      likes: likesCount,
      comments: commentsCount,
      shares: sharesCount,
      reposts: repostsCount,
      saves: savesCount,
      interactions,
      engagement_rate: reach > 0 ? Number(((interactions / reach) * 100).toFixed(1)) : 0,
      profile_clicks: 0,
    },
    audience: {
      followers: followerCount,
      non_followers: nonFollowerCount,
      followers_percentage: reach > 0 ? Number(((followerCount / reach) * 100).toFixed(1)) : 0,
      non_followers_percentage: reach > 0 ? Number(((nonFollowerCount / reach) * 100).toFixed(1)) : 0,
    },
    watch: {
      sessions: 0,
      video_sessions: 0,
      total_watch_ms: 0,
      average_watch_ms: 0,
      average_dwell_ms: 0,
      completion_rate: 0,
      skip_rate: 0,
    },
    timeline,
    sources: [],
    devices: [],
    retention: [],
    data_quality: {
      historical_metrics: true,
      telemetry_sessions: 0,
      telemetry_started_at: null,
      window_days: days,
    },
  };
}

export function usePostInsights(postId: string | undefined, days = 28) {
  const { user } = useAuth();
  const [data, setData] = useState<PostInsightsData | null>(null);
  const [preview, setPreview] = useState<PostInsightsPreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!postId || !user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: post, error: postError } = await db
        .from('posts')
        .select(`
          id, user_id, content, media_urls, media_type, content_type, created_at,
          video_duration, views_count, likes_count, comments_count, shares_count,
          reposts_count, bookmarks_count,
          profile:profiles!posts_user_id_fkey(username, display_name, avatar_url, is_verified)
        `)
        .eq('id', postId)
        .single();

      if (postError || !post) throw postError ?? new Error('Post topilmadi');

      if (post.user_id !== user.id) {
        const { data: collaborator } = await db
          .from('post_collaborators')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .eq('status', 'accepted')
          .maybeSingle();
        if (!collaborator) throw new Error('Bu post analitikasini ko‘rishga ruxsat yo‘q');
      }

      setPreview({
        id: post.id,
        user_id: post.user_id,
        content: post.content ?? null,
        media_urls: post.media_urls ?? null,
        media_type: post.media_type ?? null,
        content_type: post.content_type ?? null,
        created_at: post.created_at ?? null,
        profile: Array.isArray(post.profile) ? post.profile[0] ?? null : post.profile ?? null,
      } as PostInsightsPreview);

      const rpcResult = await db.rpc('get_post_insights', {
        p_post_id: postId,
        p_days: days,
      });

      if (!rpcResult.error && rpcResult.data) {
        const rpcData = rpcResult.data as PostInsightsData;
        setData({
          ...rpcData,
          post: {
            ...rpcData.post,
            content: post.content ?? null,
            media_urls: post.media_urls ?? null,
          },
        });
        return;
      }

      if (rpcResult.error && !isMissingInsightsRpc(rpcResult.error)) {
        throw rpcResult.error;
      }

      setData(await fallbackInsights(post, days));
    } catch (cause) {
      console.error('Post insights load error:', cause);
      setError(cause instanceof Error ? cause.message : 'Analitikani yuklab bo‘lmadi');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [days, postId, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, preview, isLoading, error, refresh: load };
}
