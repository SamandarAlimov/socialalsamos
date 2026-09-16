import { describe, expect, it } from 'vitest';

import { getMobileChromeMode } from './mobileRouteChrome';

describe('mobile route chrome', () => {
  it('lets Search own its mobile header instead of adding shell back chrome', () => {
    expect(getMobileChromeMode('/search')).toBe('immersive');
    expect(getMobileChromeMode('/search/')).toBe('immersive');
  });

  it('lets every Settings page own its mobile header', () => {
    expect(getMobileChromeMode('/settings')).toBe('immersive');
    expect(getMobileChromeMode('/settings/')).toBe('immersive');
    expect(getMobileChromeMode('/settings/profile')).toBe('immersive');
    expect(getMobileChromeMode('/settings/privacy')).toBe('immersive');
    expect(getMobileChromeMode('/settings/devices')).toBe('immersive');
  });

  it('keeps established shell modes for unrelated routes', () => {
    expect(getMobileChromeMode('/home')).toBe('primary');
    expect(getMobileChromeMode('/notifications')).toBe('secondary');
    expect(getMobileChromeMode('/create')).toBe('immersive');
  });
});
