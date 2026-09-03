import { describe, expect, it } from 'vitest';
import { resolveScrubPreviewSize } from './useVideoScrubPreview';

describe('resolveScrubPreviewSize', () => {
  it('keeps portrait 9:16 previews portrait', () => {
    const size = resolveScrubPreviewSize(9 / 16);
    expect(size.height).toBe(168);
    expect(size.width).toBeCloseTo(95, 0);
    expect(size.height).toBeGreaterThan(size.width);
  });

  it('keeps landscape 16:9 previews landscape', () => {
    const size = resolveScrubPreviewSize(16 / 9);
    expect(size.width).toBe(168);
    expect(size.height).toBeCloseTo(95, 0);
    expect(size.width).toBeGreaterThan(size.height);
  });

  it('keeps square previews square', () => {
    const size = resolveScrubPreviewSize(1);
    expect(size.width).toBe(size.height);
  });
});
