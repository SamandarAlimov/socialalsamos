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

  it('routes profile avatar tap and long-press without conflicting with story playback', () => {
    const sharedHeader = source('components/profile/ProfileHeader.tsx');
    const storyAvatar = source('components/stories/StoryAvatar.tsx');

    // No story: normal avatar tap reaches the profile photo viewer.
    // Story present: StoryAvatar owns normal tap, while long-press still reaches photos.
    expect(sharedHeader).toContain('onClick={onPhotos}');
    expect(sharedHeader).toContain('onLongPress={onPhotos}');
    expect(storyAvatar).toContain('if (!hasStory || !onLongPress) return;');
    expect(storyAvatar).toContain('longPressTriggeredRef.current = true');
    expect(storyAvatar).toContain('onPointerDown={handlePointerDown}');
    expect(storyAvatar).toContain('onPointerMove={handlePointerMove}');
    expect(storyAvatar).toContain('onPointerUp={handlePointerEnd}');
    expect(storyAvatar).toContain('onPointerCancel={handlePointerEnd}');
    expect(storyAvatar).toContain('if (longPressTriggeredRef.current)');
    expect(storyAvatar).toContain('setShowViewer(true)');
    expect(storyAvatar).toContain('else if (onClick)');
  });

  it('renders profile photos as an immersive fullscreen viewer instead of a card modal', () => {
    const photoViewer = source('components/profile/ProfilePhotosDialog.tsx');

    expect(photoViewer).toContain('hideDefaultClose');
    expect(photoViewer).toContain('!h-[100dvh]');
    expect(photoViewer).toContain('!w-screen');
    expect(photoViewer).toContain('!max-w-none');
    expect(photoViewer).toContain('sm:rounded-none');
    expect(photoViewer).toContain('env(safe-area-inset-top)');
    expect(photoViewer).toContain('env(safe-area-inset-bottom)');
    expect(photoViewer).toContain('max-h-full max-w-full select-none object-contain');
    expect(photoViewer).toContain('bg-black/45 p-1.5 shadow-2xl backdrop-blur-2xl');
    expect(photoViewer).toContain("defaultValue: 'Rasm o‘chirilsinmi?'");
    expect(photoViewer).not.toContain('max-w-3xl');
    expect(photoViewer).not.toContain('min-h-[50vh]');
  });

  it('makes vertical dismiss interactive, proportional, and reversible before release', () => {
    const photoViewer = source('components/profile/ProfilePhotosDialog.tsx');
    const dialog = source('components/ui/dialog.tsx');

    expect(photoViewer).toContain('DRAG_DISMISS_DISTANCE_PX = 120');
    expect(photoViewer).toContain('DRAG_DISMISS_VELOCITY_PX_MS = 0.65');
    expect(photoViewer).toContain('setDragY(deltaY)');
    expect(photoViewer).toContain('translate3d(0, ${dragY}px, 0) scale(${dragScale})');
    expect(photoViewer).toContain('const dragScale = 1 - dragProgress * DRAG_MAX_SCALE_REDUCTION');
    expect(photoViewer).toContain('const verticalVelocity = Math.abs(deltaY) / elapsedMs');
    expect(photoViewer).toContain('animateDismiss(deltaY < 0 ? -1 : 1)');
    expect(photoViewer).toContain('springBack()');
    expect(photoViewer).toContain('onPointerMove={handlePointerMove}');
    expect(photoViewer).toContain('overlayStyle={{');
    expect(photoViewer).toContain('backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})`');
    expect(dialog).toContain('overlayStyle?: React.CSSProperties');
    expect(dialog).toContain('<DialogOverlay className={overlayClassName} style={overlayStyle} />');
  });

  it('keeps a premium cover on every profile and offers a ten-design collection', () => {
    const ownProfile = source('pages/ProfilePage.tsx');
    const sharedHeader = source('components/profile/ProfileHeader.tsx');
    const coverSurface = source('components/profile/ProfileCoverSurface.tsx');
    const coverPicker = source('components/profile/ProfileCoverPickerDialog.tsx');
    const coverPresets = source('lib/profileCovers.ts');
    const userProfileHook = source('hooks/useUserProfile.ts');

    expect(coverPresets).toContain("DEFAULT_PROFILE_COVER_PRESET: ProfileCoverPresetId = 'graphite-halo'");
    expect(coverPresets.match(/id: '/g)?.length).toBe(10);
    expect(sharedHeader).toContain('<ProfileCoverSurface coverUrl={profile.cover_url} presetId={profile.cover_preset} />');
    expect(coverSurface).toContain('resolveProfileCoverPreset(presetId)');
    expect(coverPicker).toContain('PROFILE_COVER_PRESETS.map');
    expect(coverPicker).toContain("defaultValue: 'Alsamos kolleksiyasi'");
    expect(ownProfile).toContain('<ProfileCoverPickerDialog');
    expect(ownProfile).toContain('cover_url: null');
    expect(ownProfile).toContain('cover_preset: presetId === DEFAULT_PROFILE_COVER_PRESET ? null : presetId');
    expect(ownProfile).toContain('cover_url: uploaded.url, cover_preset: null');
    expect(userProfileHook).toContain('cover_preset: string | null');
    expect(userProfileHook).toContain('`${PROFILE_PUBLIC_COLUMNS}, cover_preset`');
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
