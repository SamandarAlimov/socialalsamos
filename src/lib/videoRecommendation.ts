export interface VideoRecommendationPost {
  id: string;
  user_id: string;
  content?: string | null;
  hashtags?: string[] | null;
  created_at: string;
  likes_count?: number | null;
  comments_count?: number | null;
  shares_count?: number | null;
  bookmarks_count?: number | null;
  views_count?: number | null;
}

export interface VideoRecommendationProfile {
  following: ReadonlySet<string>;
  hiddenPosts: ReadonlySet<string>;
  seenAt: ReadonlyMap<string, number>;
  retentionByPost: ReadonlyMap<string, number>;
  creatorAffinity: ReadonlyMap<string, number>;
  topicAffinity: ReadonlyMap<string, number>;
  positivePostIds: ReadonlySet<string>;
  explicitTopics: ReadonlySet<string>;
  globalScore: ReadonlyMap<string, number>;
  globalQuality: ReadonlyMap<string, number>;
}

export const EMPTY_VIDEO_RECOMMENDATION_PROFILE: VideoRecommendationProfile = {
  following: new Set<string>(),
  hiddenPosts: new Set<string>(),
  seenAt: new Map<string, number>(),
  retentionByPost: new Map<string, number>(),
  creatorAffinity: new Map<string, number>(),
  topicAffinity: new Map<string, number>(),
  positivePostIds: new Set<string>(),
  explicitTopics: new Set<string>(),
  globalScore: new Map<string, number>(),
  globalQuality: new Map<string, number>(),
};

const STOP_WORDS = new Set([
  'bilan', 'uchun', 'ham', 'yoki', 'lekin', 'mana', 'juda', 'qanday',
  'nima', 'nega', 'bor', 'yoq', 'the', 'and', 'for', 'with', 'this',
  'that', 'from', 'your', 'you', 'are', 'was', 'were', 'как', 'что',
  'это', 'для', 'или', 'при', 'его', 'она', 'они', 'hamma', 'video',
]);

