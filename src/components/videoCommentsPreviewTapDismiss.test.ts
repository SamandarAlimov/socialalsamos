import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isVideoCommentsPreviewTap } from '@/lib/videoCommentsPreviewTapDismiss';

const installerSource = readFileSync(
  fileURLToPath(new URL('../lib/videoCommentsPreviewTapDismiss.ts', import.meta.url)),
  'utf8',
);

describe('mobile Reel comments preview tap dismissal', () => {
  it('accepts a short stationary tap', () => {
    expect(isVideoCommentsPreviewTap({
      startX: 120,
      startY: 180,
      endX: 126,
      endY: 184,
      durationMs: 180,
    })).toBe(true);
  });

  it('does not dismiss for a drag or long press', () => {
    expect(isVideoCommentsPreviewTap({
      startX: 120,
      startY: 180,
      endX: 160,
      endY: 230,
      durationMs: 220,
    })).toBe(false);
    expect(isVideoCommentsPreviewTap({
      startX: 120,
      startY: 180,
      endX: 121,
      endY: 181,
      durationMs: 900,
    })).toBe(false);
  });

  it('captures pointer playback gestures before React and closes through Radix', () => {
    expect(installerSource).toContain("document.addEventListener('pointerdown', onPointerDown, true)");
    expect(installerSource).toContain("document.addEventListener('pointerup', onPointerUp, true)");
    expect(installerSource).toContain("document.addEventListener('click', onClick, true)");
    expect(installerSource).toContain('event.stopImmediatePropagation()');
    expect(installerSource).toContain("sheet.classList.add('video-comments-preview-tap-closing')");
    expect(installerSource).toContain("key: 'Escape'");
  });
});
