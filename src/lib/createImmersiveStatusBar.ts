const IMMERSIVE_ATTRIBUTE = 'data-alsamos-immersive-status';
const CREATE_IMMERSIVE_SELECTOR = [
  '.create-page--immersive',
  "[data-camera-recorder-root='true']",
  ".create-mode-stage[data-create-mode='live']",
].join(',');

function hasImmersiveCreateSurface() {
  return Boolean(document.querySelector(CREATE_IMMERSIVE_SELECTOR));
}

/**
 * Keep system chrome in sync with Create's edge-to-edge media surfaces.
 *
 * iOS standalone PWAs use black-translucent + viewport-fit=cover so the camera
 * can paint underneath the status icons. Browsers/platforms that do not expose
 * transparent status-bar composition fall back to the dark camera chrome via
 * the route-aware theme-color handler in index.html instead of showing a white
 * strip above the preview.
 *
 * This deliberately detects DOM capabilities/surfaces rather than user-agent or
 * OS names, so Story, Reel, Live and the Post camera all share one behavior.
 */
export function installCreateImmersiveStatusBar() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => undefined;
  }

  let frame = 0;
  let observer: MutationObserver | null = null;
  let stopped = false;

  const sync = () => {
    frame = 0;
    if (stopped) return;
    const active = hasImmersiveCreateSurface();
    document.documentElement.toggleAttribute(IMMERSIVE_ATTRIBUTE, active);
    document.body?.toggleAttribute(IMMERSIVE_ATTRIBUTE, active);
  };

  const queueSync = () => {
    if (frame || stopped) return;
    frame = window.requestAnimationFrame(sync);
  };

  const start = () => {
    if (stopped || observer) return;
    sync();
    observer = new MutationObserver(queueSync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-camera-recorder-root', 'data-create-mode'],
    });
    window.addEventListener('pageshow', queueSync);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  return () => {
    stopped = true;
    document.removeEventListener('DOMContentLoaded', start);
    window.removeEventListener('pageshow', queueSync);
    if (frame) window.cancelAnimationFrame(frame);
    observer?.disconnect();
    document.documentElement.removeAttribute(IMMERSIVE_ATTRIBUTE);
    document.body?.removeAttribute(IMMERSIVE_ATTRIBUTE);
  };
}
