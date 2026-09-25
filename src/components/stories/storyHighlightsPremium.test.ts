import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), 'src', path), 'utf8');
}

describe('premium story highlights', () => {
  it('creates and edits highlights with story or device cover selection', () => {
    const composer = source('components/stories/StoryHighlightComposerDialog.tsx');
    const highlights = source('components/stories/StoryHighlights.tsx');

    expect(composer).toContain("mode: 'create' | 'edit'");
    expect(composer).toContain(".from('stories')");
    expect(composer).toContain('selectedStoryIds');
    expect(composer).toContain('coverStoryId');
    expect(composer).toContain('chooseStoryCover');
    expect(composer).toContain('Storydan muqova tanlash');
    expect(composer).toContain('Qurilmadan');
    expect(composer).toContain('accept="image/*"');
    expect(composer).toContain("uploadMedia(coverFile, { type: 'avatar', visibility: 'public' })");
    expect(composer).toContain('selectedCoverStory?.media_url');
    expect(composer).toContain('selectedStories.map((story) => ({');
    expect(composer).toContain('removeExistingCover');
    expect(composer).not.toContain('editPremiumDescription');
    expect(composer).not.toContain('Nomi va muqovasini storydan yoki qurilmadan istalgan payt yangilang.');

    expect(highlights).toContain('StoryHighlightComposerDialog');
    expect(highlights).toContain('from-amber-300 via-fuchsia-500 to-violet-600');
    expect(highlights).toContain('<HighlightCover highlight={highlight} />');
    expect(highlights).toContain('resolveCoverItem');
    expect(highlights).toContain("mediaType === 'video'");
  });

  it('keeps all owner stories visible in archive and exposes direct add-to-highlight actions', () => {
    const archive = source('pages/StoryArchivePage.tsx');
    const addDialog = source('components/stories/AddToHighlightDialog.tsx');

    expect(archive).toContain(".from('stories')");
    expect(archive).toContain(".eq('user_id', user.id)");
    expect(archive).not.toContain('const expired =');
    expect(archive).not.toContain('setArchivedStories(expired');
    expect(archive).toContain('Faol va avvalgi storylaringiz');
    expect(archive).not.toContain('Joylagan storylaringiz shu yerda tarix sifatida ko‘rinadi.');
    expect(archive).toContain('Tanlanganlarga');
    expect(archive).toContain('<AddToHighlightDialog');

    expect(addDialog).toContain(".select('user_id')");
    expect(addDialog).toContain('setCanQuickAdd(data?.user_id === user.id)');
    expect(addDialog).toContain('{story && !open && canQuickAdd ? (');
    expect(addDialog).toContain('onClick={() => onOpenChange(true)}');
    expect(addDialog).toContain('Storini Tanlanganlarga qo‘shish');
    expect(addDialog).toContain("selectedHighlightId === 'new'");
    expect(addDialog).toContain('Yaratish va qo‘shish');
    expect(addDialog).toContain('addStoryToHighlight(');
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
