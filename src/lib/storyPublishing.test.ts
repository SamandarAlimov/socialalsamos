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
});
