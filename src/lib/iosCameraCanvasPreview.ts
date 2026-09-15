import { CAMERA_LENSES, type CameraLens } from '@/components/create/filters/CameraLensData';
import { drawCameraFrame } from '@/components/create/cameraCaptureUtils';

const RECORDER_SELECTOR = '[data-camera-recorder-root="true"]';
const FILTER_RAIL_SELECTOR = '.alsamos-camera-filter-scroll';
const FILTER_BUTTON_SELECTOR = 'button[aria-label$=" filtri"]';
const CANVAS_ATTRIBUTE = 'data-camera-processed-preview';
const HTML_COMPAT_CLASS = 'alsamos-ios-camera-canvas-preview';
const ACTIVE_ATTRIBUTE = 'data-camera-canvas-filter';
const ZOOM_GESTURE_ATTRIBUTE = 'data-camera-zoom-gesture';
const PREVIEW_MAX_LONG_EDGE = 1080;
const PREVIEW_FPS_INTERVAL = 1000 / 30;

interface PreviewController {
  root: HTMLElement;
  refresh: () => void;
  dispose: () => void;
}

export interface CameraPreviewBackingSize {
  width: number;
  height: number;
}

/**
 * All iOS browsers use WebKit. The live camera used to combine a hardware video
 * layer, CSS filter, transform and mix-blend-mode overlays. On iOS that stack can
 * be promoted into a broken compositor surface (the giant grey/black ellipse
 * seen over Story/Reel). The capture path already renders the exact same lenses
 * and zoom safely through Canvas2D, so iOS reuses that path whenever a filtered
 * preview or an in-progress pinch gesture would otherwise transform the hardware
 * video surface every frame.
 */
export function shouldUseIosCameraCanvasPreview(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
): boolean {
  const webkit = /AppleWebKit/i.test(userAgent);
  const iosDevice = /iPad|iPhone|iPod/i.test(userAgent);
  const iPadDesktopUa = platform === 'MacIntel' && maxTouchPoints > 1;
  return webkit && (iosDevice || iPadDesktopUa);
}

export function cameraPreviewBackingSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio = 1,
): CameraPreviewBackingSize {
  if (!Number.isFinite(cssWidth) || !Number.isFinite(cssHeight) || cssWidth <= 0 || cssHeight <= 0) {
    return { width: 2, height: 2 };
  }

  const density = Math.min(2, Math.max(1, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1));
  let width = Math.max(2, Math.round(cssWidth * density));
  let height = Math.max(2, Math.round(cssHeight * density));
  const longEdge = Math.max(width, height);

  if (longEdge > PREVIEW_MAX_LONG_EDGE) {
    const scale = PREVIEW_MAX_LONG_EDGE / longEdge;
    width = Math.max(2, Math.round(width * scale));
    height = Math.max(2, Math.round(height * scale));
  }

  // Video encoders and a few older WebKit canvas paths behave better with even
  // backing dimensions. The live preview does not need full device DPR quality.
  width = Math.max(2, Math.round(width / 2) * 2);
  height = Math.max(2, Math.round(height / 2) * 2);
  return { width, height };
}

export function cameraLensFromRecorder(root: ParentNode): CameraLens {
  const rail = root.querySelector<HTMLElement>(FILTER_RAIL_SELECTOR);
  if (!rail) return CAMERA_LENSES[0];

  const buttons = Array.from(
    rail.querySelectorAll<HTMLButtonElement>(FILTER_BUTTON_SELECTOR),
  );
  const activeIndex = buttons.findIndex(
    (button) => button.getAttribute('aria-pressed') === 'true',
  );

  return CAMERA_LENSES[Math.max(0, activeIndex)] ?? CAMERA_LENSES[0];
}

export function cameraPreviewNeedsCanvas(
  lens: CameraLens,
  zoomGestureActive = false,
): boolean {
  return zoomGestureActive || Boolean(lens.style || lens.overlays?.length);
}

function recorderNeedsProcessedPreview(root: HTMLElement, lens: CameraLens): boolean {
  return cameraPreviewNeedsCanvas(
    lens,
    root.dataset.cameraZoomGesture === 'active',
  );
}

function currentZoom(root: HTMLElement): number {
  const parsed = Number(root.dataset.cameraZoom || '1');
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(5, Math.max(1, parsed));
}

