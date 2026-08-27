/**
 * Normalizes a user-provided website value into a safe absolute URL.
 * "alsamos.com" -> "https://alsamos.com"
 * "http://x.com" -> unchanged
 */
export function toExternalUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return 'https://' + trimmed;
}

/** Strips the protocol prefix for display purposes. */
export function stripProtocol(value?: string | null): string {
  if (!value) return '';
  return value.replace(/^https?:\/\//i, '');
}
