import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Create camera shutter/filter rail safety', () => {
  it('overrides the legacy rectangular center mask so lens bubbles stay circular', () => {
    const routeCss = readFileSync(
      resolve(process.cwd(), 'src/styles/create-instagram-fixes.css'),
      'utf8',
    );
    const safetyCss = readFileSync(
      resolve(process.cwd(), 'src/styles/create-camera-shutter-safe.css'),
      'utf8',
    );

    // The route stylesheet still documents the old protected-center implementation.
    // The global safety layer must win even when that route chunk is loaded later.
    expect(routeCss).toMatch(
      /\.alsamos-camera-filter-scroll\s*\{[\s\S]*?mask-image:\s*linear-gradient\(/,
    );
    expect(safetyCss).toMatch(
      /\[data-camera-recorder-root='true'\]\s+\.alsamos-camera-filter-scroll\s*\{[\s\S]*?-webkit-mask-image:\s*none\s*!important;[\s\S]*?mask-image:\s*none\s*!important;/,
    );
  });

  it('uses the centered selected lens itself as the photo shutter preview', () => {
    const safetyCss = readFileSync(
      resolve(process.cwd(), 'src/styles/create-camera-shutter-safe.css'),
      'utf8',
    );
    const recorder = readFileSync(
      resolve(process.cwd(), 'src/components/create/CameraVideoRecorder.tsx'),
      'utf8',
    );

    // The real lens bubbles render below the z-20 shutter overlay. Photo capture
    // must keep both the button body and its 54px center transparent so the exact
    // selected bubble remains visible through the ring instead of a duplicate
    // filtered surface or a hard-coded white disk.
    expect(recorder).toContain('alsamos-camera-filter-scroll absolute inset-0 z-10');
    expect(recorder).toContain('pointer-events-none absolute inset-0 z-20');
    expect(safetyCss).toMatch(
      /button\[aria-label='Rasmga olish'\]\s*\{[\s\S]*?background:\s*transparent\s*!important;/,
    );
    expect(safetyCss).toMatch(
      /button\[aria-label='Rasmga olish'\][\s\S]*?>\s*span\s*\{[\s\S]*?background-color:\s*transparent\s*!important;/,
    );
    expect(safetyCss).not.toContain('background-color: #fff !important');
  });
});
