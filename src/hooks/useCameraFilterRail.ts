import { useEffect, type RefObject } from 'react';

const FILTER_SELECTOR = '.alsamos-camera-filter-scroll';
const FILTER_BUTTON_SELECTOR = 'button[aria-label$=" filtri"]';

function setFilterPreview(rail: HTMLElement, button: HTMLButtonElement) {
  const shell = rail.parentElement;
  const bubble = button.firstElementChild as HTMLElement | null;
  const colorLayer = bubble?.children[0] as HTMLElement | null;
  if (!shell || !colorLayer) return;

  const isNormal = button.getAttribute('aria-label')?.startsWith('Normal ') ?? false;
  const computed = window.getComputedStyle(colorLayer);
  const overlay = Array.from(bubble?.children ?? []).find((child, index) => {
    if (index === 0 || !(child instanceof HTMLElement)) return false;
    return Boolean(child.style.mixBlendMode || child.style.background);
  }) as HTMLElement | undefined;

  shell.style.setProperty(
    '--alsamos-filter-preview-image',
    isNormal ? 'none' : computed.backgroundImage || 'none',
  );
  shell.style.setProperty(
    '--alsamos-filter-preview-color',
    isNormal ? '#ffffff' : computed.backgroundColor || '#4b5563',
  );
  shell.style.setProperty(
    '--alsamos-filter-preview-filter',
    isNormal ? 'none' : colorLayer.style.filter || 'none',
  );
  shell.style.setProperty(
    '--alsamos-filter-preview-overlay',
    isNormal ? 'transparent' : overlay?.style.background || 'transparent',
  );
  shell.style.setProperty(
    '--alsamos-filter-preview-blend',
    isNormal ? 'normal' : overlay?.style.mixBlendMode || 'normal',
  );
  shell.style.setProperty(
    '--alsamos-filter-preview-opacity',
    isNormal ? '0' : overlay?.style.opacity || (overlay ? '1' : '0'),
  );

  rail.querySelectorAll<HTMLButtonElement>(FILTER_BUTTON_SELECTOR).forEach((item) => {
    if (item === button) item.dataset.railNearest = 'true';
    else delete item.dataset.railNearest;
  });
}

function nearestFilterButton(rail: HTMLElement): HTMLButtonElement | null {
  const buttons = Array.from(
    rail.querySelectorAll<HTMLButtonElement>(FILTER_BUTTON_SELECTOR),
  );
  if (buttons.length === 0) return null;

  const railRect = rail.getBoundingClientRect();
  const center = railRect.left + railRect.width / 2;

  return buttons.reduce<HTMLButtonElement | null>((nearest, button) => {
    if (!nearest) return button;
    const buttonRect = button.getBoundingClientRect();
    const nearestRect = nearest.getBoundingClientRect();
    const buttonDistance = Math.abs(buttonRect.left + buttonRect.width / 2 - center);
    const nearestDistance = Math.abs(nearestRect.left + nearestRect.width / 2 - center);
    return buttonDistance < nearestDistance ? button : nearest;
  }, null);
}

function centerActiveFilter(rail: HTMLElement) {
  const active = rail.querySelector<HTMLButtonElement>(
    `${FILTER_BUTTON_SELECTOR}[aria-pressed="true"]`,
  );
  if (!active) return;
  setFilterPreview(rail, active);
  active.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
}

export function useCameraFilterRail(rootRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const cleanups = new Map<HTMLElement, () => void>();

    const attachRail = (rail: HTMLElement) => {
      if (cleanups.has(rail)) return;

      let commitTimer = 0;
      let frame = 0;

      const updateNearest = () => {
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => {
          const nearest = nearestFilterButton(rail);
          if (nearest) setFilterPreview(rail, nearest);
        });
      };

      const commitNearest = () => {
        window.clearTimeout(commitTimer);
        commitTimer = window.setTimeout(() => {
          const nearest = nearestFilterButton(rail);
          if (!nearest) return;
          setFilterPreview(rail, nearest);
          if (nearest.getAttribute('aria-pressed') !== 'true') nearest.click();
        }, 320);
      };

      const onScroll = () => {
        updateNearest();
        commitNearest();
      };

      rail.addEventListener('scroll', onScroll, { passive: true });
      window.requestAnimationFrame(() => centerActiveFilter(rail));

      cleanups.set(rail, () => {
        window.clearTimeout(commitTimer);
        window.cancelAnimationFrame(frame);
        rail.removeEventListener('scroll', onScroll);
      });
    };

    const scan = () => {
      root.querySelectorAll<HTMLElement>(FILTER_SELECTOR).forEach(attachRail);
      cleanups.forEach((cleanup, rail) => {
        if (!root.contains(rail)) {
          cleanup();
          cleanups.delete(rail);
        }
      });
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cleanups.forEach((cleanup) => cleanup());
      cleanups.clear();
    };
  }, [rootRef]);
}
