import {
  VIDEO_COMMENTS_REFERENCE_ASPECT,
  fitVideoCommentsPreview,
} from './videoCommentsGeometry';

const SHEET_SELECTOR = '[data-video-comments-sheet="true"]';
const PREVIEW_SELECTOR = '.video-comments-preview-frame';
const LIVE_SYNC_CLASS = 'video-comments-preview-live-sync';

function getViewportWidth() {
  return Math.max(
    1,
    window.visualViewport?.width ||
      window.innerWidth ||
      document.documentElement.clientWidth ||
      390,
  );
}

function getViewportHeight() {
  return Math.max(
    1,
    window.visualViewport?.height ||
      window.innerHeight ||
      document.documentElement.clientHeight ||
      844,
  );
}

function directVideoChild(frame: HTMLElement) {
  return Array.from(frame.children).find(
    (child): child is HTMLVideoElement => child instanceof HTMLVideoElement,
  ) ?? null;
}

function videoAspect(video: HTMLVideoElement) {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return video.videoWidth / video.videoHeight;
  }

  const rect = video.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return rect.width / rect.height;
  return VIDEO_COMMENTS_REFERENCE_ASPECT;
}

export function resolveVideoCommentsVisualSheetTop(
  sheetTop: number,
  dismissOffset: number,
) {
  return Math.max(0, sheetTop + Math.max(0, dismissOffset));
}

export function parseInlineVideoCommentsDismissOffset(transform: string) {
  if (!transform || transform === 'none') return 0;

  const translate3d = transform.match(
    /translate3d\(\s*[^,]+,\s*(-?\d+(?:\.\d+)?)px\s*,[^)]+\)/i,
  );
  if (translate3d) return Math.max(0, Number.parseFloat(translate3d[1]));

  const translateY = transform.match(/translateY\(\s*(-?\d+(?:\.\d+)?)px\s*\)/i);
  if (translateY) return Math.max(0, Number.parseFloat(translateY[1]));

  return 0;
}

export function parseComputedVideoCommentsTranslateY(transform: string) {
  if (!transform || transform === 'none') return 0;

  const matrix3d = transform.match(/^matrix3d\(([^)]+)\)$/i);
  if (matrix3d) {
    const values = matrix3d[1].split(',').map((value) => Number.parseFloat(value.trim()));
    const y = values[13];
    return Number.isFinite(y) ? Math.max(0, y) : 0;
  }

  const matrix = transform.match(/^matrix\(([^)]+)\)$/i);
  if (matrix) {
    const values = matrix[1].split(',').map((value) => Number.parseFloat(value.trim()));
    const y = values[5];
    return Number.isFinite(y) ? Math.max(0, y) : 0;
  }

  return parseInlineVideoCommentsDismissOffset(transform);
}

function sheetLogicalTop(sheet: HTMLElement) {
  const inlineTop = Number.parseFloat(sheet.style.top);
  if (Number.isFinite(inlineTop)) return inlineTop;
  return sheet.offsetTop;
}

function sheetVisualTop(sheet: HTMLElement) {
  const logicalTop = sheetLogicalTop(sheet);
  const inlineOffset = parseInlineVideoCommentsDismissOffset(sheet.style.transform);
  const computedOffset = parseComputedVideoCommentsTranslateY(
    window.getComputedStyle(sheet).transform,
  );
  const rectTop = sheet.getBoundingClientRect().top;

  return Math.max(
    0,
    logicalTop,
    resolveVideoCommentsVisualSheetTop(logicalTop, inlineOffset),
    resolveVideoCommentsVisualSheetTop(logicalTop, computedOffset),
    Number.isFinite(rectTop) ? rectTop : 0,
  );
}

function findPortalMuteButton(frame: HTMLElement, sheet: HTMLElement) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(
    'button[aria-label="Ovozni yoqish"], button[aria-label="Ovozni o‘chirish"]',
  )).find((button) => (
    button.isConnected &&
    !frame.contains(button) &&
    !sheet.contains(button) &&
    window.getComputedStyle(button).position === 'fixed'
  )) ?? null;
}

function applyVisualGeometry(
  sheet: HTMLElement,
  frame: HTMLElement,
  video: HTMLVideoElement,
  visualTop: number,
) {
  const fit = fitVideoCommentsPreview(
    getViewportWidth(),
    getViewportHeight(),
    videoAspect(video),
    visualTop,
  );

  frame.style.setProperty('--video-comments-preview-stage-top', `${fit.stageTop}px`);
  frame.style.setProperty('--video-comments-preview-stage-height', `${fit.stageHeight}px`);
  frame.style.setProperty('--video-comments-preview-media-top', `${fit.mediaTop - fit.stageTop}px`);
  frame.style.setProperty('--video-comments-preview-media-width', `${fit.mediaWidth}px`);
  frame.style.setProperty('--video-comments-preview-media-height', `${fit.mediaHeight}px`);

  const muteButton = findPortalMuteButton(frame, sheet);
  if (muteButton) {
    muteButton.style.top = `${Math.max(12, fit.stageTop + fit.stageHeight - 54)}px`;
  }
}

export function syncVideoCommentsPreviewToVisualSheet() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;

  const sheet = document.querySelector<HTMLElement>(SHEET_SELECTOR);
  const frame = document.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  const video = frame ? directVideoChild(frame) : null;

  if (!sheet || !frame || !video) {
    frame?.classList.remove(LIVE_SYNC_CLASS);
    return false;
  }

  const visualTop = sheetVisualTop(sheet);
  frame.classList.add(LIVE_SYNC_CLASS);
  applyVisualGeometry(sheet, frame, video, visualTop);

  return true;
}

export function installVideoCommentsPreviewSheetSync() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};

  let rafId: number | null = null;
  let stopped = false;

  const tick = () => {
    rafId = null;
    if (stopped) return;
    const surfaceExists = syncVideoCommentsPreviewToVisualSheet();
    if (surfaceExists) rafId = window.requestAnimationFrame(tick);
  };

  const ensureTick = () => {
    if (stopped || rafId !== null) return;
    rafId = window.requestAnimationFrame(tick);
  };

  const observer = new MutationObserver(ensureTick);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'class',
      'data-state',
      'data-video-comments-dragging',
      'data-video-comments-dismiss-phase',
      'style',
    ],
  });

  window.addEventListener('resize', ensureTick, { passive: true });
  window.visualViewport?.addEventListener('resize', ensureTick, { passive: true });
  document.addEventListener('pointermove', ensureTick, true);
  document.addEventListener('pointerup', ensureTick, true);
  document.addEventListener('touchmove', ensureTick, { capture: true, passive: true });
  document.addEventListener('touchend', ensureTick, true);

  ensureTick();

  return () => {
    stopped = true;
    observer.disconnect();
    if (rafId !== null) window.cancelAnimationFrame(rafId);
    document.querySelector<HTMLElement>(PREVIEW_SELECTOR)?.classList.remove(LIVE_SYNC_CLASS);
    window.removeEventListener('resize', ensureTick);
    window.visualViewport?.removeEventListener('resize', ensureTick);
    document.removeEventListener('pointermove', ensureTick, true);
    document.removeEventListener('pointerup', ensureTick, true);
    document.removeEventListener('touchmove', ensureTick, true);
    document.removeEventListener('touchend', ensureTick, true);
  };
}
