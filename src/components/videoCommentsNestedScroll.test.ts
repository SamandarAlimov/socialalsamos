import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/VideoCommentsSheet.tsx'),
  'utf8',
);

const stylesheet = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/video-comments-sheet.css'),
  'utf8',
);

describe('video comments nested scroll handoff', () => {
  it('delegates a downward edge pull from comments to the sheet in capture phase', () => {
    expect(source).toContain("closest<HTMLElement>('[data-comment-list=\"true\"]')");
    expect(source).toContain('isVideoCommentsListAtPullDismissEdge(');
    expect(source).toContain("beginMobileDrag(activationY, -1, 'comments')");
    expect(source).toContain("document.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false })");
  });

  it('translates the whole compact sheet instead of shrinking below the reference detent', () => {
    expect(source).toContain('dismissOffset > 0 ? `translate3d(0, ${Math.round(dismissOffset)}px, 0)`');
    expect(source).toContain("data-video-comments-dismiss-phase={dismissOffset > 0 ? 'true' : 'false'}");
    expect(source).toContain('shouldDismissVideoCommentsSheet(');
  });

  it('removes preview easing for either handle or comment-list drags', () => {
    expect(stylesheet).toContain("data-video-comments-sheet='true'][data-video-comments-dragging='true'");
    expect(stylesheet).toMatch(/data-video-comments-dragging[\s\S]*transition: none !important;/);
  });
});
