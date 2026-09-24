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
    expect(profilePosts).toContain('grid-cols-3');
    expect(profilePosts).toContain("aspect-[3/4]");
    expect(profilePosts).toContain('w-screen max-w-[640px]');
    expect(profilePosts).toContain('grid w-screen -translate-x-1/2 grid-cols-3');

    expect(ownProfile).toContain("layout={activeTab === 'videos' ? 'reels-grid' : 'feed'}");
    expect(ownProfile).toContain('layout="feed"');
    expect(userProfile).toContain("layout={activeTab === 'videos' ? 'reels-grid' : 'feed'}");
    expect(userProfile).toContain('layout="feed"');
  });

  it('uses a canonical poster-first video preview pipeline instead of browser-specific preload behavior', () => {
    const profilePosts = source('components/profile/ProfilePostsGrid.tsx');
    const thumbnail = source('components/PostMediaThumbnail.tsx');
    const attachments = source('hooks/usePostAttachments.ts');

    expect(profilePosts).toContain('getStructuredPostMediaPreviewMap(postIds)');
    expect(profilePosts).toContain('structuredPreview?.poster');
    expect(profilePosts).toContain('<PostMediaThumbnail');
    expect(profilePosts).toContain('showPlayOverlay={false}');
    expect(profilePosts).not.toContain('preload="auto"');

    expect(thumbnail).toContain('const hasPoster');
    expect(thumbnail).toContain('src={resolvedPoster}');
    expect(thumbnail).toContain('decoding="async"');
    expect(thumbnail).toContain('preload="metadata"');
    expect(thumbnail).toContain('onLoadedMetadata');
    expect(thumbnail).toContain('onLoadedData');
    expect(thumbnail).toContain('video.currentTime = previewTime');
    expect(thumbnail).toContain('setPosterFailed(true)');

    // New uploads should keep producing a real thumbnail in structured media metadata.
    expect(attachments).toContain('captureVideoPoster');
    expect(attachments).toContain('thumbnailStorageUrl');
  });

  it('keeps own and viewed profiles on one shared premium identity layout', () => {
    const ownProfile = source('pages/ProfilePage.tsx');
    const userProfile = source('pages/UserProfilePage.tsx');
    const sharedHeader = source('components/profile/ProfileHeader.tsx');

    expect(ownProfile).toContain('<ProfileHeader');
    expect(userProfile).toContain('<ProfileHeader');
    expect(sharedHeader).toContain('identityTrailing');
    expect(sharedHeader).toContain('truncate text-xl font-bold');
    expect(userProfile).not.toContain('OnlineIndicator');
  });

  it('keeps owner-only controls off viewed profiles and canonicalizes self profile URLs', () => {
    const ownProfile = source('pages/ProfilePage.tsx');
    const userProfile = source('pages/UserProfilePage.tsx');
    const chrome = source('lib/mobileRouteChrome.ts');

    expect(ownProfile).toContain("id: 'saved' as const");
    expect(userProfile).not.toContain("id: 'saved' as const");
    expect(userProfile).toContain("navigate('/profile', { replace: true })");
    expect(userProfile).toContain('isOwnProfile={false}');
    expect(chrome).toContain("if (path.startsWith('/user/')) return 'secondary'");
  });
});