function finite(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function signedLog(value: number): number {
  if (!value) return 0;
  return Math.sign(value) * Math.log1p(Math.abs(value));
}

function deterministicNoise(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function createdTimestamp(value: string, now: number): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : now;
}

export function extractVideoTopics(
  post: Pick<VideoRecommendationPost, 'hashtags' | 'content'>,
): string[] {
  const result = new Set<string>();

  for (const raw of post.hashtags ?? []) {
    const normalized = String(raw).trim().replace(/^#/, '').toLowerCase();
    if (normalized) result.add(normalized);
  }

  const content = String(post.content ?? '').toLowerCase();

  for (const match of content.matchAll(/#([^\s#.,!?;:()[\]{}"'<>]{2,64})/g)) {
    const tag = String(match[1] ?? '').trim().toLowerCase();
    if (tag) result.add(tag);
  }

  const words = content.match(/[\p{L}\p{N}_]{4,32}/gu) ?? [];
  for (const word of words) {
    const normalized = word.replace(/^_+|_+$/g, '');
    if (
      normalized.length >= 4 &&
      !STOP_WORDS.has(normalized) &&
      !/^\d+$/.test(normalized)
    ) {
      result.add(normalized);
    }
    if (result.size >= 18) break;
  }

  return Array.from(result).slice(0, 18);
}

function topicSimilarity(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const topic of left) {
    if (right.has(topic)) overlap += 1;
  }
  if (!overlap) return 0;
  return overlap / Math.sqrt(left.size * right.size);
}

interface ScoredVideo<T> {
  post: T;
  score: number;
  topics: Set<string>;
  seen: boolean;
}

function rawVideoScore<T extends VideoRecommendationPost>(
  post: T,
  profile: VideoRecommendationProfile,
  userId: string | null,
  contextTopics: ReadonlySet<string>,
  contextAuthorId: string | null,
  now: number,
): ScoredVideo<T> {
  const ageHours = Math.max(
    0,
    (now - createdTimestamp(post.created_at, now)) / 3_600_000,
  );

  // Reels can resurface evergreen content, therefore freshness has both a
  // short-term impulse and a long tail instead of a hard chronological cutoff.
  const freshness =
    3.4 * Math.exp(-ageHours / 120) +
    0.7 * Math.exp(-ageHours / 24 / 45);

  const likes = Math.max(0, finite(post.likes_count));
  const comments = Math.max(0, finite(post.comments_count));
  const shares = Math.max(0, finite(post.shares_count));
  const saves = Math.max(0, finite(post.bookmarks_count));
  const views = Math.max(0, finite(post.views_count));

  const strongActions =
    likes * 1.7 + comments * 3.6 + shares * 3.1 + saves * 4.4;

  const engagement =
    Math.log1p(strongActions) * 0.82 + Math.log1p(views) * 0.17;

  const conversion =
    views > 0
      ? Math.min(2.8, (strongActions / Math.sqrt(views + 28)) * 0.31)
      : Math.min(1.3, strongActions * 0.08);

  // Server-computed global rank blends retention, completion, engagement and
  // freshness. Values are normalized to 0..1 by the profile loader.
  const globalRank = (profile.globalScore.get(post.id) ?? 0) * 4.8;
  const globalQuality = (profile.globalQuality.get(post.id) ?? 0) * 2.4;

  const followingBoost = profile.following.has(post.user_id) ? 1.8 : 0;

  const creatorAffinity = Math.max(
    -5,
    Math.min(
      5,
      signedLog(profile.creatorAffinity.get(post.user_id) ?? 0) * 1.45,
    ),
  );

  const topics = new Set(extractVideoTopics(post));
  const topicSignals = Array.from(topics)
    .map((topic) => profile.topicAffinity.get(topic) ?? 0)
    .sort((a, b) => Math.abs(b) - Math.abs(a))
    .slice(0, 5)
    .reduce((sum, value) => sum + value, 0);

  const topicAffinity = Math.max(
    -4.5,
    Math.min(4.5, signedLog(topicSignals) * 1.35),
  );

  let explicitTopicBoost = 0;
  for (const topic of topics) {
    if (profile.explicitTopics.has(topic)) explicitTopicBoost += 0.55;
  }
  explicitTopicBoost = Math.min(2.2, explicitTopicBoost);

  // Watch page needs "what should I watch next?", not merely the global feed.
  const contextualTopicBoost = topicSimilarity(topics, contextTopics) * 4.1;
  const contextualCreatorBoost =
    contextAuthorId && contextAuthorId === post.user_id ? 0.65 : 0;

  const viewedAt = profile.seenAt.get(post.id);
  const seen = Boolean(viewedAt);
  let seenPenalty = 0;
  if (viewedAt) {
    const seenAgeHours = Math.max(0, (now - viewedAt) / 3_600_000);
    if (seenAgeHours < 4) seenPenalty = 10;
    else if (seenAgeHours < 18) seenPenalty = 6.4;
    else if (seenAgeHours < 24 * 3) seenPenalty = 3.8;
    else if (seenAgeHours < 24 * 14) seenPenalty = 1.8;
    else if (seenAgeHours < 24 * 45) seenPenalty = 0.7;
  }

  const previousRetention = profile.retentionByPost.get(post.id);
  const lowRetentionPenalty =
    previousRetention !== undefined && previousRetention < 0.18 ? 2.5 : 0;

  const positiveReplayPenalty = profile.positivePostIds.has(post.id) ? 0.55 : 0;
  const ownPostPenalty = userId && post.user_id === userId ? 1.5 : 0;

  const dayKey = new Date(now).toISOString().slice(0, 10);
  const exploration =
    deterministicNoise((userId ?? 'anon') + '|' + post.id + '|' + dayKey) *
    0.58;

  return {
    post,
    topics,
    seen,
    score:
      freshness +
      engagement +
      conversion +
      globalRank +
      globalQuality +
      followingBoost +
      creatorAffinity +
      topicAffinity +
      explicitTopicBoost +
      contextualTopicBoost +
      contextualCreatorBoost +
      exploration -
      seenPenalty -
      lowRetentionPenalty -
      positiveReplayPenalty -
      ownPostPenalty,
  };
}

export function rankVideoRecommendations<T extends VideoRecommendationPost>(
  posts: T[],
  profile: VideoRecommendationProfile = EMPTY_VIDEO_RECOMMENDATION_PROFILE,
  userId: string | null = null,
  contextPost: T | null = null,
  now = Date.now(),
): T[] {
  const unique = new Map<string, T>();
  for (const post of posts) {
    if (!post?.id || profile.hiddenPosts.has(post.id)) continue;
    if (!unique.has(post.id)) unique.set(post.id, post);
  }

  const contextTopics = new Set(
    contextPost ? extractVideoTopics(contextPost) : [],
  );
  const contextAuthorId = contextPost?.user_id ?? null;

  const pool = Array.from(unique.values())
    .map((post) =>
      rawVideoScore(
        post,
        profile,
        userId,
        contextTopics,
        contextAuthorId,
        now,
      ),
    )
    .sort((a, b) => b.score - a.score);

  const selected: ScoredVideo<T>[] = [];

  while (pool.length > 0) {
    let bestIndex = 0;
    let bestAdjustedScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      const recent = selected.slice(-5);

      const sameAuthorRecent = recent.filter(
        (entry) => entry.post.user_id === candidate.post.user_id,
      ).length;
      const sameAuthorTotal = selected.filter(
        (entry) => entry.post.user_id === candidate.post.user_id,
      ).length;

      let topicOverlapPenalty = 0;
      for (const entry of recent.slice(-3)) {
        topicOverlapPenalty += topicSimilarity(
          entry.topics,
          candidate.topics,
        ) * 0.78;
      }

      let diversityPenalty =
        sameAuthorRecent * 2.65 +
        Math.max(0, sameAuthorTotal - 1) * 0.55 +
        topicOverlapPenalty;

      if (
        selected.length >= 2 &&
        selected[selected.length - 1]?.post.user_id === candidate.post.user_id &&
        selected[selected.length - 2]?.post.user_id === candidate.post.user_id
      ) {
        diversityPenalty += 9;
      }

      // Controlled exploration: approximately every sixth slot gives a good
      // unseen creator outside the follow graph a fair chance.
      const explorationSlot = selected.length > 0 && selected.length % 6 === 5;
      const discoveryBonus =
        explorationSlot &&
        !profile.following.has(candidate.post.user_id) &&
        candidate.post.user_id !== userId &&
        !candidate.seen
          ? 1.05
          : 0;

      const unseenBonus = candidate.seen ? 0 : 0.34;
      const adjusted =
        candidate.score - diversityPenalty + discoveryBonus + unseenBonus;

      if (adjusted > bestAdjustedScore) {
        bestAdjustedScore = adjusted;
        bestIndex = index;
      }
    }

    selected.push(pool.splice(bestIndex, 1)[0]);
  }

  return selected.map((entry) => entry.post);
}
