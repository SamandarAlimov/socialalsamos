import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('unified Story publishing contract', () => {
  it('keeps unpublished posts out of public visibility while preserving invite preview', () => {
    const migration = source(
      'supabase/migrations/20260906113000_story_reel_publish_hardening.sql',
    );

    expect(migration).toContain("coalesce(nullif(btrim(p.status), ''), 'published') = 'published'");
    expect(migration).toContain("pc.status in ('pending', 'accepted')");
    expect(migration).toContain("set status = 'draft'");
    expect(migration).toContain("set status = 'published'");
  });

  it('deletes a Story through the transactional graph RPC', () => {
    const migration = source(
      'supabase/migrations/20260906113000_story_reel_publish_hardening.sql',
    );
    const viewer = source('src/components/stories/StoryViewer.tsx');
    const storiesHook = source('src/hooks/useStories.ts');

    expect(migration).toContain('function public.delete_story(p_story_id uuid)');
    expect(migration).toContain('delete from public.posts');
    expect(viewer).toContain("db.rpc('delete_story'");
    expect(storiesHook).toContain("db.rpc('delete_story'");
    expect(storiesHook).not.toContain(".from('stories')\n        .delete()");
  });

  it('resolves legacy Story ids to canonical post/media ids for stickers', () => {
    const overlay = source('src/components/stickers/StoryStickerOverlay.tsx');

    expect(overlay).toContain(".from('stories')");
    expect(overlay).toContain(".select('post_id, media_id')");
    expect(overlay).toContain('data?.post_id');
    expect(overlay).toContain('resolvedLink.mediaId');
  });

  it('routes the historical dialog into the single canonical Story composer', () => {
    const dialog = source('src/components/CreateStoryDialog.tsx');

    expect(dialog).toContain("navigate('/create?mode=story')");
    expect(dialog).not.toContain("from('stories')");
    expect(dialog).not.toContain('uploadFile(');
  });

  it('keeps canonical Story rows out of profile posts and profile post counts', () => {
    const profileHook = source('src/hooks/useUserProfile.ts');
    const migration = source(
      'supabase/migrations/20260926143000_exclude_stories_from_profile_post_counts.sql',
    );

    expect(profileHook).toContain("post.post_kind !== 'story'");
    expect(profileHook).toContain(".or('post_kind.is.null,post_kind.neq.story')");
    expect(profileHook).toContain(".filter(p => p.post_kind !== 'story'");
    expect(migration).toContain("coalesce(p.post_kind, 'post') <> 'story'");
    expect(migration).toContain('p.profile_hidden_at is null');
    expect(migration).toContain('update public.profiles');
  });

  it('persists and renders seen state for own and other Stories', () => {
    const home = source('src/pages/HomePage.tsx');
    const avatar = source('src/components/stories/StoryAvatar.tsx');
    const viewer = source('src/components/stories/StoryViewerCore.tsx');

    expect(home).toContain('!hasViewedAll(userStoryGroup.all_story_ids)');
    expect(home).toContain('bg-muted-foreground/30');
    expect(avatar).toContain(".eq('viewer_id', user.id)");
    expect(avatar).not.toContain("else if (user?.id === userId)");
    expect(avatar).toContain("'bg-muted-foreground/30'");
    expect(viewer).toContain('if (!currentStory || !user) return;');
    expect(viewer).not.toContain('if (!currentStory || !user || isOwnStory) return;');
    expect(viewer).toContain(".from('story_views')");
    expect(viewer).toContain('onMarkAsViewed?.(currentStory.id)');
  });

  it('keeps taps on story controls out of navigation gestures', () => {
    const viewer = source('src/components/stories/StoryViewerCore.tsx');

    expect(viewer).toContain("typeof Element === 'undefined'");
    expect(viewer).toContain('target instanceof Element');
    expect(viewer).not.toContain('target instanceof HTMLElement');
    expect(viewer).toContain('const resetPointerGesture = useCallback');
    expect(viewer).toContain('resetPointerGesture();');
    expect((viewer.match(/isInteractiveTarget\(event\.target\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('pauses silently on hold and exposes pause feedback only for explicit tap pause', () => {
    const viewer = source('src/components/stories/StoryViewerCore.tsx');

    expect(viewer).toContain('setIsHolding(true);');
    expect(viewer).toContain("} else {\n        setIsPaused((value) => !value);\n      }");
    expect(viewer).toContain('{isPaused && !isHolding && (');
    expect(viewer).not.toContain('Long press feedback juda nozik');
  });

  it('keeps the Home Story rail scoped to the current user and followed users', () => {
    const storiesHook = source('src/hooks/useStories.ts');

    expect(storiesHook).toContain(".from('follows')");
    expect(storiesHook).toContain(".select('following_id')");
    expect(storiesHook).toContain(".eq('follower_id', user.id)");
    expect(storiesHook).toContain('allowedAuthorIds = new Set<string>([user.id])');
    expect(storiesHook).toContain('allowedAuthorIds?.has(String(story.user_id))');
    expect(storiesHook).toContain("table: 'follows'");
    expect(storiesHook).toContain('filter: `follower_id=eq.${user.id}`');
  });

  it('keeps the add-to-highlight dialog concise', () => {
    const dialog = source('src/components/stories/AddToHighlightDialog.tsx');

    expect(dialog).toContain('Tanlanganlarga qo‘shish');
    expect(dialog).not.toContain('Storini mavjud Tanlanganga qo‘shing yoki yangisini yarating.');
    expect(dialog).not.toContain('DialogDescription');
  });

  it('keeps the Post create header free of a redundant camera action', () => {
    const composePage = source('src/pages/ComposePage.tsx');

    expect(composePage).toContain("mode === 'post' ? (\n            <PostComposer />");
    expect(composePage).not.toContain("import { Camera,");
    expect(composePage).not.toContain('CameraVideoRecorder');
    expect(composePage).not.toContain('postCameraOpen');
    expect(composePage).not.toContain('handlePostCameraCapture');
  });
});
