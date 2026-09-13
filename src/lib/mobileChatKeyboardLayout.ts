const EDITABLE_SELECTOR =
  'input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]';

const SHELL_STYLE_PROPERTIES = [
  'position',
  'top',
  'left',
  'right',
  'bottom',
  'width',
  'height',
  'max-height',
] as const;

const FOOTER_STYLE_PROPERTIES = ['margin-bottom', 'padding-bottom'] as const;

type OrientationKey = 'portrait' | 'landscape';
type InlineStyleSnapshot = Record<string, { value: string; priority: string }>;

interface KeyboardLayoutWindow extends Window {
  __alsamosMobileChatKeyboardLayoutInstalled?: boolean;
}

interface VirtualKeyboardLike extends EventTarget {
  boundingRect?: DOMRectReadOnly;
}

interface NavigatorWithVirtualKeyboard extends Navigator {
  virtualKeyboard?: VirtualKeyboardLike;
}

interface ViewportSnapshot {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
}

function captureInlineStyles(
  element: HTMLElement,
  properties: readonly string[]
): InlineStyleSnapshot {
  const snapshot: InlineStyleSnapshot = {};
  for (const property of properties) {
    snapshot[property] = {
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    };
  }
  return snapshot;
}

function restoreInlineStyles(element: HTMLElement, snapshot: InlineStyleSnapshot | null) {
  if (!snapshot) return;
  for (const [property, saved] of Object.entries(snapshot)) {
    if (saved.value) element.style.setProperty(property, saved.value, saved.priority);
    else element.style.removeProperty(property);
  }
}

function getOrientationKey(): OrientationKey {
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
  }
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
}

function keyboardThreshold(baselineHeight: number) {
  // Browser chrome (address bar/toolbars) can move by tens of pixels. A software
  // keyboard is materially larger, including compact landscape keyboards.
  return Math.max(72, Math.min(160, baselineHeight * 0.14));
}

/**
 * Cross-browser mobile/virtual-keyboard layout synchronizer for chat.
 *
 * Browsers use different keyboard viewport models:
 * - Chromium can resize the layout/content viewport (interactive-widget).
 * - Safari/WebKit commonly changes the VisualViewport and may pan it.
 * - Some embedded/older browsers only expose window.innerHeight changes.
 * - Browsers implementing the VirtualKeyboard API can expose keyboard geometry.
 *
 * We intentionally avoid user-agent sniffing and phone model/width assumptions.
 * The active chat editor and actual viewport/keyboard geometry are the source of truth.
 */
