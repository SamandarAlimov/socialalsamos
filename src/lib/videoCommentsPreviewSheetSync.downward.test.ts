import { describe, expect, it } from 'vitest';
import {
  parseInlineVideoCommentsDismissOffset,
  resolveVideoCommentsVisualSheetTop,
  shouldPrimeVideoCommentsScrollHandoff,
} from './videoCommentsPreviewSheetSync';

describe('video comments downward preview sync', () => {
  it('moves preview down with compact sheet dismiss offset', () => {
    expect(resolveVideoCommentsVisualSheetTop(360, 120)).toBe(480);
  });

  it('reads the translate3d offset used by the mobile sheet', () => {
    expect(parseInlineVideoCommentsDismissOffset('translate3d(0, 126px, 0)')).toBe(126);
    expect(parseInlineVideoCommentsDismissOffset('translateY(44.5px)')).toBe(44.5);
  });

  it('ignores non-downward or unrelated transforms', () => {
    expect(parseInlineVideoCommentsDismissOffset('translate3d(0, -20px, 0)')).toBe(0);
    expect(parseInlineVideoCommentsDismissOffset('none')).toBe(0);
    expect(parseInlineVideoCommentsDismissOffset('scale(1)')).toBe(0);
  });

  it('hands the same downward touch to the sheet when it consumes the remaining comment scroll', () => {
    expect(shouldPrimeVideoCommentsScrollHandoff(8, 10)).toBe(true);
    expect(shouldPrimeVideoCommentsScrollHandoff(1.2, 1)).toBe(true);
  });

  it('keeps native comment scrolling while meaningful scroll distance remains', () => {
    expect(shouldPrimeVideoCommentsScrollHandoff(80, 10)).toBe(false);
    expect(shouldPrimeVideoCommentsScrollHandoff(8, -10)).toBe(false);
    expect(shouldPrimeVideoCommentsScrollHandoff(0, 10)).toBe(false);
  });
});
