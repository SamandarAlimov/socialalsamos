import { describe, expect, it } from 'vitest';

import {
  VIDEO_COMMENTS_REFERENCE,
  VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
  scaleVideoCommentsReference,
} from './videoCommentsGeometry';

describe('video comments measured geometry', () => {
  it('reproduces the supplied Instagram screenshot coordinates exactly', () => {
    const scaled = scaleVideoCommentsReference(
      VIDEO_COMMENTS_REFERENCE.screenWidth,
      VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
    );

    expect(Math.round(scaled.previewWidth)).toBe(516);
    expect(Math.round(scaled.previewHeight)).toBe(688);
    expect(Math.round(scaled.previewTop + VIDEO_COMMENTS_REFERENCE.viewportTop)).toBe(111);
    expect(Math.round(scaled.initialSheetTop + VIDEO_COMMENTS_REFERENCE.viewportTop)).toBe(819);
    expect(Math.round(scaled.expandedSheetTop + VIDEO_COMMENTS_REFERENCE.viewportTop)).toBe(111);
    expect(Math.round(VIDEO_COMMENTS_REFERENCE.screenHeight - scaled.footerHeight)).toBe(1714);
    expect(Math.round(scaled.sheetCornerRadius)).toBe(81);
    expect(Math.round(scaled.handleWidth)).toBe(84);
    expect(Math.round(scaled.handleHeight)).toBe(6);
    expect(
      Math.round(
        VIDEO_COMMENTS_REFERENCE.sheet.initialTop + scaled.handleTopWithinSheet,
      ),
    ).toBe(856);
  });

  it('uses the app viewport height instead of the full screenshot height', () => {
    expect(VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT).toBe(1937);
  });
});
