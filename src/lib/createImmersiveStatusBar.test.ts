import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Create immersive status bar', () => {
  it('opts the document into safe-area edge-to-edge rendering', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('apple-mobile-web-app-status-bar-style" content="black-translucent"');
    expect(html).toContain("root.hasAttribute('data-alsamos-immersive-status')");
    expect(html).toContain("attributeFilter: ['class', 'data-alsamos-immersive-status']");
  });

  it('detects every Create camera/media surface without OS sniffing', () => {
    const controller = readFileSync(
      resolve(process.cwd(), 'src/lib/createImmersiveStatusBar.ts'),
      'utf8',
    );
    const main = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');

    expect(controller).toContain('.create-page--immersive');
    expect(controller).toContain("[data-camera-recorder-root='true']");
    expect(controller).toContain(".create-mode-stage[data-create-mode='live']");
    expect(controller).not.toMatch(/navigator\.userAgent|iPhone|iPad|Android/);
    expect(main).toContain('installCreateImmersiveStatusBar();');
  });

  it('keeps a dark backing surface when transparent system chrome is unavailable', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/styles/create-camera-mobile-polish.css'),
      'utf8',
    );

    expect(css).toMatch(
      /html\[data-alsamos-immersive-status\][\s\S]*?#root\s*\{[\s\S]*?background:\s*#000\s*!important;/,
    );
  });
});
