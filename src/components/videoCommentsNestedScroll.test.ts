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
  it('hands a downward pull to the sheet only after the comment list reaches scrollTop zero', () => {
    expect(source).toContain("querySelector<HTMLElement>('[data-comment-list=\"true\"]')");
    expect(source).toContain('commentList.scrollTop > COMMENT_SCROLL_EPSILON');
    expect(source).toContain("beginMobileDrag(activationY, -1, 'comments')");
    expect(source).toContain("commentList.addEventListener('touchmove', handleTouchMove, { passive: false })");
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
