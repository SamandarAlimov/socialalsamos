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
    // Rounded-corner contour fit across both supplied Instagram states:
    // ~80.5..81.5 physical screenshot pixels.
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

/**
 * Pixel measurements are taken from the supplied 945 x 2048 Instagram
 * screenshots. Vertical CSS geometry must be relative to the app viewport,
 * which starts below the iOS status bar at screenshot y=111, not to the full
 * screenshot height.
 */
export const VIDEO_COMMENTS_GEOMETRY = {
  previewWidthRatio:
    VIDEO_COMMENTS_REFERENCE.video.width / VIDEO_COMMENTS_REFERENCE.screenWidth,
  previewHeightRatio:
    VIDEO_COMMENTS_REFERENCE.video.height / VIDEO_COMMENTS_REFERENCE_VIEWPORT_HEIGHT,
  previewTopRatio:
    (VIDEO_COMMENTS_REFERENCE.video.top - VIDEO_COMMENTS_REFERENCE.viewportTop) /
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
    initialSheetTop: height * VIDEO_COMMENTS_GEOMETRY.initialSheetTopRatio,
    expandedSheetTop: height * VIDEO_COMMENTS_GEOMETRY.expandedSheetTopRatio,
    footerHeight: height * VIDEO_COMMENTS_GEOMETRY.footerHeightRatio,
    sheetCornerRadius: width * VIDEO_COMMENTS_GEOMETRY.sheetCornerRadiusRatio,
    handleWidth: width * VIDEO_COMMENTS_GEOMETRY.handleWidthRatio,
    handleHeight: height * VIDEO_COMMENTS_GEOMETRY.handleHeightRatio,
    handleTopWithinSheet: height * VIDEO_COMMENTS_GEOMETRY.handleTopWithinSheetRatio,
  };
}
