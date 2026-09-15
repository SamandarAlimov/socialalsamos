import { supabase } from '@/integrations/supabase/client';
import { isTerminalRefreshTokenError } from '@/lib/supabaseJwtRecovery';

const REFRESH_EARLY_MS = 60_000;

/**
 * Do not mount authenticated screens with an already-expired access token.
 * Browsers may suspend refresh timers while a tab, laptop or phone sleeps;
 * when the app resumes we refresh first, then let React queries start.
 * This is platform-agnostic and applies to Android, iOS, Windows, macOS and
 * desktop/mobile browsers alike.
 */
export async function recoverAuthSessionBeforeMount() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('[alsamos/auth] Session bootstrap read failed:', error.message);
      return;
    }

    const session = data.session;
    if (!session) return;

    const expiresAtMs = (session.expires_at ?? 0) * 1000;
    if (expiresAtMs > Date.now() + REFRESH_EARLY_MS) return;

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshed.session?.access_token) return;

    const message = refreshError?.message ?? 'Session refresh returned no session';
    console.warn('[alsamos/auth] Session bootstrap refresh failed:', message);

    // If the refresh token itself is no longer valid, keeping the stale access
    // token mounted causes every protected query to 401 and leaves the UI empty.
    // Clear only terminal token failures; transient network errors keep the
    // remembered session so Supabase can retry when connectivity returns.
    if (refreshError && isTerminalRefreshTokenError(message)) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
  } catch (error) {
    console.warn('[alsamos/auth] Session bootstrap recovery failed:', error);
  }
}
