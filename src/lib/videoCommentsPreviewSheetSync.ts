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

function sheetLogicalTop(sheet: HTMLElement) {
  const inlineTop = Number.parseFloat(sheet.style.top);
  if (Number.isFinite(inlineTop)) return inlineTop;
  return sheet.offsetTop;
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
 * frozen. Read the sheet's actual composited rectangle and drive the preview
 * from that visual edge so Reel + comments remain one continuous gesture, like
 * Instagram. The same path also covers the tap-to-dismiss closing animation.
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

  const visualTop = Math.max(0, sheet.getBoundingClientRect().top);
  const live = shouldLiveSync(sheet, visualTop);
  frame.classList.toggle(LIVE_SYNC_CLASS, live);

  if (!live) return false;
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
    const active = syncVideoCommentsPreviewToVisualSheet();
    if (active) rafId = window.requestAnimationFrame(tick);
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
