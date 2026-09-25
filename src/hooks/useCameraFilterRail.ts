import { useEffect, type RefObject } from 'react';

const FILTER_SELECTOR = '.alsamos-camera-filter-scroll';
const FILTER_BUTTON_SELECTOR = 'button[aria-label$=" filtri"]';
const RECORDER_SELECTOR = '[data-camera-recorder-root="true"]';
const LIVE_STAGE_SELECTOR = '[data-create-mode="live"]';
const ZOOM_GESTURE_ATTRIBUTE = 'data-camera-zoom-gesture';
const ZOOM_MIN = 1;
const ZOOM_MAX = 5;

interface ActiveZoomGesture {
  host: HTMLElement;
  video: HTMLVideoElement | null;
  kind: 'recorder' | 'live';
  startDistance: number;
  startZoom: number;
}

interface ZoomCapabilities {
  zoom?: {
    min?: number;
    max?: number;
    step?: number;
  } | number;
}

interface ClientPoint {
  clientX: number;
  clientY: number;
}

function clampZoom(value: number) {
  if (!Number.isFinite(value)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

function pointDistance(first: ClientPoint, second: ClientPoint) {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

function pointInside(rect: DOMRect, x: number, y: number) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function showZoomBadge(host: HTMLElement, zoom: number) {
  let badge = host.querySelector<HTMLElement>('[data-camera-zoom-badge="true"]');
  if (!badge) {
    badge = document.createElement('div');
    badge.dataset.cameraZoomBadge = 'true';
    Object.assign(badge.style, {
      position: 'absolute',
      left: '50%',
      bottom: '168px',
      zIndex: '85',
      transform: 'translateX(-50%)',
      border: '1px solid rgba(255,255,255,.16)',
      borderRadius: '999px',
      background: 'rgba(8,11,16,.58)',
      color: '#fff',
      padding: '5px 10px',
      fontSize: '12px',
      fontWeight: '700',
      letterSpacing: '.02em',
      lineHeight: '1',
      backdropFilter: 'blur(14px)',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 120ms ease',
    });
    badge.style.setProperty('-webkit-backdrop-filter', 'blur(14px)');
    host.appendChild(badge);
  }

  badge.textContent = `${zoom.toFixed(zoom < 2 ? 1 : 0)}×`;
  badge.style.opacity = '1';
  const previousTimer = Number(badge.dataset.hideTimer || 0);
  if (previousTimer) window.clearTimeout(previousTimer);
  const timer = window.setTimeout(() => {
    if (badge) badge.style.opacity = '0';
  }, 650);
  badge.dataset.hideTimer = String(timer);
}

function getCurrentZoom(host: HTMLElement) {
  const value = Number(host.dataset.cameraZoom || '1');
  return clampZoom(value || 1);
}

async function applyNativeLiveZoom(video: HTMLVideoElement, zoom: number) {
  const stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
  const track = stream?.getVideoTracks()[0];
  if (!track || typeof track.applyConstraints !== 'function') return false;

  const capabilities = typeof track.getCapabilities === 'function'
    ? (track.getCapabilities() as MediaTrackCapabilities & ZoomCapabilities)
    : null;
  const capability = capabilities?.zoom;

  let target = zoom;
  if (capability && typeof capability === 'object') {
    const min = typeof capability.min === 'number' ? capability.min : ZOOM_MIN;
    const max = typeof capability.max === 'number' ? capability.max : ZOOM_MAX;
    target = Math.min(max, Math.max(min, zoom));
  }

  try {
    await track.applyConstraints({
      advanced: [{ zoom: target } as MediaTrackConstraintSet],
    });
    return true;
  } catch {
    return false;
  }
}

function setCameraZoom(
  host: HTMLElement,
  video: HTMLVideoElement | null,
  kind: 'recorder' | 'live',
  requestedZoom: number,
) {
  const zoom = clampZoom(requestedZoom);
  host.dataset.cameraZoom = String(zoom);
  showZoomBadge(host, zoom);

  if (kind === 'recorder') {
    host.style.setProperty('--alsamos-camera-zoom', String(zoom));
    window.dispatchEvent(
      new CustomEvent('alsamos-camera-zoom', { detail: { zoom } }),
    );
    return;
  }

  // Live prefers hardware zoom so viewers receive exactly what the broadcaster
  // sees. If the browser/device does not expose camera zoom constraints, keep a
  // preview fallback instead of making the gesture appear broken.
  host.style.setProperty('--alsamos-live-camera-zoom', String(zoom));
  if (!video) return;
  void applyNativeLiveZoom(video, zoom).then((nativeApplied) => {
    if (nativeApplied) {
      host.style.setProperty('--alsamos-live-camera-zoom', '1');
    }
  });
}

function resolveZoomTarget(
  root: HTMLElement,
  target: EventTarget | null,
  points?: readonly ClientPoint[],
): Omit<ActiveZoomGesture, 'startDistance' | 'startZoom'> | null {
  const element = target instanceof Element ? target : null;
  const recorder = element?.closest<HTMLElement>(RECORDER_SELECTOR) ?? null;
  if (recorder) {
    if (points && points.length >= 2) {
      const rect = recorder.getBoundingClientRect();
      if (
        !pointInside(rect, points[0].clientX, points[0].clientY) ||
        !pointInside(rect, points[1].clientX, points[1].clientY)
      ) {
        return null;
      }
    }
    return {
      host: recorder,
      video: recorder.querySelector<HTMLVideoElement>('video'),
      kind: 'recorder',
    };
  }

  const liveStage = root.querySelector<HTMLElement>(LIVE_STAGE_SELECTOR);
  const liveVideo = liveStage?.querySelector<HTMLVideoElement>('video') ?? null;
  if (!liveStage || !liveVideo) return null;

  if (points && points.length >= 2) {
    const rect = liveVideo.getBoundingClientRect();
    if (
      !pointInside(rect, points[0].clientX, points[0].clientY) ||
      !pointInside(rect, points[1].clientX, points[1].clientY)
    ) {
      return null;
    }
  } else if (element === liveVideo) {
    // Wheel/pointer event is directly over the live preview.
  } else {
    return null;
  }

  return { host: liveStage, video: liveVideo, kind: 'live' };
}

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

function polishFilterRail(rail: HTMLElement) {
  const shell = rail.parentElement;
  const captureTray = rail.closest<HTMLElement>('.bg-gradient-to-t');
  const compactViewport = window.matchMedia(
    '(max-width: 767.98px), (pointer: coarse) and (max-height: 600px)',
  ).matches;

  if (shell) {
    shell.style.setProperty('background', 'transparent', 'important');
    shell.style.setProperty('box-shadow', 'none', 'important');
    shell.style.setProperty('border-radius', '0', 'important');
    shell.style.setProperty('overflow', 'visible', 'important');
  }

  if (captureTray) {
    captureTray.style.setProperty('background', 'transparent', 'important');
    captureTray.style.setProperty('background-image', 'none', 'important');
  }

  rail.style.setProperty(
    'column-gap',
    compactViewport ? '22px' : '18px',
    'important',
  );
  rail.style.setProperty(
    'padding-inline',
    compactViewport ? '112px' : '100px',
    'important',
  );
}

function attachShutterDragBridge(rail: HTMLElement) {
  const shell = rail.parentElement;
  const shutter = shell?.querySelector<HTMLButtonElement>(
    `button:not([aria-label$=" filtri"])`,
  );
  if (!shutter) return () => undefined;

  let pointerId: number | null = null;
  let startX = 0;
  let startScrollLeft = 0;
  let dragged = false;
  let suppressNextClick = false;
  const previousTouchAction = shutter.style.touchAction;
  const previousSnapType = rail.style.scrollSnapType;
  shutter.style.touchAction = 'none';

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || shutter.disabled) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startScrollLeft = rail.scrollLeft;
    dragged = false;
    suppressNextClick = false;
    rail.style.setProperty('scroll-snap-type', 'none', 'important');
    try {
      shutter.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional on older WebViews.
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    const deltaX = event.clientX - startX;
    if (!dragged && Math.abs(deltaX) < 5) return;
    dragged = true;
    suppressNextClick = true;
    event.preventDefault();
    rail.scrollLeft = startScrollLeft - deltaX;
  };

  const finishPointer = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    if (dragged) event.preventDefault();
    try {
      if (shutter.hasPointerCapture(event.pointerId)) {
        shutter.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture is optional on older WebViews.
    }
    pointerId = null;
    dragged = false;
    if (previousSnapType) {
      rail.style.scrollSnapType = previousSnapType;
    } else {
      rail.style.removeProperty('scroll-snap-type');
    }
  };

  const onClickCapture = (event: MouseEvent) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  shutter.addEventListener('pointerdown', onPointerDown);
  shutter.addEventListener('pointermove', onPointerMove);
  shutter.addEventListener('pointerup', finishPointer);
  shutter.addEventListener('pointercancel', finishPointer);
  shutter.addEventListener('click', onClickCapture, true);

  return () => {
    shutter.style.touchAction = previousTouchAction;
    if (previousSnapType) {
      rail.style.scrollSnapType = previousSnapType;
    } else {
      rail.style.removeProperty('scroll-snap-type');
    }
    shutter.removeEventListener('pointerdown', onPointerDown);
    shutter.removeEventListener('pointermove', onPointerMove);
    shutter.removeEventListener('pointerup', finishPointer);
    shutter.removeEventListener('pointercancel', finishPointer);
    shutter.removeEventListener('click', onClickCapture, true);
  };
}

export function useCameraFilterRail(rootRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const cleanups = new Map<HTMLElement, () => void>();
    const pointerTouches = new Map<
      number,
      { point: ClientPoint; target: EventTarget | null }
    >();
    let activeZoom: ActiveZoomGesture | null = null;
    let zoomFrame = 0;

    const attachRail = (rail: HTMLElement) => {
      if (cleanups.has(rail)) return;

      let commitTimer = 0;
      let frame = 0;
      polishFilterRail(rail);
      const detachShutterDragBridge = attachShutterDragBridge(rail);

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
        detachShutterDragBridge();
        rail.removeEventListener('scroll', onScroll);
      });
    };

    const updateZoom = (distance: number) => {
      if (!activeZoom || distance <= 0 || activeZoom.startDistance <= 0) return;
      const nextZoom = activeZoom.startZoom * (distance / activeZoom.startDistance);
      window.cancelAnimationFrame(zoomFrame);
      zoomFrame = window.requestAnimationFrame(() => {
        if (!activeZoom) return;
        setCameraZoom(activeZoom.host, activeZoom.video, activeZoom.kind, nextZoom);
      });
    };

    const finishZoomGesture = () => {
      const completed = activeZoom;
      activeZoom = null;
      if (!completed || completed.kind !== 'recorder') return;

      completed.host.removeAttribute(ZOOM_GESTURE_ATTRIBUTE);
      // Commit the final stable zoom only after the iOS Canvas2D gesture window
      // ends. This causes one hardware-video transform update instead of one per
      // moving frame, avoiding WebKit's transient giant capsule compositor bug.
      setCameraZoom(
        completed.host,
        completed.video,
        completed.kind,
        getCurrentZoom(completed.host),
      );
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const points = [event.touches[0], event.touches[1]];
      const resolved = resolveZoomTarget(root, event.target, points);
      if (!resolved) return;
      const distance = pointDistance(points[0], points[1]);
      if (distance <= 0) return;

      activeZoom = {
        ...resolved,
        startDistance: distance,
        startZoom: getCurrentZoom(resolved.host),
      };
      if (
        resolved.kind === 'recorder' &&
        document.documentElement.classList.contains('alsamos-ios-camera-canvas-preview')
      ) {
        resolved.host.setAttribute(ZOOM_GESTURE_ATTRIBUTE, 'active');
      }
      event.preventDefault();
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!activeZoom || event.touches.length !== 2) return;
      event.preventDefault();
      updateZoom(pointDistance(event.touches[0], event.touches[1]));
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) finishZoomGesture();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      pointerTouches.set(event.pointerId, {
        point: { clientX: event.clientX, clientY: event.clientY },
        target: event.target,
      });
      if (pointerTouches.size !== 2) return;

      const entries = Array.from(pointerTouches.values()).slice(0, 2);
      const points = entries.map((entry) => entry.point);
      const resolved = resolveZoomTarget(root, entries[0].target, points);
      if (!resolved) return;
      const distance = pointDistance(points[0], points[1]);
      if (distance <= 0) return;

      activeZoom = {
        ...resolved,
        startDistance: distance,
        startZoom: getCurrentZoom(resolved.host),
      };
      if (
        resolved.kind === 'recorder' &&
        document.documentElement.classList.contains('alsamos-ios-camera-canvas-preview')
      ) {
        resolved.host.setAttribute(ZOOM_GESTURE_ATTRIBUTE, 'active');
      }
      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !pointerTouches.has(event.pointerId)) return;
      const current = pointerTouches.get(event.pointerId);
      pointerTouches.set(event.pointerId, {
        point: { clientX: event.clientX, clientY: event.clientY },
        target: current?.target ?? event.target,
      });
      if (!activeZoom || pointerTouches.size < 2) return;
      const points = Array.from(pointerTouches.values())
        .slice(0, 2)
        .map((entry) => entry.point);
      event.preventDefault();
      updateZoom(pointDistance(points[0], points[1]));
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      pointerTouches.delete(event.pointerId);
      if (pointerTouches.size < 2) finishZoomGesture();
    };

    const handleWheel = (event: WheelEvent) => {
      const resolved = resolveZoomTarget(root, event.target);
      if (!resolved) return;
      if ((event.target as Element | null)?.closest(FILTER_SELECTOR)) return;

      event.preventDefault();
      const current = getCurrentZoom(resolved.host);
      const normalizedDelta =
        event.deltaY *
        (event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? window.innerHeight
            : 1);
      const magnitude = Math.min(
        0.35,
        Math.max(0.08, Math.abs(normalizedDelta) / 450),
      );
      const nextZoom = current + (normalizedDelta < 0 ? magnitude : -magnitude);
      setCameraZoom(resolved.host, resolved.video, resolved.kind, nextZoom);
    };

    // Safari exposes native gesture events in addition to pointer/touch events.
    // Prevent browser/page magnification only when the gesture starts on camera.
    const handleNativeGesture = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(RECORDER_SELECTOR) ||
        target?.closest('.create-mode-stage[data-create-mode="live"]')
      ) {
        event.preventDefault();
      }
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

    // Pointer Events cover current Android, iOS, Windows touchscreens and
    // Chromium WebViews. Keep Touch Events as a fallback for older WebKit.
    if (typeof window.PointerEvent === 'function') {
      root.addEventListener('pointerdown', handlePointerDown, { passive: false });
      root.addEventListener('pointermove', handlePointerMove, { passive: false });
      root.addEventListener('pointerup', handlePointerEnd, { passive: true });
      root.addEventListener('pointercancel', handlePointerEnd, { passive: true });
    } else {
      root.addEventListener('touchstart', handleTouchStart, { passive: false });
      root.addEventListener('touchmove', handleTouchMove, { passive: false });
      root.addEventListener('touchend', handleTouchEnd, { passive: true });
      root.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    }
    root.addEventListener('wheel', handleWheel, { passive: false });
    root.addEventListener('gesturestart', handleNativeGesture as EventListener, {
      passive: false,
    });
    root.addEventListener('gesturechange', handleNativeGesture as EventListener, {
      passive: false,
    });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(zoomFrame);
      cleanups.forEach((cleanup) => cleanup());
      cleanups.clear();
      if (activeZoom?.kind === 'recorder') {
        activeZoom.host.removeAttribute(ZOOM_GESTURE_ATTRIBUTE);
      }
      activeZoom = null;
      pointerTouches.clear();
      if (typeof window.PointerEvent === 'function') {
        root.removeEventListener('pointerdown', handlePointerDown);
        root.removeEventListener('pointermove', handlePointerMove);
        root.removeEventListener('pointerup', handlePointerEnd);
        root.removeEventListener('pointercancel', handlePointerEnd);
      } else {
        root.removeEventListener('touchstart', handleTouchStart);
        root.removeEventListener('touchmove', handleTouchMove);
        root.removeEventListener('touchend', handleTouchEnd);
        root.removeEventListener('touchcancel', handleTouchEnd);
      }
      root.removeEventListener('wheel', handleWheel);
      root.removeEventListener('gesturestart', handleNativeGesture as EventListener);
      root.removeEventListener('gesturechange', handleNativeGesture as EventListener);
    };
  }, [rootRef]);
}
