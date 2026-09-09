import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('canonical public engagement counters', () => {
  it('counts interaction rows exactly instead of counting a row-limited payload', () => {
    const hook = source('hooks/useRealtimePostCounts.ts');

    expect(hook).toContain("select('id', { count: 'exact', head: true })");
    expect(hook).toContain("exactCount('post_likes', postId)");
    expect(hook).toContain("exactCount('comments', postId)");
    expect(hook).toContain("exactCount('post_views', postId)");
    expect(hook).toContain("exactCount('reposts', postId)");
    expect(hook).not.toContain("select('post_id').in('post_id', postIds)");
  });

  it('overwrites stale video post counters before rendering/ranking', () => {
    const recommendations = source('hooks/useVideoRecommendations.ts');

    expect(recommendations).toContain('const canonicalCandidates = useMemo');
    expect(recommendations).toContain('likes_count: count.likes_count');
    expect(recommendations).toContain('comments_count: count.comments_count');
    expect(recommendations).toContain('views_count: count.views_count');
    expect(recommendations).toContain('isReady: isReady && canonicalCountsReady');
  });

  it('renders canonical feed counts and never falls back from a real zero view count', () => {
    const card = source('components/posts/FeedPostCard.tsx');

    expect(card).toContain('const viewsCount = realtimeCounts.views_count');
    expect(card).toContain('const repostsCount = realtimeCounts.reposts_count');
    expect(card).toContain('viewsCount={viewsCount}');
    expect(card).toContain('initialCount={repostsCount}');
    expect(card).not.toContain('views_count || post.views_count');
    expect(card).not.toContain('{post.shares_count ?? 0}');
  });

  it('uses the exact post_likes count inside the likes dialog', () => {
    const dialog = source('components/PostLikesDialog.tsx');

    expect(dialog).toContain("{ count: 'exact' }");
    expect(dialog).toContain('canonicalLikesCount');
    expect(dialog).toContain('setCanonicalLikesCount(Math.max(0, Number(count ?? 0)))');
  });
});
