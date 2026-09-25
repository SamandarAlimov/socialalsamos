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
});
