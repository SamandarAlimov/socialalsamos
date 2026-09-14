const EDITABLE_SELECTOR =
  'input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]';

const ACTIVE_SHELL_ATTR = 'data-chat-keyboard-layout-active';
const VIEWPORT_LOCK_ATTR = 'data-chat-viewport-lock';
const KEYBOARD_OPEN_ATTR = 'data-chat-keyboard-open';
const STYLE_ID = 'alsamos-chat-keyboard-layout';
const GEOMETRY_EPSILON_PX = 2;
const RELEASE_SETTLE_MS = 64;

type OrientationKey = 'portrait' | 'landscape';

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

interface KeyboardSession {
  shell: HTMLElement;
  anchorRect: DOMRect;
  baselineViewport: ViewportSnapshot;
  baselineInnerHeight: number;
  baselineClientHeight: number;
  orientation: OrientationKey;
  locked: boolean;
  keyboardSeen: boolean;
  focusLostAt: number | null;
}

function getOrientationKey(): OrientationKey {
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
  }
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
}

function roundCssPixel(value: number) {
  // Half-pixel rounding avoids visualViewport sub-pixel noise while remaining
  // sharp on high-DPI mobile screens.
  return Math.round(value * 2) / 2;
}

/**
 * Keeps the active chat editor stable while a software keyboard opens/closes.
 *
 * The important part is that we do NOT wait until a keyboard is already large
 * enough before changing layout. On touch devices the chat is locked to its
 * current on-screen rectangle synchronously on focus, before the browser starts
 * its keyboard animation. From that point only the visible viewport rectangle is
 * updated. This prevents the old sequence: browser pan -> threshold crossed ->
 * switch to fixed positioning -> visible jump back.
 *
 * Geometry is driven by standards/capabilities rather than phone models or user
 * agents: VisualViewport when available, VirtualKeyboard geometry when exposed,
 * and window/document viewport metrics as fallbacks.
 */
export function installMobileChatKeyboardLayout() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const appWindow = window as KeyboardLayoutWindow;
  if (appWindow.__alsamosMobileChatKeyboardLayoutInstalled) return;
  appWindow.__alsamosMobileChatKeyboardLayoutInstalled = true;

  const visualViewport = window.visualViewport;
  const virtualKeyboard = (navigator as NavigatorWithVirtualKeyboard).virtualKeyboard;
  const root = document.documentElement;

  let session: KeyboardSession | null = null;
  let frameId = 0;
  let releaseTimer = 0;
  let orientationTimer = 0;

  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
html[${VIEWPORT_LOCK_ATTR}="true"] [${ACTIVE_SHELL_ATTR}="true"] {
  position: fixed !important;
  top: var(--alsamos-chat-vv-top) !important;
  left: var(--alsamos-chat-vv-left) !important;
  right: auto !important;
  bottom: auto !important;
  width: var(--alsamos-chat-vv-width) !important;
  height: var(--alsamos-chat-vv-height) !important;
  max-height: var(--alsamos-chat-vv-height) !important;
}

