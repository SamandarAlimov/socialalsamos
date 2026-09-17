const RECOVERABLE_JWT_PATTERN = /(?:JWT\s+expired|invalid\s+JWT|\bPGRST301\b|\bPGRST303\b)/i;

let refreshInFlight: Promise<string | null> | null = null;

/** Recover only authentication-level JWT failures, never ordinary RLS failures. */
export function isExpiredSupabaseJwtResponse(status: number, bodyText: string) {
  return status === 401 && RECOVERABLE_JWT_PATTERN.test(bodyText || '');
}

export function coordinateSupabaseJwtRefresh(
  refresh: () => Promise<string | null>,
): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = Promise.resolve()
      .then(refresh)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export function isTerminalRefreshTokenError(message: string | null | undefined) {
  const value = String(message ?? '');
  return /refresh[_ -]?token/i.test(value) && /(?:invalid|expired|not found|already used|reuse)/i.test(value);
}
