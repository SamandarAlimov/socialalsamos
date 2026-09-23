import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/PostViewModal.tsx'),
  'utf8',
);

describe('post preview responsive contract', () => {
  it('uses a page-style preview on phones/tablets and a desktop modal only at xl', () => {
    expect(source).toContain("window.matchMedia('(min-width: 1280px)')");
    expect(source).toContain("h-[100dvh] w-screen max-w-none");
    expect(source).toContain('xl:left-1/2');
    expect(source).toContain('xl:w-[min(1180px,calc(100vw-48px))]');
  });

  it('reuses the canonical premium comments and likes/views surfaces', () => {
    expect(source).toContain("import { PostLikesViewsDialog } from '@/components/PostLikesViewsDialog'");
    expect(source).toContain("import { VideoCommentsSheet } from '@/components/VideoCommentsSheet'");
    expect(source).toContain('<VideoCommentsSheet');
    expect(source).toContain('<PostLikesViewsDialog');
    expect(source).not.toContain("import { PostViewsDialog } from '@/components/PostViewsDialog'");
    expect(source).not.toContain('<PostViewsDialog');
  });
});
