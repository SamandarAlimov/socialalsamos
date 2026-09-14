import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearStoredReelDraft,
  readExpiredReelDraftMusic,
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

  it('persists device audio only when it owns a stable storage object', () => {
    writeStoredReelDraft('user-1', {
      caption: '',
      visibility: 'public',
      music: {
        track: {
          title: 'Local audio',
          artist: 'Device',
          audioUrl: 'storage://media-private/user-1/music/local.m4a',
          storageBucket: 'media-private',
          storageKey: 'user-1/music/local.m4a',
          source: 'device',
        },
        volume: 0.8,
        mutedOriginal: true,
      },
      collaborators: [],
      coverSecond: 0,
      selectedClipId: null,
    });

    expect(readStoredReelDraft('user-1')?.music).toMatchObject({
      track: {
        source: 'device',
        storageBucket: 'media-private',
        storageKey: 'user-1/music/local.m4a',
      },
      volume: 0.8,
      mutedOriginal: true,
    });
  });

  it('does not persist transient blob device audio', () => {
    writeStoredReelDraft('user-1', {
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

    expect(readStoredReelDraft('user-1')?.music).toBeNull();
  });

  it('exposes expired owned device music for storage cleanup', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));

    writeStoredReelDraft('user-1', {
      caption: 'draft',
      visibility: 'public',
      music: {
        track: {
          title: 'Owned audio',
          audioUrl: 'storage://media-private/user-1/music/owned.m4a',
          storageBucket: 'media-private',
          storageKey: 'user-1/music/owned.m4a',
          source: 'device',
        },
      },
      collaborators: [],
      coverSecond: 0,
      selectedClipId: null,
    });

    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    expect(readExpiredReelDraftMusic('user-1')?.track?.storageKey).toBe(
      'user-1/music/owned.m4a',
    );
    expect(readStoredReelDraft('user-1')).toBeNull();
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
