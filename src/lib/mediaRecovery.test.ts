import { describe, expect, it } from 'vitest';
import {
  inferStoredMediaKind,
  mergeMediaCandidateGroups,
  uniqueMediaCandidates,
} from './mediaRecovery';

describe('inferStoredMediaKind', () => {
  it('repairs a legacy video row that was backfilled as image', () => {
    expect(
      inferStoredMediaKind({
        kind: 'image',
        storage_url: 'https://cdn.example.com/posts/clip.mp4?token=old#fragment',
      }),
    ).toBe('video');
  });

  it('uses storage_key when a signed URL has no useful extension', () => {
    expect(
      inferStoredMediaKind({
        kind: 'image',
        storage_url: 'https://example.supabase.co/storage/v1/object/sign/media/object?token=abc',
        storage_key: 'user/post/voice.m4a',
      }),
    ).toBe('audio');
  });

  it('prefers a trustworthy MIME type over a stale stored kind', () => {
    expect(
      inferStoredMediaKind({
        kind: 'image',
        file_name: 'camera-upload.bin',
        mime_type: 'video/quicktime',
      }),
    ).toBe('video');
  });

  it('keeps the stored kind when no stronger evidence exists', () => {
    expect(
      inferStoredMediaKind({
        kind: 'video',
        storage_url: 'https://media.example.com/object/opaque-id',
      }),
    ).toBe('video');
  });
});

describe('legacy media candidate preservation', () => {
  it('deduplicates candidates without changing fallback order', () => {
    expect(
      uniqueMediaCandidates([
        'https://cdn.example.com/a.mp4',
        'https://cdn.example.com/a.mp4',
        null,
        'https://legacy.example.com/a.mp4',
      ]),
    ).toEqual([
      'https://cdn.example.com/a.mp4',
      'https://legacy.example.com/a.mp4',
    ]);
  });

  it('keeps legacy URL when a structured row exists at the same position', () => {
    expect(
      mergeMediaCandidateGroups(
        [
          {
            position: 0,
            kind: 'video',
            urls: ['https://structured.example.com/broken.mp4'],
          },
        ],
        [
          {
            position: 0,
            kind: 'video',
            urls: ['https://legacy.example.com/original.mp4'],
          },
        ],
      ),
    ).toEqual([
      {
        position: 0,
        kind: 'video',
        urls: [
          'https://structured.example.com/broken.mp4',
          'https://legacy.example.com/original.mp4',
        ],
      },
    ]);
  });

  it('does not drop extra legacy-only media positions', () => {
    expect(
      mergeMediaCandidateGroups(
        [{ position: 0, kind: 'image', urls: ['https://cdn.example.com/0.jpg'] }],
        [
          { position: 0, kind: 'image', urls: ['https://legacy.example.com/0.jpg'] },
          { position: 1, kind: 'video', urls: ['https://legacy.example.com/1.mp4'] },
        ],
      ),
    ).toEqual([
      {
        position: 0,
        kind: 'image',
        urls: [
          'https://cdn.example.com/0.jpg',
          'https://legacy.example.com/0.jpg',
        ],
      },
      {
        position: 1,
        kind: 'video',
        urls: ['https://legacy.example.com/1.mp4'],
      },
    ]);
  });
});
