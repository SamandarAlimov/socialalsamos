// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  cameraLensFromRecorder,
  cameraPreviewBackingSize,
  cameraPreviewNeedsCanvas,
  shouldUseIosCameraCanvasPreview,
} from './iosCameraCanvasPreview';

describe('iOS camera Canvas2D preview compatibility', () => {
  it('targets iPhone WebKit and iPad desktop user agents only', () => {
    expect(
      shouldUseIosCameraCanvasPreview(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        'iPhone',
        5,
      ),
    ).toBe(true);

    expect(
      shouldUseIosCameraCanvasPreview(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
        'MacIntel',
        5,
      ),
    ).toBe(true);

    expect(
      shouldUseIosCameraCanvasPreview(
        'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
        'Linux armv8l',
        5,
      ),
    ).toBe(false);
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

  it('uses Canvas2D for Normal only while an iOS pinch zoom is active', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="alsamos-camera-filter-scroll">
        <button aria-label="Normal filtri" aria-pressed="true"></button>
        <button aria-label="Clarendon filtri" aria-pressed="false"></button>
      </div>
    `;

    const normal = cameraLensFromRecorder(root);
    expect(normal.id).toBe('none');
    expect(cameraPreviewNeedsCanvas(normal, false)).toBe(false);
    expect(cameraPreviewNeedsCanvas(normal, true)).toBe(true);
  });

  it('neutralizes hazardous hardware video compositing before Canvas2D owns output', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/styles/create-camera-ios-canvas.css'),
      'utf8',
    );

    // First-paint filter safety must not depend on data-camera-canvas-filter.
    expect(css).toMatch(
      /\[data-camera-state='live'\]\s+video\s*\{[\s\S]*?filter:\s*none\s*!important;/,
    );
    expect(css).toMatch(
      /\[data-camera-state='live'\]\s+\[style\*='mix-blend-mode'\]\s*\{[\s\S]*?display:\s*none\s*!important;/,
    );

    // The user's remaining artifact exists only while pinch is moving. The raw
    // iOS hardware video therefore must stop receiving its changing scale during
    // that exact gesture window; Canvas2D renders the moving zoom instead.
    expect(css).toMatch(
      /\[data-camera-zoom-gesture='active'\][\s\S]*?video\s*\{[\s\S]*?transform:\s*none\s*!important;/,
    );
    expect(css).toContain('.alsamos-camera-filter-scroll');
  });

  it('does not mutate the iOS hardware video transform while pinch is moving', () => {
    const capture = readFileSync(
      resolve(process.cwd(), 'src/components/create/useCameraCapture.ts'),
      'utf8',
    );
    const rail = readFileSync(
      resolve(process.cwd(), 'src/hooks/useCameraFilterRail.ts'),
      'utf8',
    );

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
    expect(rail).toContain('finishZoomGesture();');
  });
});