export function installMobileChatKeyboardLayout() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const appWindow = window as KeyboardLayoutWindow;
  if (appWindow.__alsamosMobileChatKeyboardLayoutInstalled) return;
  appWindow.__alsamosMobileChatKeyboardLayoutInstalled = true;

  const visualViewport = window.visualViewport;
  const virtualKeyboard = (navigator as NavigatorWithVirtualKeyboard).virtualKeyboard;

  let activeShell: HTMLElement | null = null;
  let activeFooter: HTMLElement | null = null;
  let anchorRect: DOMRect | null = null;
  let shellStyleSnapshot: InlineStyleSnapshot | null = null;
  let footerStyleSnapshot: InlineStyleSnapshot | null = null;
  let frameId = 0;
  let orientationTimer = 0;

  const baselineHeight: Record<OrientationKey, number> = {
    portrait: 0,
    landscape: 0,
  };

  const getViewport = (): ViewportSnapshot => {
    if (visualViewport) {
      const top = Math.max(0, visualViewport.offsetTop || 0);
      const left = Math.max(0, visualViewport.offsetLeft || 0);
      const width = Math.max(1, visualViewport.width || window.innerWidth || 1);
      const height = Math.max(1, visualViewport.height || window.innerHeight || 1);
      return { top, left, width, height, bottom: top + height };
    }

    const width = Math.max(
      1,
      window.innerWidth || document.documentElement.clientWidth || 1
    );
    const height = Math.max(
      1,
      window.innerHeight || document.documentElement.clientHeight || 1
    );
    return { top: 0, left: 0, width, height, bottom: height };
  };

  const seedBaseline = () => {
    const viewport = getViewport();
    const orientation = getOrientationKey();
    baselineHeight[orientation] = Math.max(baselineHeight[orientation], viewport.height);
  };

  seedBaseline();

  const removeKeyboardLayout = () => {
    if (activeShell) restoreInlineStyles(activeShell, shellStyleSnapshot);
    if (activeFooter) restoreInlineStyles(activeFooter, footerStyleSnapshot);

    activeShell = null;
    activeFooter = null;
    anchorRect = null;
    shellStyleSnapshot = null;
    footerStyleSnapshot = null;
    document.documentElement.removeAttribute('data-chat-keyboard-open');
  };

  const getFocusedChatShell = () => {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement)) return null;

    const editable = focused.matches(EDITABLE_SELECTOR)
      ? focused
      : focused.closest<HTMLElement>(EDITABLE_SELECTOR);
    if (!editable) return null;

    return editable.closest<HTMLElement>('.chat-shell');
  };

  const prepareShell = (shell: HTMLElement) => {
    if (activeShell === shell && anchorRect) return;
    if (activeShell && activeShell !== shell) removeKeyboardLayout();

    activeShell = shell;
    activeFooter = shell.querySelector<HTMLElement>(
      '[data-chat-composer-dock], .pb-safe.mb-16'
    );
    anchorRect = shell.getBoundingClientRect();
    shellStyleSnapshot = captureInlineStyles(shell, SHELL_STYLE_PROPERTIES);
    footerStyleSnapshot = activeFooter
      ? captureInlineStyles(activeFooter, FOOTER_STYLE_PROPERTIES)
      : null;
  };

  const getVirtualKeyboardRect = () => {
    const rect = virtualKeyboard?.boundingRect;
    if (!rect || !Number.isFinite(rect.height) || rect.height <= 0) return null;
    return rect;
  };

  const applyKeyboardLayout = (
    shell: HTMLElement,
    viewport: ViewportSnapshot,
    virtualKeyboardRect: DOMRectReadOnly | null
  ) => {
    prepareShell(shell);
    if (!anchorRect) return;

    // Preserve the chat's original horizontal footprint. This works both for the
    // phone full-screen chat and for split/tablet layouts with an on-screen keyboard.
    const shellTop = viewport.top + Math.max(0, anchorRect.top);
    const shellLeft = viewport.left + Math.max(0, anchorRect.left);
    const viewportRight = viewport.left + viewport.width;
    const availableWidth = Math.max(1, viewportRight - shellLeft);
    const shellWidth = Math.max(1, Math.min(anchorRect.width, availableWidth));

    // In overlay-content mode the keyboard can cover the bottom without shrinking
    // VisualViewport. VirtualKeyboard geometry closes that gap when available.
    const keyboardTop = virtualKeyboardRect
      ? Math.max(viewport.top, virtualKeyboardRect.top)
      : viewport.bottom;
    const usableBottom = Math.min(viewport.bottom, keyboardTop);
    const availableHeight = Math.max(1, usableBottom - shellTop);
    const shellHeight = Math.max(1, Math.min(anchorRect.height, availableHeight));

    shell.style.setProperty('position', 'fixed', 'important');
    shell.style.setProperty('top', `${shellTop}px`, 'important');
    shell.style.setProperty('left', `${shellLeft}px`, 'important');
    shell.style.setProperty('right', 'auto', 'important');
    shell.style.setProperty('bottom', 'auto', 'important');
    shell.style.setProperty('width', `${shellWidth}px`, 'important');
    shell.style.setProperty('height', `${shellHeight}px`, 'important');
    shell.style.setProperty('max-height', `${shellHeight}px`, 'important');

    // The normal mobile chat leaves room for the bottom navigation. While a virtual
    // keyboard is visible, the usable viewport already ends directly above it.
    if (activeFooter) {
      activeFooter.style.setProperty('margin-bottom', '0px', 'important');
      activeFooter.style.setProperty('padding-bottom', '0px', 'important');
    }

    document.documentElement.setAttribute('data-chat-keyboard-open', 'true');
  };

  const sync = () => {
    frameId = 0;

    const viewport = getViewport();
    const orientation = getOrientationKey();
    const focusedShell = getFocusedChatShell();
    const virtualKeyboardRect = getVirtualKeyboardRect();

    if (activeShell && !activeShell.isConnected) removeKeyboardLayout();

    // With no active chat editor, the current viewport is a safe full-height baseline.
    if (!focusedShell) {
      removeKeyboardLayout();
      baselineHeight[orientation] = Math.max(baselineHeight[orientation], viewport.height);
      return;
    }

    prepareShell(focusedShell);

    const baseline = Math.max(baselineHeight[orientation], viewport.height);
    const threshold = keyboardThreshold(baseline);
    const viewportLoss = Math.max(0, baseline - viewport.height);

    const layoutHeight = Math.max(
      baseline,
      window.innerHeight || 0,
      document.documentElement.clientHeight || 0
    );
    const coveredLayout = Math.max(0, layoutHeight - viewport.bottom);
    const virtualKeyboardHeight = virtualKeyboardRect?.height || 0;

    const keyboardOpen =
      Math.max(viewportLoss, coveredLayout, virtualKeyboardHeight) >= threshold;

    if (!keyboardOpen) {
      // Focus can happen one or more frames before the keyboard animation starts.
      // Keep refreshing the anchor/baseline while the viewport is still unobstructed.
      if (activeShell) restoreInlineStyles(activeShell, shellStyleSnapshot);
      if (activeFooter) restoreInlineStyles(activeFooter, footerStyleSnapshot);
      anchorRect = focusedShell.getBoundingClientRect();
      shellStyleSnapshot = captureInlineStyles(focusedShell, SHELL_STYLE_PROPERTIES);
      activeFooter = focusedShell.querySelector<HTMLElement>(
        '[data-chat-composer-dock], .pb-safe.mb-16'
      );
      footerStyleSnapshot = activeFooter
        ? captureInlineStyles(activeFooter, FOOTER_STYLE_PROPERTIES)
        : null;
      baselineHeight[orientation] = Math.max(baselineHeight[orientation], viewport.height);
      document.documentElement.removeAttribute('data-chat-keyboard-open');
      return;
    }

    applyKeyboardLayout(focusedShell, viewport, virtualKeyboardRect);
  };

  const scheduleSync = () => {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(sync);
  };

  const handleFocusIn = () => {
    const shell = getFocusedChatShell();
    if (shell) {
      const viewport = getViewport();
      const orientation = getOrientationKey();
      baselineHeight[orientation] = Math.max(baselineHeight[orientation], viewport.height);
      prepareShell(shell);
    }
    scheduleSync();
  };

  const handleFocusOut = () => {
    // Give focus a frame to move between controls inside the same composer.
    scheduleSync();
    window.setTimeout(scheduleSync, 80);
  };

  const resetOrientationBaseline = () => {
    if (orientationTimer) window.clearTimeout(orientationTimer);
    removeKeyboardLayout();

    const orientation = getOrientationKey();
    baselineHeight[orientation] = getViewport().height;

    // Mobile browsers settle orientation + browser chrome + keyboard in stages.
    orientationTimer = window.setTimeout(() => {
      const focusedShell = getFocusedChatShell();
      if (!focusedShell) seedBaseline();
      scheduleSync();
    }, 350);
  };

  visualViewport?.addEventListener('resize', scheduleSync, { passive: true });
  visualViewport?.addEventListener('scroll', scheduleSync, { passive: true });
  virtualKeyboard?.addEventListener('geometrychange', scheduleSync);
  window.addEventListener('resize', scheduleSync, { passive: true });
  window.addEventListener('orientationchange', resetOrientationBaseline, { passive: true });
  window.screen.orientation?.addEventListener?.('change', resetOrientationBaseline);
  document.addEventListener('focusin', handleFocusIn, true);
  document.addEventListener('focusout', handleFocusOut, true);

  scheduleSync();
}