function sourceIsMirrored(video: HTMLVideoElement): boolean {
  // useCameraCapture owns mirror + zoom through an inline scale transform. The
  // iOS safety stylesheet can neutralize the effective transform while Canvas2D
  // owns output; the inline value is intentionally still readable here.
  const inline = video.style.transform;
  if (/scale\(\s*-/i.test(inline) || /scaleX\(\s*-/i.test(inline)) return true;
  return video.classList.contains('scale-x-[-1]');
}

function ensurePreviewCanvas(viewport: HTMLElement): HTMLCanvasElement {
  const existing = viewport.querySelector<HTMLCanvasElement>(
    `canvas[${CANVAS_ATTRIBUTE}="true"]`,
  );
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.setAttribute(CANVAS_ATTRIBUTE, 'true');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    zIndex: '2',
    width: '100%',
    height: '100%',
    display: 'none',
    pointerEvents: 'none',
    borderRadius: 'inherit',
    background: '#000',
  });
  viewport.appendChild(canvas);
  return canvas;
}

function syncBackingStore(canvas: HTMLCanvasElement, viewport: HTMLElement) {
  const rect = viewport.getBoundingClientRect();
  const next = cameraPreviewBackingSize(
    rect.width,
    rect.height,
    window.devicePixelRatio || 1,
  );
  if (canvas.width !== next.width) canvas.width = next.width;
  if (canvas.height !== next.height) canvas.height = next.height;
}

function createPreviewController(root: HTMLElement): PreviewController | null {
  let sourceVideo = root.querySelector<HTMLVideoElement>('video');
  if (!sourceVideo) return null;
  let viewport = sourceVideo.parentElement;
  if (!viewport) return null;

  let canvas = ensurePreviewCanvas(viewport);
  let context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    canvas.remove();
    return null;
  }

  let activeLens = cameraLensFromRecorder(root);
  let animationFrame = 0;
  let running = false;
  let lastDrawAt = 0;

  const stop = () => {
    running = false;
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    lastDrawAt = 0;
    canvas.style.display = 'none';
    root.removeAttribute(ACTIVE_ATTRIBUTE);
  };

  const draw = (timestamp: number) => {
    if (!running) return;

    if (
      !root.isConnected ||
      root.dataset.cameraState !== 'live' ||
      !sourceVideo.isConnected ||
      !canvas.isConnected
    ) {
      stop();
      return;
    }

    if (!recorderNeedsProcessedPreview(root, activeLens)) {
      stop();
      return;
    }

    if (
      timestamp - lastDrawAt >= PREVIEW_FPS_INTERVAL &&
      sourceVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      sourceVideo.videoWidth > 0 &&
      sourceVideo.videoHeight > 0
    ) {
      syncBackingStore(canvas, viewport);
      drawCameraFrame(
        context,
        canvas,
        sourceVideo,
        sourceIsMirrored(sourceVideo),
        activeLens,
        currentZoom(root),
      );
      canvas.style.display = 'block';
      lastDrawAt = timestamp;
    }

    animationFrame = window.requestAnimationFrame(draw);
  };

  const start = () => {
    if (running) return;
    running = true;
    root.setAttribute(ACTIVE_ATTRIBUTE, 'active');
    animationFrame = window.requestAnimationFrame(draw);
  };

  const reconnectSource = () => {
    const nextVideo = root.querySelector<HTMLVideoElement>('video');
    if (!nextVideo || nextVideo === sourceVideo) return;

    stop();
    sourceVideo = nextVideo;
    const nextViewport = sourceVideo.parentElement;
    if (!nextViewport) return;
    viewport = nextViewport;
    canvas.remove();
    canvas = ensurePreviewCanvas(viewport);
    const nextContext = canvas.getContext('2d', { alpha: false });
    if (!nextContext) return;
    context = nextContext;
  };

  const refresh = () => {
    reconnectSource();

    if (root.dataset.cameraState !== 'live') {
      stop();
      return;
    }

    activeLens = cameraLensFromRecorder(root);
    if (recorderNeedsProcessedPreview(root, activeLens)) {
      root.setAttribute(ACTIVE_ATTRIBUTE, 'active');
      start();
    } else {
      stop();
    }
  };

  const dispose = () => {
    stop();
    canvas.remove();
  };

  refresh();
  return { root, refresh, dispose };
}

