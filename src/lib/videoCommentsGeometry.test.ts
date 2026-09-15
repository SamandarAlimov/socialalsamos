import { describe, expect, it } from 'vitest';

import {
  VIDEO_COMMENTS_REFERENCE,
  VIDEO_COMMENTS_REFERENCE_ASPECT,
  VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
  fitVideoCommentsPreview,
  scaleVideoCommentsReference,
} from './videoCommentsGeometry';
import { resolveVideoCommentsVisualSheetTop } from './videoCommentsPreviewSheetSync';

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
    expect(Math.round(scaled.previewGap)).toBe(20);
    expect(
      Math.round(
        VIDEO_COMMENTS_REFERENCE.sheet.initialTop + scaled.handleTopWithinSheet,
      ),
    ).toBe(856);
  });

  it('fits the reference 3:4 Reel exactly above the initial sheet', () => {
    const fit = fitVideoCommentsPreview(
      VIDEO_COMMENTS_REFERENCE.screenWidth,
      VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
      VIDEO_COMMENTS_REFERENCE_ASPECT,
    );

    expect(Math.round(fit.stageHeight)).toBe(688);
    expect(Math.round(fit.mediaWidth)).toBe(516);
    expect(Math.round(fit.mediaHeight)).toBe(688);
    expect(Math.round(fit.mediaTop)).toBe(0);
    expect(Math.round(fit.gap)).toBe(20);
  });

  it('preserves a 9:16 Reel instead of stretching it into the 3:4 reference box', () => {
    const fit = fitVideoCommentsPreview(
      VIDEO_COMMENTS_REFERENCE.screenWidth,
      VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
      9 / 16,
    );

    expect(Math.round(fit.mediaHeight)).toBe(688);
    expect(Math.round(fit.mediaWidth)).toBe(387);
    expect(fit.mediaWidth / fit.mediaHeight).toBeCloseTo(9 / 16, 4);
  });

  it('centers landscape video inside the available preview stage', () => {
    const fit = fitVideoCommentsPreview(
      VIDEO_COMMENTS_REFERENCE.screenWidth,
      VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
      16 / 9,
    );

    expect(Math.round(fit.mediaWidth)).toBe(945);
    expect(Math.round(fit.mediaHeight)).toBe(532);
    expect(Math.round(fit.mediaTop)).toBe(78);
  });

  it('shrinks the preview away when the sheet reaches the expanded detent', () => {
    const scaled = scaleVideoCommentsReference(
      VIDEO_COMMENTS_REFERENCE.screenWidth,
      VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
    );
    const fit = fitVideoCommentsPreview(
      VIDEO_COMMENTS_REFERENCE.screenWidth,
      VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
      VIDEO_COMMENTS_REFERENCE_ASPECT,
      scaled.expandedSheetTop,
    );

    expect(fit.stageHeight).toBe(0);
    expect(fit.mediaWidth).toBe(0);
    expect(fit.mediaHeight).toBe(0);
  });

  it('uses the translated sheet edge while dismissing so the Reel does not freeze', () => {
    const compactTop = 308;
    const dismissOffset = 220;
    const visualTop = resolveVideoCommentsVisualSheetTop(compactTop, dismissOffset);

    expect(visualTop).toBe(528);

    const compactFit = fitVideoCommentsPreview(390, 844, 9 / 16, compactTop);
    const movingFit = fitVideoCommentsPreview(390, 844, 9 / 16, visualTop);
    expect(movingFit.stageHeight).toBeGreaterThan(compactFit.stageHeight);
    expect(movingFit.mediaHeight).toBeGreaterThan(compactFit.mediaHeight);
  });

  it('uses the app viewport height instead of the full screenshot height', () => {
    expect(VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT).toBe(1937);
  });
});
