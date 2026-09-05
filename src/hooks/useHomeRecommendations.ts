import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import type { Post } from '@/hooks/usePosts';
import { db } from '@/lib/db';
import {
  EMPTY_HOME_RECOMMENDATION_PROFILE,
  rankHomeRecommendations,
  recommendationHashtags,
  recommendationMediaBucket,
  type HomeRecommendationProfile,
  type RecommendationMediaBucket,
} from '@/lib/homeRecommendation';

const PROFILE_TTL_MS = 5 * 60 * 1000;
const SIGNAL_LIMIT = 350;

const profileCache = new Map<
  string,
  { expiresAt: number; profile: HomeRecommendationProfile }
>();

type AnyRow = Record<string, any>;

function settledRows(result: PromiseSettledResult<any>): AnyRow[] {
  if (result.status !== 'fulfilled') return [];
  if (result.value?.error) return [];
  return Array.isArray(result.value?.data) ? result.value.data : [];
}

function eventTime(row: AnyRow, field: string): number {
  const parsed = Date.parse(String(row?.[field] ?? ''));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function decayedWeight(weight: number, occurredAt: number): number {
  const ageDays = Math.max(0, (Date.now() - occurredAt) / 86_400_000);
  return weight * Math.exp(-ageDays / 45);
}

function increment<K>(map: Map<K, number>, key: K, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function normalizeExplicitTopic(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/^#/, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
    .slice(0, 120);
}

/**
 * Shared, cached interest graph used by both Home ranking and Ads Delivery.
 * It blends behavioral affinity with explicit user-controlled preferences.
 */
export async function loadRecommendationProfileForUser(
  userId: string,
  force = false,
): Promise<HomeRecommendationProfile> {
  const cached = profileCache.get(userId);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.profile;

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
      .from('bookmarks')
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
      .from('post_views')
      .select('post_id, viewed_at')
      .eq('user_id', userId)
      .order('viewed_at', { ascending: false })
      .limit(SIGNAL_LIMIT * 2),
    db
      .from('content_hides')
      .select('post_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(SIGNAL_LIMIT),
    db
      .from('video_watch_sessions')
      .select('post_id, watched_seconds, duration_seconds, completed, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(SIGNAL_LIMIT),
    db
      .from('user_recommendation_interests')
      .select('topic, weight, source, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(100),
  ]);

  const followingRows = settledRows(results[0]);
  const likeRows = settledRows(results[1]);
  const commentRows = settledRows(results[2]);
  const bookmarkRows = settledRows(results[3]);
  const repostRows = settledRows(results[4]);
  const viewRows = settledRows(results[5]);
  const hiddenRows = settledRows(results[6]);
  const watchRows = settledRows(results[7]);
  const explicitRows = settledRows(results[8]);

  const following = new Set(
    followingRows.map((row) => String(row.following_id)).filter(Boolean),
  );
  const hiddenPosts = new Set(
    hiddenRows.map((row) => String(row.post_id)).filter(Boolean),
  );
  const explicitTopicAffinity = new Map<string, number>();
  for (const row of explicitRows) {
    const topic = normalizeExplicitTopic(row.topic);
    const weight = Math.max(-3, Math.min(3, Number(row.weight ?? 0)));
    if (!topic || !Number.isFinite(weight) || weight === 0) continue;
    explicitTopicAffinity.set(topic, weight);
  }

  const positivePostIds = new Set<string>();
  const viewedAt = new Map<string, number>();
  const postWeights = new Map<string, number>();

  const addRows = (
    rows: AnyRow[],
    field: string,
    weight: number | ((row: AnyRow) => number),
    positive = false,
  ) => {
    for (const row of rows) {
      const postId = String(row.post_id ?? '');
      if (!postId) continue;
      const occurredAt = eventTime(row, field);
      const rawWeight = typeof weight === 'function' ? weight(row) : weight;
      increment(postWeights, postId, decayedWeight(rawWeight, occurredAt));
      if (positive) positivePostIds.add(postId);
    }
  };

  addRows(likeRows, 'created_at', 3.5, true);
  addRows(commentRows, 'created_at', 4.5, true);
  addRows(bookmarkRows, 'created_at', 5.2, true);
  addRows(repostRows, 'created_at', 5.5, true);
  addRows(viewRows, 'viewed_at', 0.42, false);
  addRows(
    watchRows,
    'created_at',
    (row) => {
      const watched = Math.max(0, Number(row.watched_seconds ?? 0));
      const duration = Math.max(0, Number(row.duration_seconds ?? 0));
      const retention =
        duration > 0 ? Math.min(1.25, watched / duration) : Math.min(1, watched / 30);
      return 1 + retention * 4 + (row.completed ? 1.4 : 0);
    },
    false,
  );

  for (const row of viewRows) {
    const postId = String(row.post_id ?? '');
    if (!postId) continue;
    const timestamp = eventTime(row, 'viewed_at');
    viewedAt.set(postId, Math.max(viewedAt.get(postId) ?? 0, timestamp));
  }
  for (const row of watchRows) {
    const postId = String(row.post_id ?? '');
    if (!postId) continue;
    const timestamp = eventTime(row, 'created_at');
    viewedAt.set(postId, Math.max(viewedAt.get(postId) ?? 0, timestamp));
  }

  const interactedPostIds = Array.from(
    new Set([
      ...postWeights.keys(),
      ...positivePostIds,
      ...viewedAt.keys(),
    ]),
  ).slice(0, 900);

  const creatorAffinity = new Map<string, number>();
  const hashtagAffinity = new Map<string, number>();
  const mediaAffinity = new Map<RecommendationMediaBucket, number>();

  if (interactedPostIds.length > 0) {
    let metadataResult = await db
      .from('posts')
      .select('id, user_id, content, media_type, media_urls, hashtags, created_at')
      .in('id', interactedPostIds);

    if (metadataResult.error) {
      metadataResult = await db
        .from('posts')
        .select('id, user_id, content, media_type, media_urls, created_at')
        .in('id', interactedPostIds);
    }

    const [hashtagResult] = await Promise.allSettled([
      db
        .from('post_hashtags')
        .select('post_id, hashtag')
        .in('post_id', interactedPostIds),
    ]);

    const hashtagsByPost = new Map<string, Set<string>>();
    for (const row of settledRows(hashtagResult)) {
      const postId = String(row.post_id ?? '');
      const hashtag = String(row.hashtag ?? '')
        .trim()
        .replace(/^#/, '')
        .toLowerCase();
      if (!postId || !hashtag) continue;
      const set = hashtagsByPost.get(postId) ?? new Set<string>();
      set.add(hashtag);
      hashtagsByPost.set(postId, set);
    }

    for (const row of (metadataResult.data ?? []) as AnyRow[]) {
      const postId = String(row.id ?? '');
      const weight = postWeights.get(postId) ?? 0;
      if (!postId || weight <= 0) continue;

      const authorId = String(row.user_id ?? '');
      if (authorId) increment(creatorAffinity, authorId, weight);

      const media = recommendationMediaBucket({
        media_type: row.media_type,
        media_urls: row.media_urls,
      });
      increment(mediaAffinity, media, weight);

      const tags = new Set(
        recommendationHashtags({
          hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
          content: row.content,
        }),
      );
      for (const tag of hashtagsByPost.get(postId) ?? []) tags.add(tag);
      for (const tag of tags) increment(hashtagAffinity, tag, weight);
    }
  }

  const profile: HomeRecommendationProfile = {
    following,
    hiddenPosts,
    viewedAt,
    creatorAffinity,
    hashtagAffinity,
    mediaAffinity,
    positivePostIds,
    explicitTopicAffinity,
  };

  profileCache.set(userId, {
    profile,
    expiresAt: Date.now() + PROFILE_TTL_MS,
  });

  return profile;
}

export function useHomeRecommendations(posts: Post[]) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<HomeRecommendationProfile>(
    EMPTY_HOME_RECOMMENDATION_PROFILE,
  );
  const [isPersonalizing, setIsPersonalizing] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setProfile(EMPTY_HOME_RECOMMENDATION_PROFILE);
      setIsPersonalizing(false);
      return;
    }

    let active = true;
    setIsPersonalizing(true);

    void loadRecommendationProfileForUser(user.id)
      .then((next) => {
        if (active) setProfile(next);
      })
      .finally(() => {
        if (active) setIsPersonalizing(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) {
      setProfile(EMPTY_HOME_RECOMMENDATION_PROFILE);
      return;
    }

    profileCache.delete(user.id);
    setIsPersonalizing(true);
    try {
      const next = await loadRecommendationProfileForUser(user.id, true);
      setProfile(next);
    } finally {
      setIsPersonalizing(false);
    }
  }, [user?.id]);

  const rankedPosts = useMemo(
    () =>
      rankHomeRecommendations(
        posts,
        profile,
        user?.id ?? null,
      ),
    [posts, profile, user?.id],
  );

  return {
    rankedPosts,
    profile,
    isPersonalizing,
    refreshProfile,
  };
}
