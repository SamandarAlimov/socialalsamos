import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_MEDIA_BUCKET,
  encodeMediaPath,
  isAlsamosPublicMediaUrl,
  makeAlsamosMediaReference,
  parseAlsamosMediaReference,
} from './mediaRefs';

describe('Alsamos external media references', () => {
  it('round-trips a private MinIO key without turning it into a Supabase bucket', () => {
    const key = 'private/post/user-id/abc123.mp4';
    const value = makeAlsamosMediaReference(key);
    expect(value).toBe(`alsamos-media://${key}`);
    expect(parseAlsamosMediaReference(value)).toEqual({ key });
    expect(EXTERNAL_MEDIA_BUCKET).toBe('alsamos-media');
  });

  it('recovers the raw private key shape used by the old API client', () => {
    expect(parseAlsamosMediaReference('private/post/user-id/old-video.mp4')).toEqual({
      key: 'private/post/user-id/old-video.mp4',
    });
    expect(parseAlsamosMediaReference('post/user-id/public.jpg')).toBeNull();
  });

  it('recognizes only the canonical public media host', () => {
    expect(isAlsamosPublicMediaUrl('https://media.alsamos.com/media/post/u/a.jpg')).toBe(true);
    expect(isAlsamosPublicMediaUrl('https://example.com/media/post/u/a.jpg')).toBe(false);
    expect(isAlsamosPublicMediaUrl('storage://media/x')).toBe(false);
  });

  it('encodes path segments without destroying slashes', () => {
    expect(encodeMediaPath('post/user id/a+b.jpg')).toBe('post/user%20id/a%2Bb.jpg');
  });
});
