import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('contains profile location and phone editors inside narrow settings cards', () => {
    const locationPicker = readFileSync(
      resolve(process.cwd(), 'src/components/settings/LocationPicker.tsx'),
      'utf8',
    );
    const phoneEditor = readFileSync(
      resolve(process.cwd(), 'src/components/settings/ProfilePhoneEditor.tsx'),
      'utf8',
    );

    expect(locationPicker).toContain("'min-w-0 w-full max-w-full overflow-hidden space-y-2.5'");
    expect(locationPicker).toContain('grid min-w-0 w-full max-w-full grid-cols-1 gap-2');
    expect(locationPicker).toContain('min-w-0 flex-1 truncate text-sm font-medium');
    expect(phoneEditor).toContain("'min-w-0 w-full max-w-full overflow-hidden border-t");
    expect(phoneEditor).toContain('min-w-0 w-full max-w-full flex-1');
  });

  it('keeps profile editing compact and gives username a link-blue @ prefix', () => {
    const settingsPage = readFileSync(
      resolve(process.cwd(), 'src/pages/SettingsHubPage.tsx'),
      'utf8',
    );
    const locationPicker = readFileSync(
      resolve(process.cwd(), 'src/components/settings/LocationPicker.tsx'),
      'utf8',
    );
    const phoneEditor = readFileSync(
      resolve(process.cwd(), 'src/components/settings/ProfilePhoneEditor.tsx'),
      'utf8',
    );

    expect(settingsPage).toContain('text-blue-600 dark:text-blue-400">@</span>');
    expect(settingsPage).toContain('<SectionCard title="Qo‘shimcha ma’lumotlar">');
    expect(settingsPage).not.toContain('Profilingizni ishonchli va to‘liq ko‘rsatadigan qo‘shimcha ma’lumotlar.');
    expect(locationPicker).not.toContain('Joriy joylashuv shart emas');
    expect(locationPicker).not.toContain('Alsamos Xarita ma’lumotlari');
    expect(phoneEditor).not.toContain('Raqam o‘zgartirilsa, avvalgi tasdiqlash holati bekor qilinadi.');
  });

  it('lets the complete AI workspace own its chrome', () => {
    expect(getMobileChromeMode('/ai')).toBe('immersive');
    expect(getMobileChromeMode('/ai/')).toBe('immersive');
    expect(getMobileChromeMode('/ai/projects')).toBe('immersive');
    expect(getMobileChromeMode('/projects')).toBe('immersive');
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
    expect(getMobileChromeMode('/create')).toBe('immersive');
  });
});
