const EDITABLE_SELECTOR = 'input, textarea, select, option, [contenteditable="true"], [contenteditable="plaintext-only"], [data-native-interaction="true"], [data-allow-selection="true"]';
const SHARE_SHORTCUT_SCROLLER_SELECTOR = '[data-share-shortcuts-scroll="true"]';

function isTouchUi(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const noHover = window.matchMedia?.('(hover: none)').matches ?? false;
  return navigator.maxTouchPoints > 0 && (coarse || noHover);
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(EDITABLE_SELECTOR));
}

function getShareShortcutScroller(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(SHARE_SHORTCUT_SCROLLER_SELECTOR);
}

export function installNativeInteractionPolicy(): void {
  if (typeof document === 'undefined' || !isTouchUi()) return;

  document.documentElement.dataset.touchUi = 'true';

  const stopBrowserUi = (event: Event) => {
    if (!isEditableTarget(event.target)) event.preventDefault();
  };

  const stopMediaDrag = (event: DragEvent) => {
    if (isEditableTarget(event.target)) return;
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('img, svg, a')) event.preventDefault();
  };

  // iOS/WebKit can hand a horizontal gesture that starts on a button to the
  // button/overlay instead of the fixed overflow scroller underneath it. The
  // share dock is intentionally outside the Vaul drawer, so provide a small
  // axis-locked fallback that drives scrollLeft directly. Native overflow is
  // still present; this only takes over after the gesture is clearly horizontal.
  let shareGesture:
    | {
        scroller: HTMLElement;
        startX: number;
        startY: number;
        startScrollLeft: number;
        axis: 'x' | 'y' | null;
        dragged: boolean;
      }
    | null = null;
  let suppressShareClickUntil = 0;

  const onShareTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) return;
    const scroller = getShareShortcutScroller(event.target);
    const touch = event.touches[0];
    if (!scroller || !touch) return;

    shareGesture = {
      scroller,
      startX: touch.clientX,
      startY: touch.clientY,
      startScrollLeft: scroller.scrollLeft,
      axis: null,
      dragged: false,
    };
  };

  const onShareTouchMove = (event: TouchEvent) => {
    if (!shareGesture || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (!touch) return;

    const dx = touch.clientX - shareGesture.startX;
    const dy = touch.clientY - shareGesture.startY;

    if (!shareGesture.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      shareGesture.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }

    if (shareGesture.axis !== 'x') return;

    shareGesture.dragged = true;
    shareGesture.scroller.scrollLeft = shareGesture.startScrollLeft - dx;

    // Once the gesture is horizontally locked, keep Vaul/buttons/browser page
    // gestures from stealing it. This is what makes the row dependable on iOS.
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
  };

  const finishShareTouch = () => {
    if (shareGesture?.dragged) suppressShareClickUntil = Date.now() + 450;
    shareGesture = null;
  };

  const suppressClickAfterShareDrag = (event: MouseEvent) => {
    if (Date.now() > suppressShareClickUntil) return;
    if (!getShareShortcutScroller(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  document.addEventListener('contextmenu', stopBrowserUi, true);
  document.addEventListener('selectstart', stopBrowserUi, true);
  document.addEventListener('dragstart', stopMediaDrag, true);
  document.addEventListener('touchstart', onShareTouchStart, { capture: true, passive: true });
  document.addEventListener('touchmove', onShareTouchMove, { capture: true, passive: false });
  document.addEventListener('touchend', finishShareTouch, true);
  document.addEventListener('touchcancel', finishShareTouch, true);
  document.addEventListener('click', suppressClickAfterShareDrag, true);
}
