import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./VideoCommentsSheet.tsx', import.meta.url)),
  'utf8',
);

describe('mobile Reel comments preview tap dismissal', () => {
  it('intercepts preview clicks before the underlying Reel play/pause handler', () => {
    expect(source).toContain("surface.frame.addEventListener('click', dismissFromPreview, true)");
    expect(source).toContain('event.preventDefault()');
    expect(source).toContain('event.stopPropagation()');
    expect(source).toContain('event.stopImmediatePropagation()');
  });

  it('uses the same animated sheet dismissal path as a downward drag', () => {
    expect(source).toContain('animateDismissAndClose(dismissOffsetRef.current)');
    expect(source).toContain("surface.frame.removeEventListener('click', dismissFromPreview, true)");
  });
});
