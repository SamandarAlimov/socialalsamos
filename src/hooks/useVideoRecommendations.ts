import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import type { VideoPost } from '@/hooks/useVideoPosts';
import db from '@/lib/supabaseAny';
import {
  EMPTY_VIDEO_RECOMMENDATION_PROFILE,
  extractVideoTopics,
  rankVideoRecommendations,
  type VideoRecommendationProfile,
} from '@/lib/videoRecommendation';

const PROFILE_TTL_MS = 8 * 60 * 1000;
const SIGNAL_LIMIT = 500;

const profileCache = new Map<
  string,
  { expiresAt: number; profile: VideoRecommendationProfile }
>();

type AnyRow = Record<string, any>;

function settledRows(result: PromiseSettledResult<any>): AnyRow[] {
  if (result.status !== 'fulfilled' || result.value?.error) return [];
  return Array.isArray(result.value?.data) ? result.value.data : [];
}

function settledData(result: PromiseSettledResult<any>): AnyRow | null {
  if (result.status !== 'fulfilled' || result.value?.error) return null;
  return result.value?.data && !Array.isArray(result.value.data)
    ? result.value.data
    : null;
}

function eventTime(row: AnyRow, field: string): number {
  const parsed = Date.parse(String(row?.[field] ?? ''));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function decay(weight: number, occurredAt: number, halfLifeDays = 35): number {
  const ageDays = Math.max(0, (Date.now() - occurredAt) / 86_400_000);
  return weight * Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
}

function increment<K>(map: Map<K, number>, key: K, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function normalizeRanking(
  rows: AnyRow[],
  field: 'score' | 'quality_score',
): Map<string, number> {
  const values = rows
    .map((row) => Number(row[field] ?? 0))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return new Map();

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.000001, max - min);
  const result = new Map<string, number>();

  for (const row of rows) {
    const postId = String(row.post_id ?? '');
    const value = Number(row[field] ?? 0);
    if (!postId || !Number.isFinite(value)) continue;
    result.set(postId, max === min ? (value > 0 ? 1 : 0) : (value - min) / span);
  }
  return result;
}

async function loadVideoRecommendationProfile(
  userId: string | null,
  force = false,
): Promise<VideoRecommendationProfile> {
  const cacheKey = userId ?? '__anonymous__';
  const cached = profileCache.get(cacheKey);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.profile;

  const globalRankingPromise = db
    .from('recommendation_global_rankings')
    .select(
      'post_id, score, quality_score, engagement_score, freshness_score, calculated_at',
    )
    .eq('content_mode', 'video')
    .order('score', { ascending: false })
    .limit(350);

  if (!userId) {
    const [globalResult] = await Promise.allSettled([globalRankingPromise]);
    const globalRows = settledRows(globalResult);
    const profile: VideoRecommendationProfile = {
      ...EMPTY_VIDEO_RECOMMENDATION_PROFILE,
      globalScore: normalizeRanking(globalRows, 'score'),
      globalQuality: normalizeRanking(globalRows, 'quality_score'),
    };
    profileCache.set(cacheKey, {
      profile,
      expiresAt: Date.now() + PROFILE_TTL_MS,
    });
    return profile;
  }

  const results = await Promise.allSettled([
    db
      .from('follows')
      .select('following_id, created_at')
      .eq('follower_id', userId)
      .limit(1500),
    db
      .from('post_likes')
      .select('post_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(SIGNAL_LIMIT),
    db
      .from('comments')
      .select('post_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(SIGNAL_LIMIT),
    db
      .from('post_bookmarks')
      .select('post_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(SIGNAL_LIMIT),
    db
      .from('reposts')
      .select('post_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(SIGNAL_LIMIT),
    db
      .from('video_watch_sessions')
      .select(
        'post_id, watched_seconds, duration_seconds, max_position_seconds, completed, created_at',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(SIGNAL_LIMIT * 2),
    db
      .from('content_hides')
      .select('post_id, created_at, reason')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(SIGNAL_LIMIT),
    db
      .from('recommendation_events')
      .select('post_id, event_type, weight, dwell_ms, created_at, source')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(SIGNAL_LIMIT),
    db
      .from('ai_preferences')
      .select('recommendation_topics')
      .eq('user_id', userId)
      .maybeSingle(),
    globalRankingPromise,
  ]);

  const followingRows = settledRows(results[0]);
  const likeRows = settledRows(results[1]);
  const commentRows = settledRows(results[2]);
  const bookmarkRows = settledRows(results[3]);
  const repostRows = settledRows(results[4]);
  const watchRows = settledRows(results[5]);
  const hiddenRows = settledRows(results[6]);
  const recommendationRows = settledRows(results[7]);
  const preferenceRow = settledData(results[8]);
  const globalRows = settledRows(results[9]);

  const following = new Set(
    followingRows.map((row) => String(row.following_id)).filter(Boolean),
  );
  const hiddenPosts = new Set(
    hiddenRows.map((row) => String(row.post_id)).filter(Boolean),
  );
  const explicitTopics = new Set(
    (Array.isArray(preferenceRow?.recommendation_topics)
      ? preferenceRow?.recommendation_topics
      : []
    )
      .map((topic: unknown) => String(topic).trim().replace(/^#/, '').toLowerCase())
      .filter(Boolean),
  );

  const positivePostIds = new Set<string>();
  const seenAt = new Map<string, number>();
  const retentionByPost = new Map<string, number>();
  const postWeights = new Map<string, number>();

  const addActionRows = (
    rows: AnyRow[],
    baseWeight: number,
    positive = true,
  ) => {
    for (const row of rows) {
      const postId = String(row.post_id ?? '');
      if (!postId) continue;
      increment(
        postWeights,
        postId,
        decay(baseWeight, eventTime(row, 'created_at')),
      );
      if (positive) positivePostIds.add(postId);
    }
  };

  addActionRows(likeRows, 3.8);
  addActionRows(commentRows, 5.1);
  addActionRows(bookmarkRows, 6.2);
  addActionRows(repostRows, 6.5);

  for (const row of watchRows) {
    const postId = String(row.post_id ?? '');
    if (!postId) continue;

    const watched = Math.max(0, Number(row.watched_seconds ?? 0));
    const duration = Math.max(0, Number(row.duration_seconds ?? 0));
    const retention =
      duration > 0
        ? Math.min(2.5, watched / duration)
        : Math.min(1.25, watched / 30);
    const occurredAt = eventTime(row, 'created_at');

    let signal = 0;
    if (row.completed) signal = 6.4;
    else if (retention >= 1) signal = 5.4 + Math.min(1.8, retention - 1);
    else if (retention >= 0.75) signal = 4.2;
    else if (retention >= 0.5) signal = 2.7;
    else if (retention >= 0.25) signal = 1.1;
    else if (retention < 0.1 && watched < 4.5) signal = -3.4;
    else if (retention < 0.2) signal = -1.8;
    else signal = 0.25;

    increment(postWeights, postId, decay(signal, occurredAt, 28));
    seenAt.set(postId, Math.max(seenAt.get(postId) ?? 0, occurredAt));

    // Query is newest-first. Latest session best represents current taste.
    if (!retentionByPost.has(postId)) retentionByPost.set(postId, retention);
    if (row.completed || retention >= 0.78) positivePostIds.add(postId);
  }

  // Canonical recommendation event stream is optional and schema-safe. Watch
  // sessions remain the source of truth if this table is unavailable.
  for (const row of recommendationRows) {
    const postId = String(row.post_id ?? '');
    if (!postId) continue;
    const rawWeight = Math.max(-8, Math.min(8, Number(row.weight ?? 0)));
    const dwellBonus = Math.min(1.2, Math.max(0, Number(row.dwell_ms ?? 0)) / 45_000);
    increment(
      postWeights,
      postId,
      decay(rawWeight + (rawWeight > 0 ? dwellBonus : 0), eventTime(row, 'created_at'), 30),
    );
  }

  const interactionIds = Array.from(
    new Set([...postWeights.keys(), ...seenAt.keys()]),
  ).slice(0, 1000);

  const creatorAffinity = new Map<string, number>();
  const topicAffinity = new Map<string, number>();

  if (interactionIds.length > 0) {
    const { data: metadataRows } = await db
      .from('posts')
      .select('id, user_id, content, hashtags, media_type')
      .in('id', interactionIds);

    for (const row of (metadataRows ?? []) as AnyRow[]) {
      const postId = String(row.id ?? '');
      const weight = postWeights.get(postId) ?? 0;
      if (!postId || !weight) continue;

      const authorId = String(row.user_id ?? '');
      if (authorId) increment(creatorAffinity, authorId, weight);

      const topics = extractVideoTopics({
        content: row.content,
        hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
      });
      for (const topic of topics) {
        increment(topicAffinity, topic, weight);
      }
    }
  }

  const profile: VideoRecommendationProfile = {
    following,
    hiddenPosts,
    seenAt,
    retentionByPost,
    creatorAffinity,
    topicAffinity,
    positivePostIds,
    explicitTopics,
    globalScore: normalizeRanking(globalRows, 'score'),
    globalQuality: normalizeRanking(globalRows, 'quality_score'),
  };

  profileCache.set(cacheKey, {
    profile,
    expiresAt: Date.now() + PROFILE_TTL_MS,
  });

  return profile;
}

export function useVideoRecommendations(candidates: VideoPost[]) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [profile, setProfile] = useState<VideoRecommendationProfile>(
    EMPTY_VIDEO_RECOMMENDATION_PROFILE,
  );
  const [isReady, setIsReady] = useState(false);
  const [feedOrderIds, setFeedOrderIds] = useState<string[]>([]);
  const profileKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = userId ?? '__anonymous__';
    let active = true;

    if (profileKeyRef.current !== key) {
      profileKeyRef.current = key;
      setFeedOrderIds([]);
      setIsReady(false);
    }

    void loadVideoRecommendationProfile(userId)
      .then((next) => {
        if (!active) return;
        setProfile(next);
        setIsReady(true);
      })
      .catch(() => {
        if (!active) return;
        setProfile(EMPTY_VIDEO_RECOMMENDATION_PROFILE);
        setIsReady(true);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const rankedSnapshot = useMemo(
    () => rankVideoRecommendations(candidates, profile, userId),
    [candidates, profile, userId],
  );

  // Once a session has started, do not reshuffle already-present items when
  // loadMore/realtime adds candidates. Only newly arrived candidates are ranked
  // and appended, preventing active video jumps.
  useEffect(() => {
    if (!isReady || candidates.length === 0) return;

    setFeedOrderIds((previous) => {
      if (previous.length === 0) return rankedSnapshot.map((video) => video.id);

      const available = new Set(candidates.map((video) => video.id));
      const kept = previous.filter((id) => available.has(id));
      const known = new Set(kept);
      const newcomers = candidates.filter((video) => !known.has(video.id));

      if (newcomers.length === 0) return kept;

      const rankedNewcomers = rankVideoRecommendations(
        newcomers,
        profile,
        userId,
      ).map((video) => video.id);

      return [...kept, ...rankedNewcomers];
    });
  }, [candidates, isReady, profile, rankedSnapshot, userId]);

  const feedVideos = useMemo(() => {
    if (!isReady || feedOrderIds.length === 0) return rankedSnapshot;

    const byId = new Map(candidates.map((video) => [video.id, video]));
    const ordered = feedOrderIds
      .map((id) => byId.get(id))
      .filter((video): video is VideoPost => Boolean(video));
    const orderedIds = new Set(ordered.map((video) => video.id));
    const missing = rankedSnapshot.filter((video) => !orderedIds.has(video.id));

    return [...ordered, ...missing];
  }, [candidates, feedOrderIds, isReady, rankedSnapshot]);

  const rankForContext = useCallback(
    (activeVideoId: string | null) => {
      const active = candidates.find((video) => video.id === activeVideoId) ?? null;
      const ranked = rankVideoRecommendations(
        candidates,
        profile,
        userId,
        active,
      );

      if (!active) return ranked;
      return [active, ...ranked.filter((video) => video.id !== active.id)];
    },
    [candidates, profile, userId],
  );

  const refreshProfile = useCallback(async () => {
    const key = userId ?? '__anonymous__';
    profileCache.delete(key);
    const next = await loadVideoRecommendationProfile(userId, true);
    setProfile(next);
  }, [userId]);

  return {
    feedVideos,
    rankForContext,
    profile,
    isReady,
    refreshProfile,
  };
}
