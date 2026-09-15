const PREVIEW_SELECTOR = '.video-comments-preview-frame';
const OPEN_SHEET_SELECTOR = '[data-video-comments-sheet="true"][data-state="open"]';
const TAP_MAX_DISTANCE_PX = 14;
const TAP_MAX_DURATION_MS = 650;
const SUPPRESS_COMPAT_CLICK_MS = 700;

export type PreviewTapSample = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationMs: number;
};

export function isVideoCommentsPreviewTap(sample: PreviewTapSample) {
  if (!Number.isFinite(sample.durationMs) || sample.durationMs < 0 || sample.durationMs > TAP_MAX_DURATION_MS) {
    return false;
  }

  const distance = Math.hypot(sample.endX - sample.startX, sample.endY - sample.startY);
  return distance <= TAP_MAX_DISTANCE_PX;
}

type ActivePreviewPointer = {
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
};

function asElement(target: EventTarget | null) {
  return target instanceof Element ? target : null;
}

function activePreviewFrame(target: EventTarget | null) {
  const element = asElement(target);
  if (!element) return null;
  return element.closest<HTMLElement>(PREVIEW_SELECTOR);
}

function openCommentsSheet() {
  return document.querySelector<HTMLElement>(OPEN_SHEET_SELECTOR);
}

function stopPreviewPlaybackGesture(event: Event) {
  if (event.cancelable) event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

/**
 * Close the Radix sheet through its existing controlled onOpenChange path.
 * The CSS closing class wins over the sheet's inline transform while Radix
 * updates React state, so the sheet/composer travels down as one surface.
 *
 * Radix listens for Escape on document. Stop the synthetic Escape at document
 * bubble afterwards so VideoWatchPanel's window-level Escape shortcut does not
 * close the video player itself.
 */
function dismissOpenCommentsSheet(sheet: HTMLElement) {
  if (sheet.dataset.previewTapClosing === 'true') return;

  sheet.dataset.previewTapClosing = 'true';
  sheet.classList.add('video-comments-preview-tap-closing');

  const stopSyntheticEscapeBeforeWindow = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
  };

  document.addEventListener('keydown', stopSyntheticEscapeBeforeWindow, { once: true });
  sheet.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    bubbles: true,
    cancelable: true,
  }));
}

/**
 * Instagram Reel comments treat the compact media preview as a way back to the
 * Reel, not as a play/pause surface. Capture pointer events before React's
 * VideoWatchPanel handlers so its hold-to-speed and single-tap playback logic
 * never start while comments are open. A real tap dismisses the comments sheet;
 * a drag is swallowed but does not accidentally close it.
 */
export function installVideoCommentsPreviewTapDismiss() {
  if (typeof document === 'undefined') return () => {};

  let activePointer: ActivePreviewPointer | null = null;
  let suppressCompatClickUntil = 0;

  const onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (!activePreviewFrame(event.target) || !openCommentsSheet()) return;

    activePointer = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
    };
    stopPreviewPlaybackGesture(event);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!activePointer || activePointer.pointerId !== event.pointerId) return;
    stopPreviewPlaybackGesture(event);
  };

  const onPointerUp = (event: PointerEvent) => {
    const pointer = activePointer;
    if (!pointer || pointer.pointerId !== event.pointerId) return;

    activePointer = null;
    stopPreviewPlaybackGesture(event);
    suppressCompatClickUntil = performance.now() + SUPPRESS_COMPAT_CLICK_MS;

    const sheet = openCommentsSheet();
    if (!sheet) return;

    const isTap = isVideoCommentsPreviewTap({
      startX: pointer.startX,
      startY: pointer.startY,
      endX: event.clientX,
      endY: event.clientY,
      durationMs: performance.now() - pointer.startedAt,
    });

    if (isTap) dismissOpenCommentsSheet(sheet);
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (!activePointer || activePointer.pointerId !== event.pointerId) return;
    activePointer = null;
    stopPreviewPlaybackGesture(event);
  };

  const onClick = (event: MouseEvent) => {
    if (!activePreviewFrame(event.target)) return;
    const sheet = openCommentsSheet();
    if (!sheet) return;

    stopPreviewPlaybackGesture(event);
    if (performance.now() <= suppressCompatClickUntil) return;

    // Keyboard/assistive or browsers that synthesize click without PointerEvent.
    dismissOpenCommentsSheet(sheet);
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerCancel, true);
  document.addEventListener('click', onClick, true);

  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('pointercancel', onPointerCancel, true);
    document.removeEventListener('click', onClick, true);
  };
}
