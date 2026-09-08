export type MobileChromeMode = 'primary' | 'secondary' | 'immersive';

const PRIMARY_ROUTES = new Set(['/home', '/messages', '/videos', '/profile']);
const IMMERSIVE_ROUTES = new Set(['/create', '/compose']);

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

  // Marketplace has its own search/header, product header, sticky purchase CTA
  // and mobile bottom navigation. Shell chrome here caused duplicate back rows
  // and stole valuable viewport width/height on product pages.
  if (path === '/marketplace' || path.startsWith('/marketplace/')) return 'immersive';

  // Public user profile already renders its own back affordance. Rendering the
  // shell MobileBackHeader as well produced the duplicate "Orqaga / Back"
  // rows seen when a profile is opened from Videos.
  if (path.startsWith('/user/')) return 'immersive';

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
  if (path === '/projects') return '/ai';
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
