const MUTED_KEY = 'alsamos:videos-muted';

export function readVideosMutedPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeVideosMutedPreference(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // Storage can be unavailable in private/embedded contexts.
  }
}
