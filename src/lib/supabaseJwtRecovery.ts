const EXPIRED_JWT_PATTERN = /(?:JWT\s+expired|"code"\s*:\s*"PGRST303"|\bPGRST303\b)/i;

/**
 * PostgREST returns HTTP 401 when an access token expires. Supabase normally
 * refreshes proactively, but browsers can miss the timer while a tab/device is
 * suspended. Detect only the explicit expired-JWT response so ordinary RLS
 * 401s are never retried as authentication failures.
 */
export function isExpiredSupabaseJwtResponse(status: number, bodyText: string) {
  return status === 401 && EXPIRED_JWT_PATTERN.test(bodyText || '');
}

/**
 * Refresh-token failures are terminal for the local session. Network failures
 * are intentionally excluded so a temporary offline period never logs a user
 * out by itself.
 */
export function isTerminalRefreshTokenError(message: string | null | undefined) {
  const value = String(message ?? '');
  return /refresh[_ -]?token/i.test(value) && /(?:invalid|expired|not found|already used|reuse)/i.test(value);
}
