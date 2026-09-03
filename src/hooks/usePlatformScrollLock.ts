import { useEffect, useRef } from 'react';

type PlatformScrollSnapshot = {
  overflow: string;
  overflowY: string;
  overscrollBehavior: string;
  scrollTop: number;
  scrollLeft: number;
};

const activeLocks = new Set<symbol>();
let lockedRoot: HTMLElement | null = null;
let snapshot: PlatformScrollSnapshot | null = null;

function getScrollRoot() {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>('[data-platform-scroll-root="true"]');
}

function applyLock() {
  if (lockedRoot || activeLocks.size === 0) return;

  const root = getScrollRoot();
  if (!root) return;

  lockedRoot = root;
  snapshot = {
    overflow: root.style.overflow,
    overflowY: root.style.overflowY,
    overscrollBehavior: root.style.overscrollBehavior,
    scrollTop: root.scrollTop,
    scrollLeft: root.scrollLeft,
  };

  // Only freeze the actual nested page scroller. Do not change touch-action:
  // on mobile that can suppress scrolling after a stale/unbalanced lock.
  root.style.overflow = 'hidden';
  root.style.overflowY = 'hidden';
  root.style.overscrollBehavior = 'none';
  root.dataset.modalScrollLocked = 'true';
}

function restoreLock() {
  if (activeLocks.size > 0) return;

  const root = lockedRoot;
  const previous = snapshot;
  lockedRoot = null;
  snapshot = null;

  if (!root || !previous) return;

  root.style.overflow = previous.overflow;
  root.style.overflowY = previous.overflowY;
  root.style.overscrollBehavior = previous.overscrollBehavior;
  delete root.dataset.modalScrollLocked;

  // Preserve the exact feed position after the modal closes.
  root.scrollTop = previous.scrollTop;
  root.scrollLeft = previous.scrollLeft;
}

/**
 * Locks only Alsamos's canonical nested page scroller for an explicitly
 * active fullscreen/modal surface. Each hook instance owns a unique token,
 * so React remounts and nested overlays cannot corrupt a global counter.
 */
export function usePlatformScrollLock(active: boolean) {
  const tokenRef = useRef<symbol | null>(null);

  useEffect(() => {
    if (!active) return;

    const token = Symbol('platform-scroll-lock');
    tokenRef.current = token;
    activeLocks.add(token);
    applyLock();

    return () => {
      activeLocks.delete(token);
      if (tokenRef.current === token) tokenRef.current = null;
      restoreLock();
    };
  }, [active]);
}
