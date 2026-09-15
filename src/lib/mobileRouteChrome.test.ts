import { describe, expect, it } from 'vitest';

import { getMobileChromeMode } from './mobileRouteChrome';

describe('mobile route chrome', () => {
  it('lets Search own its mobile header instead of adding shell back chrome', () => {
    expect(getMobileChromeMode('/search')).toBe('immersive');
    expect(getMobileChromeMode('/search/')).toBe('immersive');
  });

  it('keeps established shell modes for unrelated routes', () => {
    expect(getMobileChromeMode('/home')).toBe('primary');
    expect(getMobileChromeMode('/settings')).toBe('secondary');
    expect(getMobileChromeMode('/create')).toBe('immersive');
  });
});
