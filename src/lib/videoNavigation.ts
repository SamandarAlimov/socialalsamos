export type BrowserNavigationType =
  | 'navigate'
  | 'reload'
  | 'back_forward'
  | 'prerender'
  | 'unknown';

export function getBrowserNavigationType(): BrowserNavigationType {
  if (typeof performance === 'undefined') return 'unknown';

  try {
    const entry = performance.getEntriesByType(
      'navigation',
    )[0] as PerformanceNavigationTiming | undefined;

    if (
      entry?.type === 'navigate' ||
      entry?.type === 'reload' ||
      entry?.type === 'back_forward' ||
      entry?.type === 'prerender'
    ) {
      return entry.type;
    }
  } catch {
    // Older/embedded browsers may not expose PerformanceNavigationTiming.
  }

  return 'unknown';
}

/**
 * A video query param alone is not enough to render a back arrow: the Videos
 * feed itself keeps ?v=<id> in the canonical URL. After a hard refresh that
 * same canonical URL must behave like a page root, not like an in-app deep
 * link.
 */
export function shouldShowVideoDeepLinkBack(
  hasInitialVideoParam: boolean,
  navigationType: BrowserNavigationType,
): boolean {
  return hasInitialVideoParam && navigationType !== 'reload';
}
