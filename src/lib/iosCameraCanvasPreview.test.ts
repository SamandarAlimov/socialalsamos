// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  cameraLensFromRecorder,
  cameraPreviewBackingSize,
  cameraPreviewCapabilitiesSupported,
  cameraPreviewNeedsCanvas,
} from './iosCameraCanvasPreview';

describe('cross-browser camera Canvas2D preview compatibility', () => {
  it('is capability-driven instead of OS or user-agent driven', () => {
    expect(cameraPreviewCapabilitiesSupported(true, true)).toBe(true);
    expect(cameraPreviewCapabilitiesSupported(false, true)).toBe(false);
    expect(cameraPreviewCapabilitiesSupported(true, false)).toBe(false);
  });

  it('caps preview backing resolution and keeps even dimensions', () => {
    const size = cameraPreviewBackingSize(430, 932, 3);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(1080);
    expect(size.width % 2).toBe(0);
    expect(size.height % 2).toBe(0);
    expect(size.width).toBeGreaterThan(2);
    expect(size.height).toBeGreaterThan(2);
  });

  it('resolves the active lens from the canonical rail order', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="alsamos-camera-filter-scroll">
        <button aria-label="Normal filtri" aria-pressed="false"></button>
        <button aria-label="Clarendon filtri" aria-pressed="true"></button>
        <button aria-label="Aden filtri" aria-pressed="false"></button>
      </div>
    `;

    expect(cameraLensFromRecorder(root).id).toBe('clarendon');
  });

  it('uses Canvas2D for active pinch, digital zoom and processed lenses', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="alsamos-camera-filter-scroll">
        <button aria-label="Normal filtri" aria-pressed="true"></button>
        <button aria-label="Clarendon filtri" aria-pressed="false"></button>
      </div>
    `;

    const normal = cameraLensFromRecorder(root);
    expect(normal.id).toBe('none');
    expect(cameraPreviewNeedsCanvas(normal, false, 1)).toBe(false);
    expect(cameraPreviewNeedsCanvas(normal, true, 1)).toBe(true);
    expect(cameraPreviewNeedsCanvas(normal, false, 1.25)).toBe(true);

    const filteredRoot = document.createElement('div');
    filteredRoot.innerHTML = `
      <div class="alsamos-camera-filter-scroll">
        <button aria-label="Normal filtri" aria-pressed="false"></button>
        <button aria-label="Clarendon filtri" aria-pressed="true"></button>
      </div>
    `;
    expect(cameraPreviewNeedsCanvas(cameraLensFromRecorder(filteredRoot), false, 1)).toBe(true);
  });

  it('removes visible hardware-video compositing during processed preview and pinch', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/styles/create-camera-ios-canvas.css'),
      'utf8',
    );

    expect(css).toContain('html.alsamos-camera-canvas-preview');
    expect(css).toMatch(
      /\[data-camera-state='live'\]\s+video\s*\{[\s\S]*?filter:\s*none\s*!important;/,
    );
    expect(css).toMatch(
      /\[data-camera-canvas-filter='active'\][\s\S]*?video,[\s\S]*?opacity:\s*0\s*!important;/,
    );
    expect(css).toMatch(
      /\[data-camera-zoom-gesture='active'\][\s\S]*?video\s*\{[\s\S]*?transform:\s*none\s*!important;/,
    );
    expect(css).toContain('-webkit-mask-image: none !important');
    expect(css).toContain('border-radius: 0 !important');
  });

  it('keeps the per-gesture zoom HUD off the backdrop compositor path', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/styles/create-camera-ios-canvas.css'),
      'utf8',
    );

    expect(css).toContain("[data-camera-zoom-badge='true']");
    expect(css).toContain("[data-live-camera-zoom-badge='true']");
    expect(css).toMatch(
      /\[data-camera-zoom-badge='true'\][\s\S]*?backdrop-filter:\s*none\s*!important;/,
    );
    expect(css).toMatch(
      /\[data-camera-zoom-badge='true'\][\s\S]*?transform:\s*none\s*!important;/,
    );
    expect(css).toMatch(
      /\[data-camera-zoom-badge='true'\][\s\S]*?background:\s*#11151b\s*!important;/,
    );
    expect(css).toMatch(
      /\[data-camera-zoom-badge='true'\][\s\S]*?transition:\s*none\s*!important;/,
    );
  });

  it('removes remaining camera-chrome backdrop surfaces while the camera compatibility path is active', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/styles/create-camera-ios-canvas.css'),
      'utf8',
    );

    expect(css).toContain('.create-page .create-mode-tabs');
    expect(css).toContain('.create-page .create-page-close');
    expect(css).toContain("[class*='backdrop-blur']");
    expect(css).toMatch(/backdrop-filter:\s*none\s*!important;/);
    expect(css).toMatch(/-webkit-backdrop-filter:\s*none\s*!important;/);
  });

  it('keeps existing recorder hooks frozen while the generic canvas path owns zoom', () => {
    const capture = readFileSync(
      resolve(process.cwd(), 'src/components/create/useCameraCapture.ts'),
      'utf8',
    );
    const rail = readFileSync(
      resolve(process.cwd(), 'src/hooks/useCameraFilterRail.ts'),
      'utf8',
    );
    const preview = readFileSync(
      resolve(process.cwd(), 'src/lib/iosCameraCanvasPreview.ts'),
      'utf8',
    );

    // The legacy marker is intentionally installed globally during migration so
    // these existing guards remain effective without another hardware transform.
    expect(preview).toContain("LEGACY_HTML_COMPAT_CLASS = 'alsamos-ios-camera-canvas-preview'");
    expect(preview).toContain("HTML_COMPAT_CLASS = 'alsamos-camera-canvas-preview'");
    expect(capture).toContain(
      "document.documentElement.classList.contains('alsamos-ios-camera-canvas-preview')",
    );
    expect(capture).toContain(
      "recorderRoot?.dataset.cameraZoomGesture === 'active'",
    );
    expect(rail).toContain(
      "const ZOOM_GESTURE_ATTRIBUTE = 'data-camera-zoom-gesture'",
    );
    expect(rail).toContain(
      "document.documentElement.classList.contains('alsamos-ios-camera-canvas-preview')",
    );
    expect(rail).toContain(
      "resolved.host.setAttribute(ZOOM_GESTURE_ATTRIBUTE, 'active')",
    );
    expect(rail).toContain(
      'completed.host.removeAttribute(ZOOM_GESTURE_ATTRIBUTE)',
    );
  });
});
