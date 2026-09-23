import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), 'src', path), 'utf8');
}

describe('profile post layouts', () => {
  it('does not expose a secondary feed/grid switch inside the post renderer', () => {
    const profilePosts = source('components/profile/ProfilePostsGrid.tsx');

    expect(profilePosts).not.toContain("type ViewMode = 'feed' | 'grid'");
    expect(profilePosts).not.toContain("setViewMode('feed')");
    expect(profilePosts).not.toContain("setViewMode('grid')");
    expect(profilePosts).not.toContain('<LayoutList');
    expect(profilePosts).not.toContain('<Grid3x3');
  });

  it('uses feed layout for normal/repost tabs and a fixed 3-column reels grid for videos', () => {
    const profilePosts = source('components/profile/ProfilePostsGrid.tsx');
    const ownProfile = source('pages/ProfilePage.tsx');
    const userProfile = source('pages/UserProfilePage.tsx');

    expect(profilePosts).toContain("layout?: 'feed' | 'reels-grid'");
    expect(profilePosts).toContain('grid grid-cols-3');
    expect(profilePosts).toContain("aspect-[3/4]");

    expect(ownProfile).toContain("layout={activeTab === 'videos' ? 'reels-grid' : 'feed'}");
    expect(ownProfile).toContain('layout="feed"');
    expect(userProfile).toContain("layout={activeTab === 'videos' ? 'reels-grid' : 'feed'}");
    expect(userProfile).toContain('layout="feed"');
  });
});
