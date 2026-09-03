export type RecommendationMediaBucket =
  | 'video'
  | 'image'
  | 'audio'
  | 'location'
  | 'text'
  | 'other';

export interface RecommendationPost {
  id: string;
  user_id: string;
  content?: string | null;
  created_at: string;
  media_type?: string | null;
  media_urls?: string[] | null;
  hashtags?: string[] | null;
  likes_count?: number | null;
  comments_count?: number | null;
  shares_count?: number | null;
  bookmarks_count?: number | null;
  reposts_count?: number | null;
  views_count?: number | null;
}

export interface HomeRecommendationProfile {
  following: ReadonlySet<string>;
  hiddenPosts: ReadonlySet<string>;
  viewedAt: ReadonlyMap<string, number>;
  creatorAffinity: ReadonlyMap<string, number>;
  hashtagAffinity: ReadonlyMap<string, number>;
  mediaAffinity: ReadonlyMap<RecommendationMediaBucket, number>;
  positivePostIds: ReadonlySet<string>;
}

export const EMPTY_HOME_RECOMMENDATION_PROFILE: HomeRecommendationProfile = {
  following: new Set<string>(),
  hiddenPosts: new Set<string>(),
  viewedAt: new Map<string, number>(),
  creatorAffinity: new Map<string, number>(),
  hashtagAffinity: new Map<string, number>(),
  mediaAffinity: new Map<RecommendationMediaBucket, number>(),
  positivePostIds: new Set<string>(),
};

function finiteCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function safeCreatedAt(value: string | null | undefined, now: number): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : now;
}

