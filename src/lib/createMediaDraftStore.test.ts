import { describe, expect, it } from 'vitest';

import {
  createMediaDraftKey,
  createMediaDraftSnapshot,
  restoreMediaDraftSnapshot,
} from '@/lib/createMediaDraftStore';

describe('create media draft snapshots', () => {
  it('keeps file identity and editor metadata across serialization', () => {
    const source = new File(['draft-media'], 'clip.webm', {
      type: 'video/webm',
      lastModified: 1234,
    });

    const snapshot = createMediaDraftSnapshot([
      {
        id: 'clip-1',
        file: source,
        kind: 'video',
        width: 720,
        height: 1280,
        durationSeconds: 12.5,
        aspectRatio: '9:16',
        altText: 'Draft clip',
        editState: {
          reelClip: { speed: 1.5, transition: 'fade' },
        },
      },
    ]);

    const [restored] = restoreMediaDraftSnapshot(snapshot);

    expect(restored.id).toBe('clip-1');
    expect(restored.file.name).toBe('clip.webm');
    expect(restored.file.type).toBe('video/webm');
    expect(restored.file.lastModified).toBe(1234);
    expect(restored.file.size).toBe(source.size);
    expect(restored.kind).toBe('video');
    expect(restored.width).toBe(720);
    expect(restored.height).toBe(1280);
    expect(restored.durationSeconds).toBe(12.5);
    expect(restored.aspectRatio).toBe('9:16');
    expect(restored.altText).toBe('Draft clip');
    expect(restored.editState).toEqual({
      reelClip: { speed: 1.5, transition: 'fade' },
    });
  });

  it('builds isolated draft keys per owner and mode', () => {
    expect(createMediaDraftKey('user-a', 'post')).toBe('user-a:post');
    expect(createMediaDraftKey('user-a', 'reel')).toBe('user-a:reel');
    expect(createMediaDraftKey('user-b', 'post')).not.toBe(
      createMediaDraftKey('user-a', 'post'),
    );
  });
});
