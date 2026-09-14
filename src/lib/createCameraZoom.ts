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

interface GestureState {
  video: HTMLVideoElement;
  startDistance: number;
  startZoom: number;
}

function clampZoom(value: number) {
  if (!Number.isFinite(value)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function distance(first: Touch, second: Touch) {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

function isCreateLiveCamera(video: HTMLVideoElement) {
  if (video.closest('[data-camera-recorder-root="true"]')) return false;
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

  if (track && typeof track.applyConstraints === 'function') {
    const capabilities = typeof track.getCapabilities === 'function'
      ? (track.getCapabilities() as MediaTrackCapabilities & ZoomCapabilities)
      : null;
    const capability = capabilities?.zoom;
    let target = zoom;

    if (capability && typeof capability === 'object') {
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

  // Native track zoom is broadcast to viewers. CSS scale is only a graceful
  // preview fallback for browsers that do not expose the constrainable zoom.
  video.style.setProperty('scale', nativeApplied ? '1' : String(zoom));
  video.style.setProperty('transform-origin', 'center center');
  video.style.setProperty('will-change', 'scale');
}

export function installCreateCameraZoom() {
  if (typeof document === 'undefined') return () => undefined;

  let gesture: GestureState | null = null;
  let frame = 0;

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 2 || !(event.target instanceof HTMLVideoElement)) return;
    const video = event.target;
    if (!isCreateLiveCamera(video)) return;
    const startDistance = distance(event.touches[0], event.touches[1]);
    if (startDistance <= 0) return;
    gesture = { video, startDistance, startZoom: getZoom(video) };
    event.preventDefault();
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!gesture || event.touches.length !== 2) return;
    const currentDistance = distance(event.touches[0], event.touches[1]);
    if (currentDistance <= 0) return;
    event.preventDefault();
    const next = gesture.startZoom * (currentDistance / gesture.startDistance);
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      if (gesture) void applyZoom(gesture.video, next);
    });
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (event.touches.length < 2) gesture = null;
  };

  const onWheel = (event: WheelEvent) => {
    if (!(event.target instanceof HTMLVideoElement)) return;
    const video = event.target;
    if (!isCreateLiveCamera(video)) return;
    event.preventDefault();
    const current = getZoom(video);
    const delta = Math.min(0.35, Math.max(0.08, Math.abs(event.deltaY) / 450));
    void applyZoom(video, current + (event.deltaY < 0 ? delta : -delta));
  };

  document.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
  document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: true });
  document.addEventListener('wheel', onWheel, { capture: true, passive: false });

  return () => {
    window.cancelAnimationFrame(frame);
    document.removeEventListener('touchstart', onTouchStart, true);
    document.removeEventListener('touchmove', onTouchMove, true);
    document.removeEventListener('touchend', onTouchEnd, true);
    document.removeEventListener('touchcancel', onTouchEnd, true);
    document.removeEventListener('wheel', onWheel, true);
  };
}
