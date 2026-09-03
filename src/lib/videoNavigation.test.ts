import { describe, expect, it } from 'vitest';

import { shouldShowVideoDeepLinkBack } from './videoNavigation';

describe('video deep-link navigation chrome', () => {
  it('does not show a back arrow after refreshing canonical /videos?v= URL', () => {
    expect(shouldShowVideoDeepLinkBack(true, 'reload')).toBe(false);
  });

  it('keeps a back path for an in-app/direct deep link navigation', () => {
    expect(shouldShowVideoDeepLinkBack(true, 'navigate')).toBe(true);
  });

  it('does not show a back arrow on the plain videos root', () => {
    expect(shouldShowVideoDeepLinkBack(false, 'navigate')).toBe(false);
  });
});
