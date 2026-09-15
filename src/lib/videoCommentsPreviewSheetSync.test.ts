import { describe, expect, it } from 'vitest';
import {
  parseComputedVideoCommentsTranslateY,
  parseInlineVideoCommentsDismissOffset,
  resolveVideoCommentsVisualSheetTop,
} from './videoCommentsPreviewSheetSync';

describe('video comments preview sheet sync', () => {
  it('resolves compact-to-dismiss downward movement from inline translate3d', () => {
    const offset = parseInlineVideoCommentsDismissOffset('translate3d(0, 126px, 0)');
    expect(offset).toBe(126);
    expect(resolveVideoCommentsVisualSheetTop(612, offset)).toBe(738);
  });

  it('reads translateY from computed 2d matrices', () => {
    expect(parseComputedVideoCommentsTranslateY('matrix(1, 0, 0, 1, 0, 84)')).toBe(84);
  });

  it('reads translateY from computed 3d matrices', () => {
    expect(parseComputedVideoCommentsTranslateY('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 137, 0, 1)')).toBe(137);
  });
});
