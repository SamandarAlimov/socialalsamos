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
 * - immersive: page owns the whole viewport (create/composer flows)
 *
 * Keeping this decision in one place prevents every page from inventing its
 * own mobile navigation rules and makes hamburger destinations consistent.
 */
export function getMobileChromeMode(pathname: string): MobileChromeMode {
  const path = normalizePath(pathname);
  if (PRIMARY_ROUTES.has(path)) return 'primary';
  if (IMMERSIVE_ROUTES.has(path)) return 'immersive';
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
