// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  cameraLensFromRecorder,
  cameraPreviewBackingSize,
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

  it('neutralizes hardware video filters and blend overlays before the observer activates Canvas2D', () => {
    const css = readFileSync(
      new URL('../styles/create-camera-ios-canvas.css', import.meta.url),
      'utf8',
    );

    // The first-paint rules must not depend on data-camera-canvas-filter=active.
    // Otherwise React can expose one hazardous filtered hardware-video frame to
    // WebKit before the MutationObserver installs the Canvas2D preview.
    expect(css).toMatch(
      /\[data-camera-state='live'\]\s+video\s*\{[\s\S]*?filter:\s*none\s*!important;/,
    );
    expect(css).toMatch(
      /\[data-camera-state='live'\]\s+\[style\*='mix-blend-mode'\]\s*\{[\s\S]*?display:\s*none\s*!important;/,
    );
    expect(css).toContain('.alsamos-camera-filter-scroll');
  });
});
