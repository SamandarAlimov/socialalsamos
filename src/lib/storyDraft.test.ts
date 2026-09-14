import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearStoredStoryDraft,
  readStoredStoryDraft,
  storyDraftKey,
  writeStoredStoryDraft,
} from '@/lib/storyDraft';

describe('story drafts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists caption and audience across refresh', () => {
    writeStoredStoryDraft('user-1', {
      caption: 'Story caption',
      visibility: 'friends',
    });

    expect(readStoredStoryDraft('user-1')).toMatchObject({
      caption: 'Story caption',
      visibility: 'friends',
    });
  });

  it('isolates drafts per owner', () => {
    writeStoredStoryDraft('user-1', {
      caption: 'First',
      visibility: 'public',
    });
    writeStoredStoryDraft('user-2', {
      caption: 'Second',
      visibility: 'private',
    });

    expect(readStoredStoryDraft('user-1')?.caption).toBe('First');
    expect(readStoredStoryDraft('user-2')?.caption).toBe('Second');
  });

  it('clears a finalized story draft', () => {
    writeStoredStoryDraft('user-1', {
      caption: 'draft',
      visibility: 'public',
    });
    expect(localStorage.getItem(storyDraftKey('user-1'))).not.toBeNull();

    clearStoredStoryDraft('user-1');
    expect(readStoredStoryDraft('user-1')).toBeNull();
  });
});
