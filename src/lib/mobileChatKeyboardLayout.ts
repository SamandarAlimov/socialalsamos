const MOBILE_CHAT_MAX_WIDTH = 767;
const KEYBOARD_THRESHOLD_PX = 120;
const EDITABLE_SELECTOR =
  'input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]';

interface KeyboardLayoutWindow extends Window {
  __alsamosMobileChatKeyboardLayoutInstalled?: boolean;
}

/**
 * iOS Safari/PWA klaviaturani ochganda layout viewportni emas, visual viewportni
 * siljitishi mumkin. Natijada fixed chatning headeri ham yuqoriga surilib ketadi.
 *
 * Bu sinxronizator faqat mobil chat ichidagi aktiv editor uchun ishlaydi:
 * - chat shell visual viewportning ko'rinadigan qismiga mahkamlanadi;
 * - header ekranning yuqorisida qoladi;
 * - xabarlar maydoni qisqaradi;
 * - composer klaviaturaning bevosita ustida turadi.
 */
export function installMobileChatKeyboardLayout() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const appWindow = window as KeyboardLayoutWindow;
  if (appWindow.__alsamosMobileChatKeyboardLayoutInstalled) return;
  appWindow.__alsamosMobileChatKeyboardLayoutInstalled = true;

  const visualViewport = window.visualViewport;
  if (!visualViewport) return;

  let baselineHeight = visualViewport.height;
  let baselineWidth = visualViewport.width;
  let activeShell: HTMLElement | null = null;
  let activeFooter: HTMLElement | null = null;
  let frameId = 0;
  let orientationTimer = 0;

  const removeKeyboardLayout = () => {
    if (activeShell) {
      activeShell.style.removeProperty('position');
      activeShell.style.removeProperty('top');
      activeShell.style.removeProperty('left');
      activeShell.style.removeProperty('right');
      activeShell.style.removeProperty('bottom');
      activeShell.style.removeProperty('width');
      activeShell.style.removeProperty('height');
      activeShell.style.removeProperty('max-height');
    }

    if (activeFooter) {
      activeFooter.style.removeProperty('margin-bottom');
      activeFooter.style.removeProperty('padding-bottom');
    }

    activeShell = null;
    activeFooter = null;
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

  const applyKeyboardLayout = (shell: HTMLElement) => {
    if (activeShell && activeShell !== shell) removeKeyboardLayout();

    activeShell = shell;
    activeFooter = shell.querySelector<HTMLElement>('.pb-safe.mb-16');

    // visualViewport.offsetTop iOS'ning avtomatik page-panini kompensatsiya qiladi.
    shell.style.setProperty('position', 'fixed', 'important');
    shell.style.setProperty('top', `${Math.max(0, visualViewport.offsetTop)}px`, 'important');
    shell.style.setProperty('left', `${Math.max(0, visualViewport.offsetLeft)}px`, 'important');
    shell.style.setProperty('right', 'auto', 'important');
    shell.style.setProperty('bottom', 'auto', 'important');
    shell.style.setProperty('width', `${visualViewport.width}px`, 'important');
    shell.style.setProperty('height', `${visualViewport.height}px`, 'important');
    shell.style.setProperty('max-height', `${visualViewport.height}px`, 'important');

    // Oddiy holatda bu 64px mobil bottom-nav uchun joy qoldiradi. Klaviatura ochiq
    // paytda esa visual viewportning pasti allaqachon klaviatura ustida tugaydi.
    if (activeFooter) {
      activeFooter.style.setProperty('margin-bottom', '0px', 'important');
      activeFooter.style.setProperty('padding-bottom', '0px', 'important');
    }

    document.documentElement.setAttribute('data-chat-keyboard-open', 'true');
  };

  const sync = () => {
    frameId = 0;

    const isMobile = window.innerWidth <= MOBILE_CHAT_MAX_WIDTH;
    if (!isMobile) {
      removeKeyboardLayout();
      baselineHeight = visualViewport.height;
      baselineWidth = visualViewport.width;
      return;
    }

    // Orientation yoki keskin viewport-width o'zgarishida eski portrait baseline
    // noto'g'ri keyboard deb qabul qilinmasligi kerak.
    if (Math.abs(visualViewport.width - baselineWidth) > 80) {
      baselineWidth = visualViewport.width;
      baselineHeight = visualViewport.height;
      removeKeyboardLayout();
      return;
    }

    const focusedShell = getFocusedChatShell();
    if (activeShell && !activeShell.isConnected) {
      activeShell = null;
      activeFooter = null;
    }

    const shell = focusedShell || activeShell;
    const viewportLoss = Math.max(0, baselineHeight - visualViewport.height);
    const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
    const visibleBottom = visualViewport.offsetTop + visualViewport.height;
    const coveredLayout = Math.max(0, layoutHeight - visibleBottom);
    const keyboardOpen = Math.max(viewportLoss, coveredLayout) >= KEYBOARD_THRESHOLD_PX;

    if (!shell || !keyboardOpen) {
      removeKeyboardLayout();
      baselineHeight = Math.max(baselineHeight, visualViewport.height);
      baselineWidth = visualViewport.width;
      return;
    }

    applyKeyboardLayout(shell);
  };

  const scheduleSync = () => {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(sync);
  };

  const resetOrientationBaseline = () => {
    if (orientationTimer) window.clearTimeout(orientationTimer);
    removeKeyboardLayout();
    baselineHeight = visualViewport.height;
    baselineWidth = visualViewport.width;
    orientationTimer = window.setTimeout(() => {
      baselineHeight = visualViewport.height;
      baselineWidth = visualViewport.width;
      scheduleSync();
    }, 250);
  };

  visualViewport.addEventListener('resize', scheduleSync, { passive: true });
  visualViewport.addEventListener('scroll', scheduleSync, { passive: true });
  window.addEventListener('resize', scheduleSync, { passive: true });
  window.addEventListener('orientationchange', resetOrientationBaseline, { passive: true });
  document.addEventListener('focusin', scheduleSync, true);
  document.addEventListener('focusout', scheduleSync, true);

  scheduleSync();
}
