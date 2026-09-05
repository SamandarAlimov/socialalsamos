import { describe, expect, it } from 'vitest';
import { inferStoredMediaKind } from './mediaRecovery';

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
