import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatPostDateTime } from './postDateTime';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), 'src', path), 'utf8');
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

  it('uses the shared premium comments and likes/views surfaces in profile feed cards', () => {
    const card = source('components/posts/FeedPostCard.tsx');

    expect(card).toContain("import { VideoCommentsSheet } from '@/components/VideoCommentsSheet'");
    expect(card).toContain("import { PostLikesViewsDialog } from '@/components/PostLikesViewsDialog'");
    expect(card).toContain('previewVideo={false}');
    expect(card).toContain("openAudience('likes')");
    expect(card).toContain("openAudience('views')");
    expect(card).toContain('defaultTab={audienceDefaultTab}');
    expect(card).not.toContain("import { CommentsSection } from '@/components/CommentsSection'");
    expect(card).not.toContain("import { PostLikesDialog } from '@/components/PostLikesDialog'");
    expect(card).not.toContain("import { PostViewsDialog } from '@/components/PostViewsDialog'");
  });

  it('uses the exact post_likes count inside the likes dialog', () => {
    const dialog = source('components/PostLikesDialog.tsx');

    expect(dialog).toContain("{ count: 'exact' }");
    expect(dialog).toContain('canonicalLikesCount');
    expect(dialog).toContain('setCanonicalLikesCount(Math.max(0, Number(count ?? 0)))');
  });

  it('keeps Home and Videos hearts optimistic until canonical realtime confirms them', () => {
    const helper = source('lib/postLikes.ts');
    const realtime = source('hooks/useRealtimePostCounts.ts');
    const home = source('hooks/usePosts.ts');
    const videos = source('hooks/useVideoPosts.ts');

    expect(helper).toContain('POST_LIKE_OPTIMISTIC_EVENT');
    expect(helper).toContain("phase: 'optimistic'");
    expect(helper).toContain("phase: 'confirmed'");
    expect(helper).toContain("phase: 'rollback'");
    expect(helper).toContain("onConflict: 'post_id,user_id'");
    expect(realtime).toContain('optimisticLikesRef');
    expect(realtime).toContain('overlayOptimisticLike');
    expect(realtime).toContain('window.addEventListener(POST_LIKE_OPTIMISTIC_EVENT');
    expect(home).toContain('await togglePostLike(postId, user.id, wasLiked)');
    expect(videos).toContain('await togglePostLike(postId, userId, wasLiked)');
  });
});


describe('canonical post timestamps', () => {
  it('renders the requested full post date and time shape', () => {
    expect(formatPostDateTime(new Date(2026, 8, 13, 16, 57))).toBe('13 Sep 2026, 16:57');
    expect(formatPostDateTime('not-a-date')).toBe('—');
  });

  it('uses one canonical formatter across public post surfaces', () => {
    const home = source('pages/HomePage.tsx');
    const card = source('components/posts/FeedPostCard.tsx');
    const modal = source('components/PostViewModal.tsx');
    const channel = source('components/channels/ChannelView.tsx');
    const video = source('components/video/VideoWatchPanel.tsx');

    expect(home).toContain('const formatPostTime = formatPostDateTime;');
    expect(card).toContain('formatPostDateTime(post.created_at)');
    expect(modal).toContain('formatPostDateTime(post.created_at)');
    expect(channel).toContain('formatPostDateTime(post.created_at)');
    expect(video).toContain('formatPostDateTime(video.created_at)');
    expect(home).not.toContain("' ago'");
    expect(channel).not.toContain('formatDistanceToNow(new Date(post.created_at)');
    expect(video).not.toContain('formatDistanceToNow(new Date(video.created_at)');
  });
});
