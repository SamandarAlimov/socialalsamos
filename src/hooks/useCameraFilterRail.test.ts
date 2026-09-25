import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Create camera filter rail geometry', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/hooks/useCameraFilterRail.ts'),
    'utf8',
  );

  it('derives side runway from the actual rail and button size', () => {
    expect(source).toContain('const railWidth = rail.clientWidth');
    expect(source).toContain('const buttonWidth = firstButton?.offsetWidth ?? 0');
    expect(source).toContain('const sidePadding = Math.max(0, (railWidth - buttonWidth) / 2)');
    expect(source).not.toContain("compactViewport ? '112px' : '100px'");
  });

  it('centers filters with rail-local scroll geometry instead of scrollIntoView', () => {
    expect(source).toContain(
      'button.offsetLeft + button.offsetWidth / 2 - rail.clientWidth / 2',
    );
    expect(source).toContain('rail.scrollWidth - rail.clientWidth');
    expect(source).not.toContain(
      "active.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' })",
    );
  });

  it('recalculates centering when the rail resizes and when a filter is selected', () => {
    expect(source).toContain("new ResizeObserver(() => queueLayoutSync())");
    expect(source).toContain("rail.addEventListener('click', onFilterClick)");
    expect(source).toContain("centerFilterButton(rail, button, 'smooth')");
  });
});
