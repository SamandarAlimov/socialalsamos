const NOTIFICATION_RETURN_BRIDGE_PARAM = '__alsamosNotificationReturn';
const NOTIFICATION_RETURN_BRIDGE_VALUE = 'post-preview';

function isSafeInternalPath(value: string) {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}

/**
 * Notification -> post preview -> notification uses two pushed history entries:
 * one for the preview and one for the explicit `returnTo` navigation.  Mark the
 * return URL so the shell can collapse those transient entries after the preview
 * closes and restore the original Notifications history entry.
 */
export function withNotificationReturnBridge(returnTo: string): string {
  if (!isSafeInternalPath(returnTo)) return returnTo;

  const hashIndex = returnTo.indexOf('#');
  const hash = hashIndex >= 0 ? returnTo.slice(hashIndex) : '';
  const pathAndSearch = hashIndex >= 0 ? returnTo.slice(0, hashIndex) : returnTo;
  const queryIndex = pathAndSearch.indexOf('?');
  const pathname = queryIndex >= 0 ? pathAndSearch.slice(0, queryIndex) : pathAndSearch;
  const search = queryIndex >= 0 ? pathAndSearch.slice(queryIndex + 1) : '';
  const params = new URLSearchParams(search);
  params.set(NOTIFICATION_RETURN_BRIDGE_PARAM, NOTIFICATION_RETURN_BRIDGE_VALUE);

  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
}

export function isNotificationReturnBridge(pathname: string, search: string): boolean {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  if (normalizedPath !== '/notifications') return false;

  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get(NOTIFICATION_RETURN_BRIDGE_PARAM) === NOTIFICATION_RETURN_BRIDGE_VALUE;
}

export function stripNotificationReturnBridge(
  pathname: string,
  search: string,
  hash = '',
): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.delete(NOTIFICATION_RETURN_BRIDGE_PARAM);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
}

/**
 * On the bridged Notifications entry the original Notifications entry is two
 * history slots behind: original notifications -> post preview -> bridged return.
 */
export function notificationReturnHistoryDelta(historyIndex: unknown): -2 | null {
  const index = Number(historyIndex);
  return Number.isFinite(index) && index >= 2 ? -2 : null;
}
