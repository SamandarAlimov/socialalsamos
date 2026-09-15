export const VIDEO_COMMENTS_REFERENCE = {
  screenWidth: 945,
  screenHeight: 2048,
  viewportTop: 111,
  video: {
    left: 215,
    top: 111,
    width: 516,
    height: 688,
  },
  sheet: {
    initialTop: 819,
    expandedTop: 111,
    footerTop: 1714,
    // Rounded-corner contour fit across the supplied Instagram reference.
    cornerRadius: 81,
  },
  handle: {
    left: 431,
    top: 856,
    width: 84,
    height: 6,
  },
} as const;

export const VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT =
  VIDEO_COMMENTS_REFERENCE.screenHeight - VIDEO_COMMENTS_REFERENCE.viewportTop;

export const VIDEO_COMMENTS_REFERENCE_ASPECT =
  VIDEO_COMMENTS_REFERENCE.video.width / VIDEO_COMMENTS_REFERENCE.video.height;

/**
 * Pixel measurements are taken from the supplied 945 x 2048 Instagram
 * screenshot. Vertical CSS geometry is relative to the app viewport, which
 * starts below the iOS status-bar region in the reference image.
 *
 * Important: previewWidthRatio / previewHeightRatio reproduce that one 3:4
 * source exactly. Production layout must not force every Reel into that box;
 * fitVideoCommentsPreview() preserves the active video's own aspect ratio.
 */
export const VIDEO_COMMENTS_GEOMETRY = {
  previewWidthRatio:
    VIDEO_COMMENTS_REFERENCE.video.width / VIDEO_COMMENTS_REFERENCE.screenWidth,
  previewHeightRatio:
    VIDEO_COMMENTS_REFERENCE.video.height / VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
  previewTopRatio:
    (VIDEO_COMMENTS_REFERENCE.video.top - VIDEO_COMMENTS_REFERENCE.viewportTop) /
    VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
  previewGapRatio:
    (VIDEO_COMMENTS_REFERENCE.sheet.initialTop -
      VIDEO_COMMENTS_REFERENCE.video.top -
      VIDEO_COMMENTS_REFERENCE.video.height) /
    VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
  initialSheetTopRatio:
    (VIDEO_COMMENTS_REFERENCE.sheet.initialTop - VIDEO_COMMENTS_REFERENCE.viewportTop) /
    VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
  expandedSheetTopRatio:
    (VIDEO_COMMENTS_REFERENCE.sheet.expandedTop - VIDEO_COMMENTS_REFERENCE.viewportTop) /
    VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
  footerHeightRatio:
    (VIDEO_COMMENTS_REFERENCE.screenHeight - VIDEO_COMMENTS_REFERENCE.sheet.footerTop) /
    VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
  sheetCornerRadiusRatio:
    VIDEO_COMMENTS_REFERENCE.sheet.cornerRadius / VIDEO_COMMENTS_REFERENCE.screenWidth,
  handleWidthRatio:
    VIDEO_COMMENTS_REFERENCE.handle.width / VIDEO_COMMENTS_REFERENCE.screenWidth,
  handleHeightRatio:
    VIDEO_COMMENTS_REFERENCE.handle.height / VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
  handleTopWithinSheetRatio:
    (VIDEO_COMMENTS_REFERENCE.handle.top - VIDEO_COMMENTS_REFERENCE.sheet.initialTop) /
    VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
} as const;

export function scaleVideoCommentsReference(width: number, height: number) {
  return {
    previewWidth: width * VIDEO_COMMENTS_GEOMETRY.previewWidthRatio,
    previewHeight: height * VIDEO_COMMENTS_GEOMETRY.previewHeightRatio,
    previewTop: height * VIDEO_COMMENTS_GEOMETRY.previewTopRatio,
    previewGap: height * VIDEO_COMMENTS_GEOMETRY.previewGapRatio,
    initialSheetTop: height * VIDEO_COMMENTS_GEOMETRY.initialSheetTopRatio,
    expandedSheetTop: height * VIDEO_COMMENTS_GEOMETRY.expandedSheetTopRatio,
    footerHeight: height * VIDEO_COMMENTS_GEOMETRY.footerHeightRatio,
    sheetCornerRadius: width * VIDEO_COMMENTS_GEOMETRY.sheetCornerRadiusRatio,
    handleWidth: width * VIDEO_COMMENTS_GEOMETRY.handleWidthRatio,
    handleHeight: height * VIDEO_COMMENTS_GEOMETRY.handleHeightRatio,
    handleTopWithinSheet: height * VIDEO_COMMENTS_GEOMETRY.handleTopWithinSheetRatio,
  };
}

export type VideoCommentsPreviewFit = {
  stageTop: number;
  stageHeight: number;
  mediaTop: number;
  mediaWidth: number;
  mediaHeight: number;
  gap: number;
};

/**
 * Instagram keeps the same playing Reel above the comments sheet and fits it
 * into the available stage without changing the video's aspect ratio. The
 * supplied screenshot happens to contain a 3:4 Reel, which is why its measured
 * preview is 516 x 688. A 9:16 or landscape Reel must produce a different width
 * while retaining the same sheet/stage geometry.
 */
export function fitVideoCommentsPreview(
  width: number,
  height: number,
  aspectRatio: number,
  sheetTop?: number,
): VideoCommentsPreviewFit {
  const viewportWidth = Math.max(1, width || 1);
  const viewportHeight = Math.max(1, height || 1);
  const measured = scaleVideoCommentsReference(viewportWidth, viewportHeight);
  const resolvedSheetTop = Number.isFinite(sheetTop)
    ? Math.min(viewportHeight + measured.previewGap, Math.max(0, sheetTop as number))
    : measured.initialSheetTop;
  const stageTop = measured.previewTop;
  const stageBottom = Math.max(stageTop, Math.min(viewportHeight, resolvedSheetTop - measured.previewGap));
  const stageHeight = Math.max(0, stageBottom - stageTop);

  const safeAspect = Number.isFinite(aspectRatio) && aspectRatio > 0
    ? Math.min(4, Math.max(0.2, aspectRatio))
    : VIDEO_COMMENTS_REFERENCE_ASPECT;

  let mediaHeight = stageHeight;
  let mediaWidth = mediaHeight * safeAspect;

  if (mediaWidth > viewportWidth) {
    mediaWidth = viewportWidth;
    mediaHeight = mediaWidth / safeAspect;
  }

  const mediaTop = stageTop + Math.max(0, (stageHeight - mediaHeight) / 2);

  return {
    stageTop,
    stageHeight,
    mediaTop,
    mediaWidth,
    mediaHeight,
    gap: measured.previewGap,
  };
}
