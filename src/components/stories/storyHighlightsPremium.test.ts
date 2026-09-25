import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), 'src', path), 'utf8');
}

describe('premium story highlights', () => {
  it('creates an Instagram-style highlight with story selection and a custom cover', () => {
    const composer = source('components/stories/StoryHighlightComposerDialog.tsx');
    const highlights = source('components/stories/StoryHighlights.tsx');

    expect(composer).toContain("mode: 'create' | 'edit'");
    expect(composer).toContain(".from('stories')");
    expect(composer).toContain('selectedStoryIds');
    expect(composer).toContain("accept=\"image/*\"");
    expect(composer).toContain("uploadMedia(coverFile, { type: 'avatar', visibility: 'public' })");
    expect(composer).toContain("defaultValue: 'Muqovani tanlash'");
    expect(composer).toContain("defaultValue: 'Storylarni tanlang'");
    expect(composer).toContain('selectedStories.map((story) => ({');
    expect(composer).toContain('removeExistingCover');

    expect(highlights).toContain('StoryHighlightComposerDialog');
    expect(highlights).toContain('from-amber-300 via-fuchsia-500 to-violet-600');
    expect(highlights).toContain('<HighlightCover highlight={highlight} />');
  });

  it('persists initial highlight stories together and rolls back a partial creation', () => {
    const hook = source('hooks/useStoryHighlights.ts');

    expect(hook).toContain('initialItems: StoryHighlightDraftItem[] = []');
    expect(hook).toContain(".from('story_highlight_items')");
    expect(hook).toContain('initialItems.map((item, index) => ({');
    expect(hook).toContain('createdHighlightId = data.id');
    expect(hook).toContain(".delete()\n          .eq('id', createdHighlightId)");
    expect(hook).toContain('cover_url?: string | null');
  });
});
