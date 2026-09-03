import { useEffect } from 'react';

type PlatformScrollSnapshot = {
  overflow: string;
  overflowY: string;
  overscrollBehavior: string;
  touchAction: string;
  scrollTop: number;
  scrollLeft: number;
};

let lockCount = 0;
let lockedRoot: HTMLElement | null = null;
let snapshot: PlatformScrollSnapshot | null = null;

function acquirePlatformScrollLock() {
  if (typeof document === 'undefined') return;

  lockCount += 1;
  if (lockCount !== 1) return;

  const root = document.querySelector<HTMLElement>('[data-platform-scroll-root="true"]');
  if (!root) return;

  lockedRoot = root;
  snapshot = {
    overflow: root.style.overflow,
    overflowY: root.style.overflowY,
    overscrollBehavior: root.style.overscrollBehavior,
    touchAction: root.style.touchAction,
    scrollTop: root.scrollTop,
    scrollLeft: root.scrollLeft,
  };

  // Alsamos scrolls standard pages inside AppLayout <main>, not document.body.
  // Modal/fullscreen portals therefore need to freeze this nested scroller too.
  root.style.overflow = 'hidden';
  root.style.overflowY = 'hidden';
  root.style.overscrollBehavior = 'none';
  root.style.touchAction = 'none';
  root.scrollTop = snapshot.scrollTop;
  root.scrollLeft = snapshot.scrollLeft;
  root.dataset.modalScrollLocked = 'true';
}

function releasePlatformScrollLock() {
  if (typeof document === 'undefined') return;

  lockCount = Math.max(0, lockCount - 1);
  if (lockCount !== 0) return;

  const root = lockedRoot;
  const previous = snapshot;

  lockedRoot = null;
  snapshot = null;

  if (!root || !previous) return;

  root.style.overflow = previous.overflow;
  root.style.overflowY = previous.overflowY;
  root.style.overscrollBehavior = previous.overscrollBehavior;
  root.style.touchAction = previous.touchAction;
  delete root.dataset.modalScrollLocked;

  // Cancelled momentum must not move the feed underneath the overlay.
  root.scrollTop = previous.scrollTop;
  root.scrollLeft = previous.scrollLeft;
}

/**
 * Freezes the canonical Alsamos page scroll root while a modal/fullscreen
 * surface is active. Reference counting keeps nested overlays safe.
 */
export function usePlatformScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    acquirePlatformScrollLock();
    return releasePlatformScrollLock;
  }, [active]);
}
