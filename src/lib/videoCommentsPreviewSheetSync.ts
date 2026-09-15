import {
  VIDEO_COMMENTS_REFERENCE_ASPECT,
  fitVideoCommentsPreview,
} from './videoCommentsGeometry';

const SHEET_SELECTOR = '[data-video-comments-sheet="true"]';
const COMMENT_LIST_SELECTOR = '[data-comment-list="true"]';
const PREVIEW_SELECTOR = '.video-comments-preview-frame';
const LIVE_SYNC_CLASS = 'video-comments-preview-live-sync';
const COMMENT_SCROLL_EPSILON_PX = 1;

type CommentScrollTouch = {
  identifier: number;
  lastY: number;
  list: HTMLElement;
};

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

/**
 * Native touch scrolling updates scrollTop after the touchmove event dispatch.
 * The sheet's own bubble-phase listener therefore used to see the old positive
 * scrollTop on the exact frame the comments list hit its top edge, and iOS could
 * stop delivering a useful follow-up move because overscroll containment had
 * already consumed the gesture. Prime scrollTop to zero in capture phase when
 * the current finger travel is enough to consume the remaining scroll distance.
 * The existing VideoCommentsSheet listener then receives the same touchmove and
 * can take ownership without requiring the user to lift and start a new drag.
 */
export function shouldPrimeVideoCommentsScrollHandoff(
  scrollTop: number,
  downwardDeltaY: number,
) {
  const remaining = Math.max(0, scrollTop);
  const travel = Math.max(0, downwardDeltaY);
  return (
    travel > 0 &&
    remaining > COMMENT_SCROLL_EPSILON_PX &&
    remaining <= travel + COMMENT_SCROLL_EPSILON_PX
  );
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
  let commentScrollTouch: CommentScrollTouch | null = null;

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

  const findTouch = (touches: TouchList, identifier: number) => {
    for (let index = 0; index < touches.length; index += 1) {
      const touch = touches.item(index);
      if (touch?.identifier === identifier) return touch;
    }
    return null;
  };

  const handleCommentTouchStartCapture = (event: TouchEvent) => {
    if (event.touches.length !== 1 || !(event.target instanceof Element)) {
      commentScrollTouch = null;
      return;
    }

    const list = event.target.closest<HTMLElement>(COMMENT_LIST_SELECTOR);
    const sheet = list?.closest<HTMLElement>(SHEET_SELECTOR);
    const touch = event.touches.item(0);
    if (!list || !sheet || !touch) {
      commentScrollTouch = null;
      return;
    }

    commentScrollTouch = {
      identifier: touch.identifier,
      lastY: touch.clientY,
      list,
    };
  };

  const handleCommentTouchMoveCapture = (event: TouchEvent) => {
    const state = commentScrollTouch;
    if (!state || !state.list.isConnected) return;

    const touch = findTouch(event.touches, state.identifier);
    if (!touch) return;

    const downwardDeltaY = touch.clientY - state.lastY;
    state.lastY = touch.clientY;

    if (shouldPrimeVideoCommentsScrollHandoff(state.list.scrollTop, downwardDeltaY)) {
      // This runs before VideoCommentsSheet's bubble-phase touchmove listener.
      // Setting the edge now lets that listener transfer the *same gesture* to
      // the sheet instead of waiting for a second gesture after native scrolling.
      state.list.scrollTop = 0;
    }
  };

  const clearCommentTouch = () => {
    commentScrollTouch = null;
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
  document.addEventListener('touchstart', handleCommentTouchStartCapture, { capture: true, passive: true });
  document.addEventListener('touchmove', handleCommentTouchMoveCapture, { capture: true, passive: true });
  document.addEventListener('touchmove', ensureTick, { capture: true, passive: true });
  document.addEventListener('touchend', clearCommentTouch, true);
  document.addEventListener('touchcancel', clearCommentTouch, true);
  document.addEventListener('touchend', ensureTick, true);

  ensureTick();

  return () => {
    stopped = true;
    commentScrollTouch = null;
    observer.disconnect();
    if (rafId !== null) window.cancelAnimationFrame(rafId);
    document.querySelector<HTMLElement>(PREVIEW_SELECTOR)?.classList.remove(LIVE_SYNC_CLASS);
    window.removeEventListener('resize', ensureTick);
    window.visualViewport?.removeEventListener('resize', ensureTick);
    document.removeEventListener('pointermove', ensureTick, true);
    document.removeEventListener('pointerup', ensureTick, true);
    document.removeEventListener('touchstart', handleCommentTouchStartCapture, true);
    document.removeEventListener('touchmove', handleCommentTouchMoveCapture, true);
    document.removeEventListener('touchmove', ensureTick, true);
    document.removeEventListener('touchend', clearCommentTouch, true);
    document.removeEventListener('touchcancel', clearCommentTouch, true);
    document.removeEventListener('touchend', ensureTick, true);
  };
}