html[${KEYBOARD_OPEN_ATTR}="true"] [${ACTIVE_SHELL_ATTR}="true"] [data-chat-composer-dock],
html[${KEYBOARD_OPEN_ATTR}="true"] [${ACTIVE_SHELL_ATTR}="true"] .pb-safe.mb-16 {
  margin-bottom: 0 !important;
  padding-bottom: 0 !important;
}
`;
    document.head.appendChild(style);
  };

  ensureStyle();

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

  const getVirtualKeyboardRect = () => {
    const rect = virtualKeyboard?.boundingRect;
    if (!rect || !Number.isFinite(rect.height) || rect.height <= 0) return null;
    return rect;
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

  const isLikelyTouchKeyboardDevice = () => {
    if ((navigator.maxTouchPoints || 0) > 0) return true;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) {
      return true;
    }
    return 'ontouchstart' in window;
  };

  const setRootPx = (property: string, value: number) => {
    const next = `${roundCssPixel(value)}px`;
    if (root.style.getPropertyValue(property) !== next) {
      root.style.setProperty(property, next);
    }
  };

  const setRootFlag = (attribute: string, enabled: boolean) => {
    if (enabled) {
      if (root.getAttribute(attribute) !== 'true') root.setAttribute(attribute, 'true');
    } else if (root.hasAttribute(attribute)) {
      root.removeAttribute(attribute);
    }
  };

  const clearRootGeometry = () => {
    root.style.removeProperty('--alsamos-chat-vv-top');
    root.style.removeProperty('--alsamos-chat-vv-left');
    root.style.removeProperty('--alsamos-chat-vv-width');
    root.style.removeProperty('--alsamos-chat-vv-height');
  };

  const endSession = () => {
    if (releaseTimer) {
      window.clearTimeout(releaseTimer);
      releaseTimer = 0;
    }

    if (session?.shell) session.shell.removeAttribute(ACTIVE_SHELL_ATTR);
    session = null;
    setRootFlag(KEYBOARD_OPEN_ATTR, false);
    setRootFlag(VIEWPORT_LOCK_ATTR, false);
    clearRootGeometry();
  };

  const applyLockedGeometry = (
    currentSession: KeyboardSession,
    viewport: ViewportSnapshot,
    virtualKeyboardRect: DOMRectReadOnly | null
  ) => {
    const { anchorRect, baselineViewport } = currentSession;

    // Preserve the shell's original offset inside the visible viewport. Full-screen
    // phone chat therefore stays at visual top=0, while split/tablet layouts retain
    // their own panel rectangle instead of being expanded to the whole screen.
    const anchorTopInViewport = Math.max(0, anchorRect.top - baselineViewport.top);
    const anchorLeftInViewport = Math.max(0, anchorRect.left - baselineViewport.left);
    const shellTop = viewport.top + anchorTopInViewport;
    const shellLeft = viewport.left + anchorLeftInViewport;

    const viewportRight = viewport.left + viewport.width;
    const availableWidth = Math.max(1, viewportRight - shellLeft);
    const shellWidth = Math.max(1, Math.min(anchorRect.width, availableWidth));

    // Overlay-mode keyboards may not shrink VisualViewport. If the browser exposes
    // VirtualKeyboard geometry, use its top edge as the real usable bottom.
    const keyboardTop = virtualKeyboardRect
      ? Math.max(viewport.top, virtualKeyboardRect.top)
      : viewport.bottom;
    const usableBottom = Math.min(viewport.bottom, keyboardTop);
    const availableHeight = Math.max(1, usableBottom - shellTop);
    const shellHeight = Math.max(1, Math.min(anchorRect.height, availableHeight));

    setRootPx('--alsamos-chat-vv-top', shellTop);
    setRootPx('--alsamos-chat-vv-left', shellLeft);
    setRootPx('--alsamos-chat-vv-width', shellWidth);
    setRootPx('--alsamos-chat-vv-height', shellHeight);
    setRootFlag(VIEWPORT_LOCK_ATTR, true);
    currentSession.locked = true;
  };

  const beginSession = (shell: HTMLElement) => {
    if (session?.shell === shell) return session;
    if (session) endSession();

    const viewport = getViewport();
    session = {
      shell,
      anchorRect: shell.getBoundingClientRect(),
      baselineViewport: viewport,
      baselineInnerHeight: Math.max(1, window.innerHeight || viewport.height),
      baselineClientHeight: Math.max(
        1,
        document.documentElement.clientHeight || window.innerHeight || viewport.height
      ),
      orientation: getOrientationKey(),
      locked: false,
      keyboardSeen: false,
      focusLostAt: null,
    };

    shell.setAttribute(ACTIVE_SHELL_ATTR, 'true');

    // On phones/tablets focusin fires before the OS keyboard animation. Locking the
    // exact current rectangle here is visually neutral, but prevents the browser's
    // intermediate pan from ever becoming a painted frame.
    if (isLikelyTouchKeyboardDevice()) {
      applyLockedGeometry(session, viewport, getVirtualKeyboardRect());
    }

    return session;
  };

  const keyboardGeometryChanged = (
    currentSession: KeyboardSession,
    viewport: ViewportSnapshot,
    virtualKeyboardRect: DOMRectReadOnly | null
  ) => {
    const visualHeightLoss = Math.max(
      0,
      currentSession.baselineViewport.height - viewport.height
    );
    const visualTopShift = Math.abs(viewport.top - currentSession.baselineViewport.top);
    const visualLeftShift = Math.abs(viewport.left - currentSession.baselineViewport.left);
    const innerHeightLoss = Math.max(
      0,
      currentSession.baselineInnerHeight - Math.max(1, window.innerHeight || viewport.height)
    );
    const clientHeightLoss = Math.max(
      0,
      currentSession.baselineClientHeight -
        Math.max(1, document.documentElement.clientHeight || window.innerHeight || viewport.height)
    );
    const virtualKeyboardHeight = virtualKeyboardRect?.height || 0;

    return (
      Math.max(
        visualHeightLoss,
        visualTopShift,
        visualLeftShift,
        innerHeightLoss,
        clientHeightLoss,
        virtualKeyboardHeight
      ) > GEOMETRY_EPSILON_PX
    );
  };

  const scheduleReleaseCheck = () => {
    if (releaseTimer) window.clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(() => {
      releaseTimer = 0;
      scheduleSync();
    }, RELEASE_SETTLE_MS);
  };

  const sync = () => {
    frameId = 0;

    const focusedShell = getFocusedChatShell();

    if (session && !session.shell.isConnected) endSession();

    if (focusedShell && (!session || session.shell !== focusedShell)) {
      beginSession(focusedShell);
    }

    if (!session) return;

    // Orientation is a genuine layout change, not a keyboard animation. Re-anchor
    // after the browser has applied the new orientation instead of stretching the
    // old portrait/landscape rectangle.
    if (session.orientation !== getOrientationKey()) {
      const shell = focusedShell || session.shell;
      endSession();
      window.requestAnimationFrame(() => {
        if (shell.isConnected && getFocusedChatShell() === shell) beginSession(shell);
        scheduleSync();
      });
      return;
    }

    const viewport = getViewport();
    const virtualKeyboardRect = getVirtualKeyboardRect();
    const keyboardOpen = keyboardGeometryChanged(session, viewport, virtualKeyboardRect);

    if (keyboardOpen) session.keyboardSeen = true;
    setRootFlag(KEYBOARD_OPEN_ATTR, keyboardOpen);

    // Non-touch environments are left completely alone until real keyboard/viewport
    // geometry changes. Touch devices were already pre-locked synchronously at focus.
    if (session.locked || keyboardOpen) {
      applyLockedGeometry(session, viewport, virtualKeyboardRect);
    }

    if (focusedShell === session.shell) {
      session.focusLostAt = null;
      return;
    }

    // Focus can leave the editor before the OS keyboard finishes closing. Keep the
    // same locked shell through the close animation, then release only after the
    // viewport has returned to its pre-focus geometry for a short settled window.
    if (session.focusLostAt == null) session.focusLostAt = performance.now();

    if (keyboardOpen) {
      scheduleReleaseCheck();
      return;
    }

    const elapsed = performance.now() - session.focusLostAt;
    if (elapsed < RELEASE_SETTLE_MS) {
      scheduleReleaseCheck();
      return;
    }

    endSession();
  };

  function scheduleSync() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(sync);
  }

  const handleFocusIn = () => {
    const shell = getFocusedChatShell();
    if (shell) beginSession(shell);
    scheduleSync();
  };

  const handleFocusOut = () => {
    if (session && session.focusLostAt == null) session.focusLostAt = performance.now();

    // Different engines emit keyboard-close geometry events at different moments.
    // These checks cover browsers that send only one resize event or no final one.
    scheduleSync();
    scheduleReleaseCheck();
    window.setTimeout(scheduleSync, 180);
    window.setTimeout(scheduleSync, 360);
  };

  const handleOrientationChange = () => {
    if (orientationTimer) window.clearTimeout(orientationTimer);
    const focusedShell = getFocusedChatShell();
    endSession();

    orientationTimer = window.setTimeout(() => {
      if (focusedShell?.isConnected && getFocusedChatShell() === focusedShell) {
        beginSession(focusedShell);
      }
      scheduleSync();
    }, 250);
  };

  visualViewport?.addEventListener('resize', scheduleSync, { passive: true });
  visualViewport?.addEventListener('scroll', scheduleSync, { passive: true });
  virtualKeyboard?.addEventListener('geometrychange', scheduleSync);
  window.addEventListener('resize', scheduleSync, { passive: true });
  window.addEventListener('orientationchange', handleOrientationChange, { passive: true });
  window.screen.orientation?.addEventListener?.('change', handleOrientationChange);
  document.addEventListener('focusin', handleFocusIn, true);
  document.addEventListener('focusout', handleFocusOut, true);
}