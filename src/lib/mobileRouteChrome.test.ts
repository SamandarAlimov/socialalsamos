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

  it('does not stack shell chrome over pages that already own back/header controls', () => {
    expect(getMobileChromeMode('/web')).toBe('immersive');
    expect(getMobileChromeMode('/post/abc')).toBe('immersive');
    expect(getMobileChromeMode('/post/abc/insights')).toBe('immersive');
    expect(getMobileChromeMode('/story-archive')).toBe('immersive');
    expect(getMobileChromeMode('/activity')).toBe('immersive');
    expect(getMobileChromeMode('/stickers/moderation')).toBe('immersive');
    expect(getMobileChromeMode('/mini-apps/new')).toBe('immersive');
    expect(getMobileChromeMode('/mini-apps/demo/edit')).toBe('immersive');
  });

  it('keeps established shell modes for unrelated routes', () => {
    expect(getMobileChromeMode('/home')).toBe('primary');
    expect(getMobileChromeMode('/notifications')).toBe('secondary');
    expect(getMobileChromeMode('/projects')).toBe('secondary');
    expect(getMobileChromeMode('/create')).toBe('immersive');
  });
});
