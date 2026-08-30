import { describe, expect, it } from 'vitest';
import {
  getVideoNoteProgress,
  VIDEO_NOTE_CIRCLE_STYLE,
  VIDEO_NOTE_PANEL_CLASS,
  VIDEO_NOTE_PANEL_STYLE,
} from './videoNoteLayout';

describe('Telegram video-note layout regression', () => {
  it('never turns the recorder into a viewport/full-screen overlay', () => {
    const layout = [
      VIDEO_NOTE_PANEL_CLASS,
      VIDEO_NOTE_PANEL_STYLE.width,
      VIDEO_NOTE_PANEL_STYLE.maxWidth,
    ].join(' ');

    expect(layout).toContain('absolute');
    expect(layout).not.toMatch(/\bfixed\b/);
    expect(layout).not.toContain('inset-0');
    expect(layout).not.toContain('w-screen');
    expect(layout).not.toContain('h-screen');
    expect(layout).not.toContain('100vw');
    expect(layout).not.toContain('100vh');
  });

  it('keeps the panel constrained by the Messages composer width', () => {
    expect(VIDEO_NOTE_PANEL_STYLE.width).toContain('100%');
    expect(VIDEO_NOTE_PANEL_STYLE.maxWidth).toContain('100%');
  });

  it('keeps the camera/preview square so the UI can clip it as a circle', () => {
    expect(VIDEO_NOTE_CIRCLE_STYLE.aspectRatio).toBe('1 / 1');
    expect(VIDEO_NOTE_CIRCLE_STYLE.width).toContain('dvh');
    expect(VIDEO_NOTE_CIRCLE_STYLE.width).toContain('vw');
  });

  it('clamps the duration ring between zero and one', () => {
    expect(getVideoNoteProgress(-1)).toBe(0);
    expect(getVideoNoteProgress(30_000)).toBeCloseTo(0.5);
    expect(getVideoNoteProgress(60_000)).toBe(1);
    expect(getVideoNoteProgress(90_000)).toBe(1);
  });
});