export function installIosCameraCanvasPreview(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }

  if (
    !shouldUseIosCameraCanvasPreview(
      navigator.userAgent,
      navigator.platform,
      navigator.maxTouchPoints || 0,
    )
  ) {
    return () => undefined;
  }

  document.documentElement.classList.add(HTML_COMPAT_CLASS);
  const controllers = new Map<HTMLElement, PreviewController>();
  const pointerTouches = new Map<number, HTMLElement | null>();
  let scanFrame = 0;
  let activeZoomRoot: HTMLElement | null = null;

  const scan = () => {
    scanFrame = 0;
    document.querySelectorAll<HTMLElement>(RECORDER_SELECTOR).forEach((root) => {
      const existing = controllers.get(root);
      if (existing) {
        existing.refresh();
        return;
      }
      const controller = createPreviewController(root);
      if (controller) controllers.set(root, controller);
    });

    controllers.forEach((controller, root) => {
      if (!root.isConnected) {
        controller.dispose();
        controllers.delete(root);
        if (activeZoomRoot === root) activeZoomRoot = null;
      }
    });
  };

  const scheduleScan = () => {
    if (scanFrame) return;
    scanFrame = window.requestAnimationFrame(scan);
  };

  const recorderFromTarget = (target: EventTarget | null) => {
    const element = target instanceof Element ? target : null;
    return element?.closest<HTMLElement>(RECORDER_SELECTOR) ?? null;
  };

  const ensureController = (root: HTMLElement) => {
    const existing = controllers.get(root);
    if (existing) return existing;
    const controller = createPreviewController(root);
    if (controller) controllers.set(root, controller);
    return controller;
  };

  const endZoomGesture = () => {
    const root = activeZoomRoot;
    activeZoomRoot = null;
    if (!root) return;
    root.removeAttribute(ZOOM_GESTURE_ATTRIBUTE);
    controllers.get(root)?.refresh();
  };

  const beginZoomGesture = (root: HTMLElement | null) => {
    if (!root || root.dataset.cameraState !== 'live') return;
    if (activeZoomRoot && activeZoomRoot !== root) endZoomGesture();
    activeZoomRoot = root;
    root.setAttribute(ZOOM_GESTURE_ATTRIBUTE, 'active');
    ensureController(root)?.refresh();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    pointerTouches.set(event.pointerId, recorderFromTarget(event.target));
    if (pointerTouches.size < 2) return;
    const roots = Array.from(pointerTouches.values()).slice(0, 2);
    if (roots[0] && roots[0] === roots[1]) beginZoomGesture(roots[0]);
  };

  const onPointerEnd = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    pointerTouches.delete(event.pointerId);
    if (pointerTouches.size < 2) endZoomGesture();
  };

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 2) return;
    beginZoomGesture(recorderFromTarget(event.target));
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (event.touches.length < 2) endZoomGesture();
  };

  const onNativeGestureStart = (event: Event) => {
    beginZoomGesture(recorderFromTarget(event.target));
  };

  const onNativeGestureEnd = () => {
    if (pointerTouches.size < 2) endZoomGesture();
  };

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-pressed', 'data-camera-state', ZOOM_GESTURE_ATTRIBUTE],
  });
  scheduleScan();

  if (typeof window.PointerEvent === 'function') {
    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    document.addEventListener('pointerup', onPointerEnd, { capture: true, passive: true });
    document.addEventListener('pointercancel', onPointerEnd, { capture: true, passive: true });
  } else {
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: true });
  }
  document.addEventListener('gesturestart', onNativeGestureStart as EventListener, {
    capture: true,
    passive: true,
  });
  document.addEventListener('gestureend', onNativeGestureEnd as EventListener, {
    capture: true,
    passive: true,
  });

  const onResize = () => controllers.forEach((controller) => controller.refresh());
  window.addEventListener('resize', onResize, { passive: true });
  window.visualViewport?.addEventListener('resize', onResize, { passive: true });

  return () => {
    observer.disconnect();
    if (scanFrame) window.cancelAnimationFrame(scanFrame);
    if (activeZoomRoot) activeZoomRoot.removeAttribute(ZOOM_GESTURE_ATTRIBUTE);
    activeZoomRoot = null;
    pointerTouches.clear();
    controllers.forEach((controller) => controller.dispose());
    controllers.clear();
    if (typeof window.PointerEvent === 'function') {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerEnd, true);
      document.removeEventListener('pointercancel', onPointerEnd, true);
    } else {
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchend', onTouchEnd, true);
      document.removeEventListener('touchcancel', onTouchEnd, true);
    }
    document.removeEventListener('gesturestart', onNativeGestureStart as EventListener, true);
    document.removeEventListener('gestureend', onNativeGestureEnd as EventListener, true);
    window.removeEventListener('resize', onResize);
    window.visualViewport?.removeEventListener('resize', onResize);
    document.documentElement.classList.remove(HTML_COMPAT_CLASS);
  };
}
