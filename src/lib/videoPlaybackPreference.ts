const MUTED_KEY = 'alsamos:videos-muted';
const AUTOPLAY_KEY = 'alsamos:videos-autoplay';

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

export function readVideosAutoplayPreference(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(AUTOPLAY_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeVideosAutoplayPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTOPLAY_KEY, enabled ? '1' : '0');
  } catch {
    // Storage can be unavailable in private/embedded contexts.
  }
}
