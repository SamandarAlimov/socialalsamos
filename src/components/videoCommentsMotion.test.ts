import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesheet = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/video-comments-sheet.css'),
  'utf8',
);

describe('video comments motion continuity', () => {
  it('keeps a black stage behind the moving Reel and sheet', () => {
    expect(stylesheet).toContain('box-shadow: 0 100dvh 0 100dvh #000 !important;');
  });

  it('does not ease the preview behind an actively dragged sheet', () => {
    expect(stylesheet).toContain("body:has([data-video-comments-drag-handle='true']:active) .video-comments-preview-frame");
    expect(stylesheet).toContain("body:has([data-video-comments-drag-handle='true']:active) .video-comments-preview-frame > video");
    expect(stylesheet).toMatch(/data-video-comments-drag-handle[\s\S]*transition: none !important;/);
  });
});
