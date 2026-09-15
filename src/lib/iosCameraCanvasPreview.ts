import { CAMERA_LENSES, type CameraLens } from '@/components/create/filters/CameraLensData';
import { drawCameraFrame } from '@/components/create/cameraCaptureUtils';

const RECORDER_SELECTOR = '[data-camera-recorder-root="true"]';
const FILTER_RAIL_SELECTOR = '.alsamos-camera-filter-scroll';
const FILTER_BUTTON_SELECTOR = 'button[aria-label$=" filtri"]';
const CANVAS_ATTRIBUTE = 'data-camera-processed-preview';
const HTML_COMPAT_CLASS = 'alsamos-ios-camera-canvas-preview';
const ACTIVE_ATTRIBUTE = 'data-camera-canvas-filter';
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
 * safely through Canvas2D, so iOS reuses that path for the live filtered preview.
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

function lensNeedsProcessedPreview(lens: CameraLens): boolean {
  return Boolean(lens.style || lens.overlays?.length);
}

function currentZoom(root: HTMLElement): number {
  const parsed = Number(root.dataset.cameraZoom || '1');
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(5, Math.max(1, parsed));
}

function sourceIsMirrored(video: HTMLVideoElement): boolean {
  // useCameraCapture owns mirror + zoom through an inline scale transform. The
  // iOS safety stylesheet can neutralize the effective transform while a canvas
  // filter is active; the inline value is intentionally still readable here.
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

    if (!lensNeedsProcessedPreview(activeLens)) {
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
    if (lensNeedsProcessedPreview(activeLens)) {
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
  let scanFrame = 0;

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
      }
    });
  };

  const scheduleScan = () => {
    if (scanFrame) return;
    scanFrame = window.requestAnimationFrame(scan);
  };

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-pressed', 'data-camera-state'],
  });
  scheduleScan();

  const onResize = () => controllers.forEach((controller) => controller.refresh());
  window.addEventListener('resize', onResize, { passive: true });
  window.visualViewport?.addEventListener('resize', onResize, { passive: true });

  return () => {
    observer.disconnect();
    if (scanFrame) window.cancelAnimationFrame(scanFrame);
    controllers.forEach((controller) => controller.dispose());
    controllers.clear();
    window.removeEventListener('resize', onResize);
    window.visualViewport?.removeEventListener('resize', onResize);
    document.documentElement.classList.remove(HTML_COMPAT_CLASS);
  };
}
