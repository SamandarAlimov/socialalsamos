import { describe, expect, it } from 'vitest';

import {
  EMPTY_VIDEO_RECOMMENDATION_PROFILE,
  rankVideoRecommendations,
  type VideoRecommendationProfile,
} from './videoRecommendation';

const now = Date.parse('2026-09-03T07:30:00Z');

function video(
  id: string,
  userId: string,
  topic: string,
  likes = 1,
) {
  return {
    id,
    user_id: userId,
    content: '#' + topic,
    hashtags: [topic],
    created_at: new Date(now - 3_600_000).toISOString(),
    likes_count: likes,
    comments_count: 0,
    shares_count: 0,
    bookmarks_count: 0,
    views_count: 30,
  };
}

function profile(
  patch: Partial<VideoRecommendationProfile>,
): VideoRecommendationProfile {
  return {
    ...EMPTY_VIDEO_RECOMMENDATION_PROFILE,
    ...patch,
  };
}

describe('video recommendation ranking', () => {
  it('uses strong creator affinity from watch behavior', () => {
    const ranked = rankVideoRecommendations(
      [video('a', 'creator-a', 'travel'), video('b', 'creator-b', 'travel')],
      profile({ creatorAffinity: new Map([['creator-b', 12]]) }),
      'viewer',
      null,
      now,
    );
    expect(ranked[0].id).toBe('b');
  });

  it('demotes recently watched videos even when they have more likes', () => {
    const ranked = rankVideoRecommendations(
      [video('seen', 'a', 'tech', 30), video('fresh', 'b', 'tech', 2)],
      profile({ seenAt: new Map([['seen', now - 60_000]]) }),
      'viewer',
      null,
      now,
    );
    expect(ranked[0].id).toBe('fresh');
  });

  it('hard excludes hidden/not-interested videos', () => {
    const ranked = rankVideoRecommendations(
      [video('hidden', 'a', 'food', 100), video('ok', 'b', 'food')],
      profile({ hiddenPosts: new Set(['hidden']) }),
      'viewer',
      null,
      now,
    );
    expect(ranked.map((item) => item.id)).toEqual(['ok']);
  });

  it('boosts contextually related videos in watch-next ranking', () => {
    const context = video('context', 'root', 'quran');
    const ranked = rankVideoRecommendations(
      [
        video('unrelated', 'a', 'cars', 6),
        video('related', 'b', 'quran', 1),
      ],
      EMPTY_VIDEO_RECOMMENDATION_PROFILE,
      'viewer',
      context,
      now,
    );
    expect(ranked[0].id).toBe('related');
  });

  it('prevents a single creator from monopolizing early slots', () => {
    const ranked = rankVideoRecommendations(
      [
        video('a1', 'creator-a', 'one', 12),
        video('a2', 'creator-a', 'two', 11),
        video('a3', 'creator-a', 'three', 10),
        video('b1', 'creator-b', 'four', 8),
      ],
      EMPTY_VIDEO_RECOMMENDATION_PROFILE,
      'viewer',
      null,
      now,
    );
    expect(
      ranked.slice(0, 3).filter((item) => item.user_id === 'creator-a'),
    ).toHaveLength(2);
  });
});
