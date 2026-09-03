import { describe, expect, it } from 'vitest';

import {
  EMPTY_HOME_RECOMMENDATION_PROFILE,
  rankHomeRecommendations,
  type HomeRecommendationProfile,
} from './homeRecommendation';

const now = Date.parse('2026-09-03T10:00:00Z');

function post(
  id: string,
  userId: string,
  likes = 0,
  ageHours = 1,
) {
  return {
    id,
    user_id: userId,
    content: '',
    media_type: 'text',
    media_urls: [],
    hashtags: [],
    likes_count: likes,
    comments_count: 0,
    shares_count: 0,
    bookmarks_count: 0,
    reposts_count: 0,
    views_count: 20,
    created_at: new Date(now - ageHours * 3_600_000).toISOString(),
  };
}

function profile(
  patch: Partial<HomeRecommendationProfile>,
): HomeRecommendationProfile {
  return {
    ...EMPTY_HOME_RECOMMENDATION_PROFILE,
    ...patch,
  };
}

describe('home recommendation ranking', () => {
  it('boosts followed creators when candidates are otherwise comparable', () => {
    const ranked = rankHomeRecommendations(
      [post('stranger', 'u2', 3), post('followed', 'u1', 3)],
      profile({ following: new Set(['u1']) }),
      'viewer',
      now,
    );

    expect(ranked[0].id).toBe('followed');
  });

  it('hard-excludes posts marked not interested', () => {
    const ranked = rankHomeRecommendations(
      [post('hidden', 'u1', 100), post('visible', 'u2', 1)],
      profile({ hiddenPosts: new Set(['hidden']) }),
      'viewer',
      now,
    );

    expect(ranked.map((item) => item.id)).toEqual(['visible']);
  });

  it('strongly demotes posts viewed very recently', () => {
    const ranked = rankHomeRecommendations(
      [post('seen', 'u1', 20), post('fresh', 'u2', 1)],
      profile({ viewedAt: new Map([['seen', now - 60_000]]) }),
      'viewer',
      now,
    );

    expect(ranked[0].id).toBe('fresh');
  });

  it('does not allow one creator to monopolize the first slots', () => {
    const ranked = rankHomeRecommendations(
      [
        post('a1', 'creator-a', 12),
        post('a2', 'creator-a', 11),
        post('a3', 'creator-a', 10),
        post('b1', 'creator-b', 8),
      ],
      EMPTY_HOME_RECOMMENDATION_PROFILE,
      'viewer',
      now,
    );

    expect(ranked.slice(0, 3).filter((item) => item.user_id === 'creator-a')).toHaveLength(2);
  });
});
