import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearStoredReelDraft,
  readStoredReelDraft,
  reelDraftKey,
  writeStoredReelDraft,
} from '@/lib/reelDraft';

describe('reel drafts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('persists creator metadata needed after refresh', () => {
    writeStoredReelDraft('user-1', {
      caption: 'Reel caption',
      visibility: 'friends',
      music: null,
      collaborators: [
        {
          id: 'friend-1',
          username: 'friend',
          display_name: 'Friend',
          avatar_url: null,
        },
      ],
      coverSecond: 4.2,
      selectedClipId: 'clip-2',
    });

    const restored = readStoredReelDraft('user-1');
    expect(restored).toMatchObject({
      caption: 'Reel caption',
      visibility: 'friends',
      coverSecond: 4.2,
      selectedClipId: 'clip-2',
    });
    expect(restored?.collaborators).toHaveLength(1);
  });

  it('persists device audio only when it has a stable storage reference', () => {
    writeStoredReelDraft('user-1', {
      caption: '',
      visibility: 'public',
      music: {
        track: {
          title: 'Local audio',
          artist: 'Device',
          audioUrl: 'storage://post-media/music/user-1/audio.m4a',
          storageBucket: 'post-media',
          storageKey: 'music/user-1/audio.m4a',
          source: 'device',
        },
        volume: 0.8,
        mutedOriginal: false,
      },
      collaborators: [],
      coverSecond: 0,
      selectedClipId: null,
    });

    expect(readStoredReelDraft('user-1')?.music?.track?.source).toBe('device');
    expect(readStoredReelDraft('user-1')?.music?.track?.storageKey).toBe(
      'music/user-1/audio.m4a',
    );

    writeStoredReelDraft('user-2', {
      caption: '',
      visibility: 'public',
      music: {
        track: {
          title: 'Transient audio',
          artist: 'Device',
          audioUrl: 'blob:local',
          source: 'device',
        },
        volume: 1,
        mutedOriginal: false,
      },
      collaborators: [],
      coverSecond: 0,
      selectedClipId: null,
    });

    expect(readStoredReelDraft('user-2')?.music).toBeNull();
  });

  it('clears a published reel draft', () => {
    writeStoredReelDraft('user-1', {
      caption: 'draft',
      visibility: 'public',
      music: null,
      collaborators: [],
      coverSecond: 0,
      selectedClipId: null,
    });
    expect(localStorage.getItem(reelDraftKey('user-1'))).not.toBeNull();

    clearStoredReelDraft('user-1');
    expect(readStoredReelDraft('user-1')).toBeNull();
  });
});
