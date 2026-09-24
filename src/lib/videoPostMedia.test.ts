import { describe, expect, it } from 'vitest';
import {
  isPotentialVideoPost,
  isReelPostKind,
  isVideoLikeUrl,
  isVideoMediaType,
} from './videoPostMedia';
import {
  isTallPostPreviewRatio,
  normalizePostPreviewAspectRatio,
  parsePostMediaAspectRatio,
  POST_PREVIEW_ASPECT_RATIOS,
} from './mediaAspectRatio';

describe('video post discovery', () => {
  it('accepts legacy and MIME-like video media types', () => {
    expect(isVideoMediaType('video')).toBe(true);
    expect(isVideoMediaType('video/mp4')).toBe(true);
    expect(isVideoMediaType('VIDEO/QUICKTIME')).toBe(true);
    expect(isVideoMediaType('image')).toBe(false);
  });

  it('recognizes reel post kinds even when media_type is stale', () => {
    expect(isReelPostKind('reel')).toBe(true);
    expect(isReelPostKind('short')).toBe(true);
    expect(
      isPotentialVideoPost({
        id: 'reel-1',
        media_type: 'image',
        post_kind: 'reel',
        media_urls: ['https://cdn.example.com/opaque'],
      }),
    ).toBe(true);
  });

  it('never leaks story videos into the Videos feed', () => {
    expect(
      isPotentialVideoPost({
        id: 'story-1',
        media_type: 'video',
        post_kind: 'story',
        media_urls: ['https://cdn.example.com/story.mp4'],
      }),
    ).toBe(false);
  });

  it('recognizes video URLs with query strings and fragments', () => {
    expect(
      isVideoLikeUrl('https://cdn.example.com/path/clip.MP4?token=abc#frame'),
    ).toBe(true);
    expect(isVideoLikeUrl('https://cdn.example.com/path/photo.jpg?x=1')).toBe(false);
  });

  it('recovers structured video rows even when the stored kind is wrong', () => {
    expect(
      isPotentialVideoPost(
        {
          id: 'legacy-structured',
          media_type: 'image',
          media_urls: [],
        },
        [
          {
            post_id: 'legacy-structured',
            position: 0,
            kind: 'image',
            storage_url: 'storage://media/user/reel/movie.mov',
            storage_bucket: 'media',
            storage_key: 'user/reel/movie.mov',
            thumbnail_url: null,
            thumbnail_bucket: null,
            thumbnail_key: null,
            mime_type: 'video/quicktime',
            file_name: 'movie.mov',
          },
        ],
      ),
    ).toBe(true);
  });

  it('does not classify an image-only post as a video', () => {
    expect(
      isPotentialVideoPost({
        id: 'image-1',
        media_type: 'image',
        post_kind: 'post',
        media_urls: ['https://cdn.example.com/photo.webp'],
      }),
    ).toBe(false);
  });
});

describe('post preview aspect ratios', () => {
  it('parses dimensions and serialized ratio formats', () => {
    expect(parsePostMediaAspectRatio(null, 1920, 1080)).toBeCloseTo(16 / 9);
    expect(parsePostMediaAspectRatio('9:16')).toBeCloseTo(9 / 16);
    expect(parsePostMediaAspectRatio('4/5')).toBeCloseTo(4 / 5);
    expect(parsePostMediaAspectRatio('0.75')).toBeCloseTo(3 / 4);
  });

  it('keeps canonical social ratios exact for stable previews', () => {
    expect(normalizePostPreviewAspectRatio(16 / 9)).toBe(POST_PREVIEW_ASPECT_RATIOS.landscape);
    expect(normalizePostPreviewAspectRatio(1)).toBe(POST_PREVIEW_ASPECT_RATIOS.square);
    expect(normalizePostPreviewAspectRatio(4 / 5)).toBe(POST_PREVIEW_ASPECT_RATIOS.portraitFourFive);
    expect(normalizePostPreviewAspectRatio(3 / 4)).toBe(POST_PREVIEW_ASPECT_RATIOS.portraitThreeFour);
    expect(normalizePostPreviewAspectRatio(9 / 16)).toBe(POST_PREVIEW_ASPECT_RATIOS.portraitNineSixteen);
  });

  it('snaps tiny encoder drift and constrains pathological legacy ratios', () => {
    expect(normalizePostPreviewAspectRatio(1080 / 1918)).toBe(9 / 16);
    expect(normalizePostPreviewAspectRatio(3)).toBe(16 / 9);
    expect(normalizePostPreviewAspectRatio(0.2)).toBe(9 / 16);
  });

  it('only treats true 9:16-style media as the tall viewport-capped layout', () => {
    expect(isTallPostPreviewRatio(9 / 16)).toBe(true);
    expect(isTallPostPreviewRatio(3 / 4)).toBe(false);
    expect(isTallPostPreviewRatio(4 / 5)).toBe(false);
    expect(isTallPostPreviewRatio(1)).toBe(false);
    expect(isTallPostPreviewRatio(16 / 9)).toBe(false);
  });
});
