/**
 * Stable, anonymous, per-browser device id.
 *
 * It is NOT a fingerprint: it is a random value generated once and kept in
 * localStorage. The server only ever stores its SHA-256 hash, and uses it to
 * group sessions into "devices" so the user can see and revoke them.
 */

const DEVICE_ID_KEY = 'alsamos_device_id';

function randomId(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';

  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length >= 16) return existing;

    const fresh = randomId();
    window.localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    // Private mode / storage disabled: the server falls back to UA + IP.
    return '';
  }
}
