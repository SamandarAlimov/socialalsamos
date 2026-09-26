import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), 'src', path), 'utf8');
}

describe('premium story highlights', () => {
  it('creates highlights with story or device cover selection', () => {
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

    expect(highlights).toContain('StoryHighlightComposerDialog');
    expect(highlights).toContain('StoryHighlightEditDialog');
    expect(highlights).toContain('StoryHighlightActions');
    expect(highlights).toContain('StoryHighlightPlayback');
    expect(highlights).toContain('<HighlightCover highlight={highlight} />');
    expect(highlights).toContain('resolveCoverItem');
  });

  it('edits highlight name, cover and story membership with selected/stories tabs', () => {
    const editor = source('components/stories/StoryHighlightEditDialog.tsx');
    const hook = source('hooks/useStoryHighlights.ts');

    expect(editor).toContain('Tanlanganni tahrirlash');
    expect(editor).toContain('Bekor qilish');
    expect(editor).toContain('Tayyor');
    expect(editor).toContain('Qurilmadan muqova');
    expect(editor).toContain("setTab('selected')");
    expect(editor).toContain("setTab('stories')");
    expect(editor).toContain('Tanlangan');
    expect(editor).toContain('Storylar');
    expect(editor).toContain('syncHighlightItems');
    expect(editor).toContain('selectedStories.map((story) => ({');
    expect(hook).toContain('const syncHighlightItems = useCallback');
    expect(hook).toContain("{ onConflict: 'highlight_id,story_id' }");
  });

  it('plays highlights with highlight-specific edit and remove actions', () => {
    const playback = source('components/stories/StoryHighlightPlayback.tsx');
    const hook = source('hooks/useStoryHighlights.ts');

    expect(playback).toContain('Tanlangandan olib tashlash');
    expect(playback).toContain('Tanlanganni tahrirlash');
    expect(playback).toContain('onRemoveStory(highlight.id, current.story_id)');
    expect(playback).toContain('setItems(nextItems)');
    expect(playback).toContain('onTimeUpdate');
    expect(playback).toContain('IMAGE_DURATION');
    expect(hook).toContain('const coverWasRemoved = Boolean(');
    expect(hook).toContain('const fallbackCover =');
    expect(hook).toContain('.update({ cover_url: fallbackCover })');
  });

  it('opens owner highlight actions by long press without a visible more icon', () => {
    const highlights = source('components/stories/StoryHighlights.tsx');

    expect(highlights).not.toContain('MoreHorizontal');
    expect(highlights).toContain('HIGHLIGHT_LONG_PRESS_MS');
    expect(highlights).toContain('HIGHLIGHT_LONG_PRESS_MOVE_TOLERANCE');
    expect(highlights).toContain('handleHighlightPointerDown');
    expect(highlights).toContain('handleHighlightPointerMove');
    expect(highlights).toContain('suppressHighlightClickRef');
    expect(highlights).toContain('setActionHighlight(highlight)');
    expect(highlights).toContain('onPointerDown={(event) => handleHighlightPointerDown(event, highlight)}');
    expect(highlights).toContain('onContextMenu={(event) => {');
  });

  it('shares highlights through action sheet, copy link and QR code', () => {
    const actions = source('components/stories/StoryHighlightActions.tsx');
    const highlights = source('components/stories/StoryHighlights.tsx');

    expect(actions).toContain('Tanlanganni tahrirlash');
    expect(actions).toContain('Jo‘natish');
    expect(actions).toContain('Tanlangan havolasini nusxalash');
    expect(actions).toContain('QR kod');
    expect(actions).toContain('QRCodeCanvas');
    expect(actions).toContain('Qurilmaga saqlash');
    expect(actions).toContain('?highlight=');
    expect(highlights).toContain("searchParams.get('highlight')");
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
