import { useCallback, useEffect, useRef, useState } from 'react';
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
    generated_at?: string | null;
    data_source?: 'server_rpc' | 'client_fallback' | string;
    share_tracking_started_at?: string | null;
    last_event_at?: string | null;
    window_reach?: number;
    telemetry_coverage_pct?: number;
    degraded_fields?: string[];
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

function errorText(error: unknown): string {
  const item = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  return [item?.code, item?.message, item?.details, item?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isMissingInsightsRpc(error: unknown): boolean {
  const item = error as { code?: string; message?: string } | null;
  const text = errorText(error);
  return (
    item?.code === 'PGRST202' ||
    item?.code === '42883' ||
    (text.includes('get_post_insights') &&
      (text.includes('schema cache') || text.includes('could not find')))
  );
}

function isRecoverableInsightsRpc(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const text = errorText(error);
  return (
    isMissingInsightsRpc(error) ||
    code === '42501' ||
    code === 'PGRST301' ||
    text.includes('permission denied') ||
    text.includes('execute privilege') ||
    text.includes('forbidden')
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

function maxTimestamp(values: Array<string | null | undefined>): string | null {
  let latest = 0;
  let latestValue: string | null = null;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isFinite(time) && time > latest) {
      latest = time;
      latestValue = value;
    }
  }
  return latestValue;
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

  const degradedFields: string[] = [];
  if (viewsResult.error) degradedFields.push('views');
  if (likesResult.error) degradedFields.push('likes');
  if (commentsResult.error) degradedFields.push('comments');
  if (repostsResult.error) degradedFields.push('reposts');
  if (bookmarksResult.error) degradedFields.push('saves');

  if (degradedFields.length === 5) {
    throw viewsResult.error ?? new Error('Analitika manbalarini o‘qib bo‘lmadi');
  }

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
    const { data, error } = await db
      .from('follows')
      .select('follower_id')
      .eq('following_id', post.user_id)
      .in('follower_id', batch);
    if (error) {
      if (!degradedFields.includes('audience')) degradedFields.push('audience');
      continue;
    }
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
  const lastEventAt = maxTimestamp([
    ...views.map((row) => row.viewed_at),
    ...likes.map((row) => row.created_at),
    ...comments.map((row) => row.created_at),
    ...reposts.map((row) => row.created_at),
    ...bookmarks.map((row) => row.created_at),
  ]);

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
      generated_at: new Date().toISOString(),
      data_source: 'client_fallback',
      last_event_at: lastEventAt,
      degraded_fields: degradedFields,
    },
  };
}

export function usePostInsights(postId: string | undefined, days = 28) {
  const { user } = useAuth();
  const [data, setData] = useState<PostInsightsData | null>(null);
  const [preview, setPreview] = useState<PostInsightsPreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const dataRef = useRef<PostInsightsData | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const load = useCallback(async (background = false) => {
    if (!postId || !user?.id) {
      if (!background) setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    if (background) setIsRefreshing(true);
    else {
      setIsLoading(true);
      setError(null);
    }

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

      if (requestId !== requestIdRef.current) return;

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

      if (requestId !== requestIdRef.current) return;

      if (!rpcResult.error && rpcResult.data) {
        const rpcData = rpcResult.data as PostInsightsData;
        const nextData: PostInsightsData = {
          ...rpcData,
          post: {
            ...rpcData.post,
            content: post.content ?? null,
            media_urls: post.media_urls ?? null,
          },
        };
        setData(nextData);
        setError(null);
        setIsFallback(false);
        setLastUpdatedAt(nextData.data_quality.generated_at ?? new Date().toISOString());
        return;
      }

      if (rpcResult.error && !isRecoverableInsightsRpc(rpcResult.error)) {
        throw rpcResult.error;
      }

      const fallback = await fallbackInsights(post, days);
      if (requestId !== requestIdRef.current) return;
      setData(fallback);
      setError(null);
      setIsFallback(true);
      setLastUpdatedAt(fallback.data_quality.generated_at ?? new Date().toISOString());
    } catch (cause) {
      if (requestId !== requestIdRef.current) return;
      console.error('Post insights load error:', cause);
      if (background && dataRef.current) return;
      setError(cause instanceof Error ? cause.message : 'Analitikani yuklab bo‘lmadi');
      setData(null);
      dataRef.current = null;
    } finally {
      if (requestId === requestIdRef.current) {
        if (background) setIsRefreshing(false);
        else setIsLoading(false);
      }
    }
  }, [days, postId, user?.id]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!postId || !user?.id) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          void load(true);
        }
      }, 450);
    };

    const channel = db
      .channel(`post-insights:${postId}:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_views', filter: `post_id=eq.${postId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes', filter: `post_id=eq.${postId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reposts', filter: `post_id=eq.${postId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookmarks', filter: `post_id=eq.${postId}` }, scheduleRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts', filter: `id=eq.${postId}` }, scheduleRefresh)
      .subscribe();

    const poll = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void load(true);
      }
    }, 30_000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibility);
      void db.removeChannel(channel);
    };
  }, [load, postId, user?.id]);

  const refresh = useCallback(() => load(false), [load]);

  return {
    data,
    preview,
    isLoading,
    isRefreshing,
    error,
    lastUpdatedAt,
    isFallback,
    refresh,
  };
}
