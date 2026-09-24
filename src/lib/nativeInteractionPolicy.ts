const EDITABLE_SELECTOR = 'input, textarea, select, option, [contenteditable="true"], [contenteditable="plaintext-only"], [data-native-interaction="true"], [data-allow-selection="true"]';

function isTouchUi(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const noHover = window.matchMedia?.('(hover: none)').matches ?? false;
  return navigator.maxTouchPoints > 0 && (coarse || noHover);
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(EDITABLE_SELECTOR));
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

  document.addEventListener('contextmenu', stopBrowserUi, true);
  document.addEventListener('selectstart', stopBrowserUi, true);
  document.addEventListener('dragstart', stopMediaDrag, true);
}
