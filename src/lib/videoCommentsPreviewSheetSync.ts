import {
  VIDEO_COMMENTS_REFERENCE_ASPECT,
  fitVideoCommentsPreview,
} from './videoCommentsGeometry';

const SHEET_SELECTOR = '[data-video-comments-sheet="true"]';
const PREVIEW_SELECTOR = '.video-comments-preview-frame';
const LIVE_SYNC_CLASS = 'video-comments-preview-live-sync';
const POSITION_EPSILON_PX = 0.5;

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

/**
 * Mobile VideoCommentsSheet uses an inline translate3d while moving from the
 * compact detent toward dismissal. During an active touch/pointer gesture this
 * inline transform is the most immediate source of truth: getBoundingClientRect
 * can lag a compositor frame on iOS Safari, which made the Reel follow upward
 * `top` changes but appear frozen while the sheet moved downward by transform.
 */
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

function sheetLogicalTop(sheet: HTMLElement) {
  const inlineTop = Number.parseFloat(sheet.style.top);
  if (Number.isFinite(inlineTop)) return inlineTop;
  return sheet.offsetTop;
}

function sheetVisualTop(sheet: HTMLElement) {
  const logicalTop = sheetLogicalTop(sheet);

  // While the finger owns the gesture, derive the downward edge directly from
  // the same inline translate3d React writes to the sheet. This keeps the Reel
  // and sheet in the exact same gesture frame instead of waiting on WebKit's
  // composited rectangle to catch up.
  if (sheet.dataset.videoCommentsDragging === 'true') {
    const inlineDismissOffset = parseInlineVideoCommentsDismissOffset(sheet.style.transform);
    if (inlineDismissOffset > 0) {
      return resolveVideoCommentsVisualSheetTop(logicalTop, inlineDismissOffset);
    }
  }

  // Once the finger is released, CSS transitions own the motion. The visual
  // rectangle reflects the current interpolated position and keeps spring-back
  // / tap-close animations synchronized rather than jumping to their final
  // inline transform target.
  const rectTop = sheet.getBoundingClientRect().top;
  if (Number.isFinite(rectTop)) return Math.max(0, rectTop);
  return logicalTop;
}

function shouldLiveSync(sheet: HTMLElement, visualTop: number) {
  const logicalTop = sheetLogicalTop(sheet);
  return (
    sheet.dataset.videoCommentsDragging === 'true' ||
    sheet.dataset.videoCommentsDismissPhase === 'true' ||
    sheet.classList.contains('video-comments-preview-tap-closing') ||
    Math.abs(visualTop - logicalTop) > POSITION_EPSILON_PX
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

/**
 * During the compact -> dismiss phase the comments panel moves with CSS
 * transform while its logical `top` stays at the compact detent. React's normal
 * preview geometry therefore sees a stationary sheet and the Reel appears
 * frozen. Drive the preview from the sheet's real visual edge so Reel + comments
 * remain one continuous gesture in both directions, like Instagram.
 */
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
  const live = shouldLiveSync(sheet, visualTop);
  frame.classList.toggle(LIVE_SYNC_CLASS, live);

  if (live) applyVisualGeometry(sheet, frame, video, visualTop);

  // Keep the RAF alive for as long as the mobile comments surface exists. The
  // previous implementation stopped as soon as one frame looked idle, so a
  // later compact -> dismiss transform could start between observer callbacks
  // and leave the video frozen. Continuous polling is scoped to the open sheet
  // only and guarantees the next gesture frame is observed on iOS/Android.
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
