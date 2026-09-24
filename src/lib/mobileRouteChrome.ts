export type MobileChromeMode = 'primary' | 'secondary' | 'immersive';

const PRIMARY_ROUTES = new Set(['/home', '/messages', '/videos', '/profile']);
const IMMERSIVE_ROUTES = new Set(['/create', '/compose', '/search']);

function normalizePath(pathname: string): string {
  if (!pathname) return '/';
  const clean = pathname.replace(/\/+$/, '');
  return clean || '/';
}

/**
 * Mobile app-shell contract.
 *
 * - primary: Alsamos branded header + bottom navigation
 * - secondary: compact back header, no bottom navigation
 * - immersive: page owns its own top chrome
 */
export function getMobileChromeMode(pathname: string): MobileChromeMode {
  const path = normalizePath(pathname);
  if (PRIMARY_ROUTES.has(path)) return 'primary';
  if (IMMERSIVE_ROUTES.has(path)) return 'immersive';

  // AI owns its complete workspace chrome on both chat and project surfaces.
  // The legacy /projects route is immersive too while it redirects so the
  // platform shell cannot flash around the AI workspace.
  if (path === '/ai' || path.startsWith('/ai/') || path === '/projects') {
    return 'immersive';
  }

  // Settings landing and detail pages render their own titles/back controls.
  // Adding the shell MobileBackHeader here creates the duplicate top "Orqaga"
  // row on mobile and also adds unnecessary top padding.
  if (path === '/settings' || path.startsWith('/settings/')) return 'immersive';

  // Marketplace has its own search/header, product header, sticky purchase CTA
  // and mobile bottom navigation. Shell chrome here caused duplicate back rows
  // and stole valuable viewport width/height on product pages.
  if (path === '/marketplace' || path.startsWith('/marketplace/')) return 'immersive';

  // Public profiles share the platform's compact secondary navigation instead
  // of owning a one-off inline Back row. This keeps viewed profiles visually
  // aligned with the canonical /profile surface while retaining a clear exit.
  if (path.startsWith('/user/')) return 'secondary';

  // These full-screen/detail surfaces already own a real navigation header or
  // back affordance. Letting AppLayout add a second shell back row produces the
  // same duplicate-chrome bug as the AI Projects regression.
  if (
    path === '/web' ||
    path === '/story-archive' ||
    path === '/activity' ||
    path.startsWith('/post/') ||
    path === '/stickers/moderation' ||
    path === '/mini-apps/new' ||
    (path.startsWith('/mini-apps/') && path.endsWith('/edit'))
  ) {
    return 'immersive';
  }

  return 'secondary';
}

/** Safe fallback when there is no usable browser-history entry. */
export function getMobileBackFallback(pathname: string): string {
  const path = normalizePath(pathname);

  if (path.startsWith('/settings/')) return '/settings';
  if (path.startsWith('/ads/')) return '/ads';
  if (path.startsWith('/marketplace/product/')) return '/marketplace';
  if (path.startsWith('/mini-apps/') && path !== '/mini-apps') return '/mini-apps';
  if (path.startsWith('/stickers/') && path !== '/stickers') return '/stickers';
  if (path === '/story-archive' || path === '/activity') return '/profile';
  if (path === '/ai/projects' || path === '/projects') return '/ai';
  return '/home';
}

export function isSafeInternalPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
  );
}