function deterministicNoise(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

export function recommendationMediaBucket(
  post: Pick<RecommendationPost, 'media_type' | 'media_urls'>,
): RecommendationMediaBucket {
  const type = String(post.media_type ?? '').toLowerCase();

  if (type.includes('video') || type === 'reel') return 'video';
  if (type.includes('image') || type === 'photo') return 'image';
  if (
    type.includes('audio') ||
    type.includes('music') ||
    type.includes('voice')
  ) {
    return 'audio';
  }
  if (type.includes('location') || type === 'map') return 'location';

  const firstUrl = post.media_urls?.[0] ?? '';
  if (/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(firstUrl)) return 'video';
  if (/\.(jpe?g|png|gif|webp|avif|heic)(\?|#|$)/i.test(firstUrl)) return 'image';
  if (/\.(mp3|wav|ogg|m4a|aac|flac|opus)(\?|#|$)/i.test(firstUrl)) return 'audio';

  if (!firstUrl && (!type || type === 'text' || type === 'post')) return 'text';
  return 'other';
}

export function recommendationHashtags(
  post: Pick<RecommendationPost, 'hashtags' | 'content'>,
): string[] {
  const tags = new Set<string>();

  for (const raw of post.hashtags ?? []) {
    const normalized = String(raw).trim().replace(/^#/, '').toLowerCase();
    if (normalized) tags.add(normalized);
  }

  const content = String(post.content ?? '');
  const regex = /#([^\s#.,!?;:()[\]{}"'<>]{2,64})/g;
  for (const match of content.matchAll(regex)) {
    const normalized = String(match[1] ?? '').trim().toLowerCase();
    if (normalized) tags.add(normalized);
  }

  return Array.from(tags).slice(0, 12);
}

interface ScoredPost<T> {
  post: T;
  score: number;
  media: RecommendationMediaBucket;
  seen: boolean;
}

function rawRecommendationScore<T extends RecommendationPost>(
  post: T,
  profile: HomeRecommendationProfile,
  userId: string | null,
  now: number,
): ScoredPost<T> {
  const createdAt = safeCreatedAt(post.created_at, now);
  const ageHours = Math.max(0, (now - createdAt) / 3_600_000);

  // Freshness decays smoothly instead of hard chronological ordering.
  const freshness = 4.8 * Math.exp(-ageHours / 60);

  const likes = finiteCount(post.likes_count);
  const comments = finiteCount(post.comments_count);
  const shares = finiteCount(post.shares_count);
  const bookmarks = finiteCount(post.bookmarks_count);
  const reposts = finiteCount(post.reposts_count);
  const views = finiteCount(post.views_count);

  const strongActions =
    likes * 1.8 +
    comments * 3.2 +
    shares * 2.5 +
    bookmarks * 3.5 +
    reposts * 3.8;

  // Logarithmic social proof prevents large accounts from fully dominating.
  const socialProof =
    Math.log1p(strongActions) * 0.9 + Math.log1p(views) * 0.22;

  // Quality/conversion signal: interactions relative to exposure.
  const conversion =
    views > 0
      ? Math.min(2.4, (strongActions / Math.sqrt(views + 24)) * 0.32)
      : Math.min(1.25, strongActions * 0.08);

  const followingBoost = profile.following.has(post.user_id) ? 3.2 : 0;

  const creatorAffinity = Math.min(
    4.2,
    Math.log1p(profile.creatorAffinity.get(post.user_id) ?? 0) * 1.35,
  );

  const tags = recommendationHashtags(post);
  const topicRaw = tags
    .map((tag) => profile.hashtagAffinity.get(tag) ?? 0)
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((sum, value) => sum + value, 0);
  const topicAffinity = Math.min(3.1, Math.log1p(topicRaw) * 1.05);

  const media = recommendationMediaBucket(post);
  const mediaAffinity = Math.min(
    1.7,
    Math.log1p(profile.mediaAffinity.get(media) ?? 0) * 0.72,
  );

  const viewedAt = profile.viewedAt.get(post.id);
  const seen = Boolean(viewedAt);
  let seenPenalty = 0;
  if (viewedAt) {
    const seenAgeHours = Math.max(0, (now - viewedAt) / 3_600_000);
    if (seenAgeHours < 6) seenPenalty = 7.5;
    else if (seenAgeHours < 24) seenPenalty = 5.2;
    else if (seenAgeHours < 24 * 7) seenPenalty = 2.8;
    else if (seenAgeHours < 24 * 30) seenPenalty = 1.1;
  }

  // Already-liked/saved/reposted posts may be resurfaced later, but not
  // immediately crowd out unseen discovery.
  const positiveReplayPenalty = profile.positivePostIds.has(post.id) ? 0.7 : 0;

  // Own posts remain visible but are not treated as recommendations.
  const ownPostPenalty = userId && post.user_id === userId ? 0.9 : 0;

  // Deterministic daily exploration noise avoids frozen ordering without
  // producing scroll-jumps on every render.
  const dayKey = new Date(now).toISOString().slice(0, 10);
  const exploration =
    deterministicNoise((userId ?? 'anonymous') + '|' + post.id + '|' + dayKey) *
    0.62;

  return {
    post,
    media,
    seen,
    score:
      freshness +
      socialProof +
      conversion +
      followingBoost +
      creatorAffinity +
      topicAffinity +
      mediaAffinity +
      exploration -
      seenPenalty -
      positiveReplayPenalty -
      ownPostPenalty,
  };
}

/**
 * Multi-signal personalized ranking + diversity re-ranking.
 *
 * Retrieval is handled by usePosts('recommended'); this function ranks the
 * candidate pool using behavior signals and then applies MMR-like penalties so
 * one creator or one media type does not monopolize the Home feed.
 */
export function rankHomeRecommendations<T extends RecommendationPost>(
  posts: T[],
  profile: HomeRecommendationProfile = EMPTY_HOME_RECOMMENDATION_PROFILE,
  userId: string | null = null,
  now = Date.now(),
): T[] {
  const unique = new Map<string, T>();
  for (const post of posts) {
    if (!post?.id || profile.hiddenPosts.has(post.id)) continue;
    if (!unique.has(post.id)) unique.set(post.id, post);
  }

  const pool = Array.from(unique.values())
    .map((post) => rawRecommendationScore(post, profile, userId, now))
    .sort((a, b) => b.score - a.score);

  const selected: ScoredPost<T>[] = [];

  while (pool.length > 0) {
    let bestIndex = 0;
    let bestAdjusted = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      const recent = selected.slice(-5);

      const recentAuthorCount = recent.filter(
        (entry) => entry.post.user_id === candidate.post.user_id,
      ).length;
      const totalAuthorCount = selected.filter(
        (entry) => entry.post.user_id === candidate.post.user_id,
      ).length;
      const recentMediaCount = recent.filter(
        (entry) => entry.media === candidate.media,
      ).length;

      let diversityPenalty =
        recentAuthorCount * 2.35 +
        Math.max(0, totalAuthorCount - 1) * 0.65 +
        Math.max(0, recentMediaCount - 2) * 0.75;

      // Every fifth slot gets a modest exploration opportunity for a strong
      // creator outside the follow graph, similar to discovery injection.
      const explorationSlot = selected.length > 0 && selected.length % 5 === 4;
      const discoveryBonus =
        explorationSlot &&
        !profile.following.has(candidate.post.user_id) &&
        candidate.post.user_id !== userId
          ? 0.72
          : 0;

      // Prefer unseen items when scores are otherwise close.
      const unseenBonus = candidate.seen ? 0 : 0.28;

      // Prevent three consecutive posts by the same creator when alternatives exist.
      if (
        selected.length >= 2 &&
        selected[selected.length - 1]?.post.user_id === candidate.post.user_id &&
        selected[selected.length - 2]?.post.user_id === candidate.post.user_id
      ) {
        diversityPenalty += 8;
      }

      const adjusted =
        candidate.score - diversityPenalty + discoveryBonus + unseenBonus;

      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestIndex = index;
      }
    }

    selected.push(pool.splice(bestIndex, 1)[0]);
  }

  return selected.map((entry) => entry.post);
}
