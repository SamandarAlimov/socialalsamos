const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

interface ZoomRange {
  min?: number;
  max?: number;
  step?: number;
}

interface ZoomCapabilities {
  zoom?: ZoomRange | number;
}

interface ClientPoint {
  clientX: number;
  clientY: number;
}

interface GestureState {
  video: HTMLVideoElement;
  startDistance: number;
  startZoom: number;
}

function clampZoom(value: number) {
  if (!Number.isFinite(value)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function distance(first: ClientPoint, second: ClientPoint) {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

function pointInside(rect: DOMRect, point: ClientPoint) {
  return (
    point.clientX >= rect.left &&
    point.clientX <= rect.right &&
    point.clientY >= rect.top &&
    point.clientY <= rect.bottom
  );
}

function isCreateLiveCamera(video: HTMLVideoElement) {
  if (video.closest('[data-camera-recorder-root="true"]')) return false;
  // The regular Live setup preview is already handled by useCameraFilterRail.
  // This installer exists for the fullscreen portal, which lives outside main.
  if (video.closest('.create-page-main')) return false;
  if (!(video.srcObject instanceof MediaStream)) return false;
  return Boolean(document.querySelector('.create-page[data-create-mode="live"]'));
}

function getZoom(video: HTMLVideoElement) {
  return clampZoom(Number(video.dataset.createCameraZoom || '1') || 1);
}

function showBadge(video: HTMLVideoElement, zoom: number) {
  const parent = video.parentElement;
  if (!parent) return;
  const computed = window.getComputedStyle(parent);
  if (computed.position === 'static') parent.style.position = 'relative';

  let badge = parent.querySelector<HTMLElement>('[data-live-camera-zoom-badge="true"]');
  if (!badge) {
    badge = document.createElement('div');
    badge.dataset.liveCameraZoomBadge = 'true';
    Object.assign(badge.style, {
      position: 'absolute',
      left: '50%',
      bottom: '92px',
      zIndex: '120',
      transform: 'translateX(-50%)',
      padding: '6px 10px',
      borderRadius: '999px',
      border: '1px solid rgba(255,255,255,.18)',
      background: 'rgba(0,0,0,.55)',
      color: '#fff',
      font: '700 12px/1 system-ui, sans-serif',
      pointerEvents: 'none',
      backdropFilter: 'blur(12px)',
      opacity: '0',
      transition: 'opacity 120ms ease',
    });
    badge.style.setProperty('-webkit-backdrop-filter', 'blur(12px)');
    parent.appendChild(badge);
  }

  badge.textContent = `${zoom.toFixed(zoom < 2 ? 1 : 0)}×`;
  badge.style.opacity = '1';
  const oldTimer = Number(badge.dataset.hideTimer || 0);
  if (oldTimer) window.clearTimeout(oldTimer);
  badge.dataset.hideTimer = String(
    window.setTimeout(() => {
      if (badge) badge.style.opacity = '0';
    }, 650),
  );
}

async function applyZoom(video: HTMLVideoElement, requested: number) {
  const zoom = clampZoom(requested);
  video.dataset.createCameraZoom = String(zoom);
  showBadge(video, zoom);

  const stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
  const track = stream?.getVideoTracks()[0];
  let nativeApplied = false;

  if (
    track &&
    typeof track.applyConstraints === 'function' &&
    typeof track.getCapabilities === 'function'
  ) {
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & ZoomCapabilities;
    const capability = capabilities.zoom;

    // Only ask the device for native zoom when it explicitly advertises it.
    // This avoids repeated OverconstrainedError/TypeError churn in WebViews and
    // browsers that implement applyConstraints but not camera zoom.
    if (capability) {
      let target = zoom;
      if (typeof capability === 'object') {
        const min = typeof capability.min === 'number' ? capability.min : MIN_ZOOM;
        const max = typeof capability.max === 'number' ? capability.max : MAX_ZOOM;
        target = Math.min(max, Math.max(min, zoom));
      }

      try {
        await track.applyConstraints({
          advanced: [{ zoom: target } as MediaTrackConstraintSet],
        });
        nativeApplied = true;
      } catch {
        nativeApplied = false;
      }
    }
  }

  // Native track zoom is broadcast to viewers. CSS transform is only a
  // graceful preview fallback for browsers/devices without constrainable zoom.
  const previewZoom = nativeApplied ? 1 : zoom;
  video.style.setProperty('transform', `scale(${previewZoom})`);
  video.style.setProperty('transform-origin', '50% 50%');
  video.style.setProperty('will-change', previewZoom === 1 ? 'auto' : 'transform');
  video.style.setProperty('backface-visibility', 'hidden');
  video.style.setProperty('-webkit-backface-visibility', 'hidden');
}

export function installCreateCameraZoom() {
  if (typeof document === 'undefined') return () => undefined;

  const pointerTouches = new Map<
    number,
    { point: ClientPoint; target: EventTarget | null }
  >();
  let gesture: GestureState | null = null;
  let frame = 0;

  const beginGesture = (
    target: EventTarget | null,
    first: ClientPoint,
    second: ClientPoint,
  ) => {
    const element = target instanceof Element ? target : null;
    const video = element?.closest('video');
    if (!(video instanceof HTMLVideoElement) || !isCreateLiveCamera(video)) return false;

    const rect = video.getBoundingClientRect();
    if (!pointInside(rect, first) || !pointInside(rect, second)) return false;
    const startDistance = distance(first, second);
    if (startDistance <= 0) return false;

    gesture = { video, startDistance, startZoom: getZoom(video) };
    return true;
  };

  const updateGesture = (first: ClientPoint, second: ClientPoint) => {
    if (!gesture) return;
    const currentDistance = distance(first, second);
    if (currentDistance <= 0 || gesture.startDistance <= 0) return;
    const next = gesture.startZoom * (currentDistance / gesture.startDistance);
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      if (gesture) void applyZoom(gesture.video, next);
    });
  };

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 2) return;
    if (beginGesture(event.target, event.touches[0], event.touches[1])) {
      event.preventDefault();
    }
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!gesture || event.touches.length !== 2) return;
    event.preventDefault();
    updateGesture(event.touches[0], event.touches[1]);
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (event.touches.length < 2) gesture = null;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    pointerTouches.set(event.pointerId, {
      point: { clientX: event.clientX, clientY: event.clientY },
      target: event.target,
    });
    if (pointerTouches.size !== 2) return;
    const entries = Array.from(pointerTouches.values()).slice(0, 2);
    if (beginGesture(entries[0].target, entries[0].point, entries[1].point)) {
      event.preventDefault();
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || !pointerTouches.has(event.pointerId)) return;
    const previous = pointerTouches.get(event.pointerId);
    pointerTouches.set(event.pointerId, {
      point: { clientX: event.clientX, clientY: event.clientY },
      target: previous?.target ?? event.target,
    });
    if (!gesture || pointerTouches.size < 2) return;
    const points = Array.from(pointerTouches.values())
      .slice(0, 2)
      .map((entry) => entry.point);
    event.preventDefault();
    updateGesture(points[0], points[1]);
  };

  const onPointerEnd = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    pointerTouches.delete(event.pointerId);
    if (pointerTouches.size < 2) gesture = null;
  };

  const onWheel = (event: WheelEvent) => {
    if (!(event.target instanceof HTMLVideoElement)) return;
    const video = event.target;
    if (!isCreateLiveCamera(video)) return;
    event.preventDefault();
    const current = getZoom(video);
    const normalizedDelta =
      event.deltaY *
      (event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? window.innerHeight
          : 1);
    const delta = Math.min(0.35, Math.max(0.08, Math.abs(normalizedDelta) / 450));
    void applyZoom(video, current + (normalizedDelta < 0 ? delta : -delta));
  };

  const onNativeGesture = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    const video = target?.closest('video');
    if (video instanceof HTMLVideoElement && isCreateLiveCamera(video)) {
      event.preventDefault();
    }
  };

  if (typeof window.PointerEvent === 'function') {
    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: false });
    document.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    document.addEventListener('pointerup', onPointerEnd, { capture: true, passive: true });
    document.addEventListener('pointercancel', onPointerEnd, { capture: true, passive: true });
  } else {
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: true });
  }
  document.addEventListener('wheel', onWheel, { capture: true, passive: false });
  document.addEventListener('gesturestart', onNativeGesture as EventListener, {
    capture: true,
    passive: false,
  });
  document.addEventListener('gesturechange', onNativeGesture as EventListener, {
    capture: true,
    passive: false,
  });

  return () => {
    window.cancelAnimationFrame(frame);
    pointerTouches.clear();
    if (typeof window.PointerEvent === 'function') {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', onPointerEnd, true);
      document.removeEventListener('pointercancel', onPointerEnd, true);
    } else {
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', onTouchEnd, true);
      document.removeEventListener('touchcancel', onTouchEnd, true);
    }
    document.removeEventListener('wheel', onWheel, true);
    document.removeEventListener('gesturestart', onNativeGesture as EventListener, true);
    document.removeEventListener('gesturechange', onNativeGesture as EventListener, true);
  };
}
