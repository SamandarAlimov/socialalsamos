import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), 'src', path), 'utf8');
}

describe('responsive post more actions', () => {
  it('uses a bottom sheet on mobile/tablet and an anchored menu on desktop', () => {
    const actions = source('components/PostActionsMenu.tsx');

    expect(actions).toContain('data-post-actions-sheet="true"');
    expect(actions).toContain('side="bottom"');
    expect(actions).toContain('lg:hidden');
    expect(actions).toContain('hidden lg:block');
    expect(actions).toContain('env(safe-area-inset-bottom,0px)');
    expect(actions).toContain('overlayClassName="bg-black/55');
  });

  it('keeps core post actions available in the sheet', () => {
    const actions = source('components/PostActionsMenu.tsx');

    expect(actions).toContain('Havola');
    expect(actions).toContain('Ulashish');
    expect(actions).toContain('Saqlash');
    expect(actions).toContain('AI ga');
    expect(actions).toContain('Postni yashirish');
    expect(actions).toContain('Shikoyat qilish');
    expect(actions).toContain('Analitika');
    expect(actions).toContain('Postni tahrirlash');
  });

  it('reuses the shared surface for Videos instead of a one-off dropdown', () => {
    const videos = source('components/video/VideoHideMenu.tsx');

    expect(videos).toContain("import { PostActionsMenu } from '@/components/PostActionsMenu'");
    expect(videos).toContain('<PostActionsMenu');
    expect(videos).not.toContain('DropdownMenuContent');
  });

  it('keeps Home and Profile feed cards wired to the shared actions component', () => {
    const home = source('pages/HomePage.tsx');
    const feedCard = source('components/posts/FeedPostCard.tsx');
    const profile = source('components/profile/ProfilePostsGrid.tsx');

    expect(home).toContain('<PostActionsMenu');
    expect(feedCard).toContain('<PostActionsMenu');
    expect(profile).toContain('FeedPostCard');
  });
});
