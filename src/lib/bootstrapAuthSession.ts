import { supabase } from '@/integrations/supabase/client';
import {
  coordinateSupabaseJwtRefresh,
  isTerminalRefreshTokenError,
} from '@/lib/supabaseJwtRecovery';

const REFRESH_EARLY_MS = 60_000;
let recoveryInFlight: Promise<void> | null = null;

async function recoverAuthSession() {
  if (recoveryInFlight) return recoveryInFlight;

  recoveryInFlight = (async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('[alsamos/auth] Session recovery read failed:', error.message);
        return;
      }

      const session = data.session;
      if (!session) return;

      const expiresAtMs = (session.expires_at ?? 0) * 1000;
      if (expiresAtMs > Date.now() + REFRESH_EARLY_MS) return;

      await coordinateSupabaseJwtRefresh(async () => {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        const accessToken = refreshed.session?.access_token ?? null;
        if (!refreshError && accessToken) {
          try {
            await supabase.realtime.setAuth(accessToken);
          } catch (realtimeError) {
            console.warn('[alsamos/auth] Realtime token sync failed:', realtimeError);
          }
          return accessToken;
        }

        const message = refreshError?.message ?? 'Session refresh returned no session';
        console.warn('[alsamos/auth] Session refresh failed:', message);

        // Only an invalid refresh token is terminal. Offline/network failures must
        // not sign the user out because they can recover when connectivity returns.
        if (refreshError && isTerminalRefreshTokenError(message)) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        }

        return null;
      });
    } catch (error) {
      console.warn('[alsamos/auth] Session recovery failed:', error);
    }
  })();

  try {
    await recoveryInFlight;
  } finally {
    recoveryInFlight = null;
  }
}

/**
 * Do not mount authenticated screens with an already-expired access token.
 * Browsers may suspend refresh timers while a tab, laptop or phone sleeps;
 * when the app resumes we refresh first, then let React queries start.
 * This is platform-agnostic and applies to Android, iOS, Windows, macOS and
 * desktop/mobile browsers alike.
 */
export async function recoverAuthSessionBeforeMount() {
  await recoverAuthSession();
}

/**
 * Keep the same guarantee after the app has mounted. A sleeping phone, laptop,
 * background tab or restored browser can miss Supabase's timer, so re-check the
 * session whenever the page becomes active or connectivity returns.
 */
export function installAuthSessionResumeRecovery() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;

  const recoverWhenActive = () => {
    if (document.visibilityState === 'hidden') return;
    void recoverAuthSession();
  };
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') recoverWhenActive();
  };

  window.addEventListener('focus', recoverWhenActive, { passive: true });
  window.addEventListener('pageshow', recoverWhenActive, { passive: true });
  window.addEventListener('online', recoverWhenActive, { passive: true });
  document.addEventListener('visibilitychange', handleVisibility, { passive: true });

  return () => {
    window.removeEventListener('focus', recoverWhenActive);
    window.removeEventListener('pageshow', recoverWhenActive);
    window.removeEventListener('online', recoverWhenActive);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}
