// Supabase browser client.
//
// The auth session is stored per account slot (see lib/accountSlots.ts) and
// shared across *.alsamos.com. `storageKey` is set explicitly so slots can be
// enumerated and cleaned up deterministically.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { sharedSupabaseStorage } from './sharedCookieStorage';
import { AUTH_STORAGE_KEY } from '@/lib/authConstants';
import {
  coordinateSupabaseJwtRefresh,
  isExpiredSupabaseJwtResponse,
  isTerminalRefreshTokenError,
} from '@/lib/supabaseJwtRecovery';

// Client-side Supabase project configuration is public by design. Keep the
// canonical project here as a safe migration fallback so a stale or malformed
// hosting env cannot accidentally send the web app back to the retired Lovable
// project or crash the whole frontend during migration.
const CANONICAL_PROJECT_REF = 'tcykulflvagvwuygwgmu';
const RETIRED_PROJECT_REF = 'mbhjganbihamoiqmankv';
const CANONICAL_SUPABASE_URL = `https://${CANONICAL_PROJECT_REF}.supabase.co`;
const CANONICAL_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_ZfK2a0Rut0mlFYVaLpKt9g_YmX-Ppu1';

/**
 * Vercel/hosting dashboards expect only the value, but it is easy to paste a
 * whole KEY=value line into the value field. Accept both forms so one malformed
 * hosting variable cannot white-screen the app.
 */
function normalizeEnvValue(raw: unknown, acceptedKeys: string[]): string {
  let value = String(raw ?? '').trim();

  // Remove one pair of surrounding quotes first.
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }

  for (const key of acceptedKeys) {
    const prefix = `${key}=`;
    if (value.startsWith(prefix)) {
      value = value.slice(prefix.length).trim();
      break;
    }
  }

  // The pasted value may itself have been quoted: KEY="value".
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }

  return value;
}

const configuredUrl = normalizeEnvValue(import.meta.env.VITE_SUPABASE_URL, [
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
]);
const configuredKey = normalizeEnvValue(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, [
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
]);
const configuredProjectId = normalizeEnvValue(import.meta.env.VITE_SUPABASE_PROJECT_ID, [
  'VITE_SUPABASE_PROJECT_ID',
  'SUPABASE_PROJECT_ID',
]);

const pointsToRetiredProject =
  configuredProjectId === RETIRED_PROJECT_REF ||
  configuredUrl.includes(RETIRED_PROJECT_REF);

const validConfiguredUrl = /^https?:\/\//.test(configuredUrl);
const validConfiguredKey =
  configuredKey.startsWith('sb_publishable_') || configuredKey.startsWith('eyJ');

if (configuredUrl && !validConfiguredUrl) {
  console.warn(
    '[alsamos] VITE_SUPABASE_URL hosting qiymati noto\'g\'ri formatda; canonical Supabase URL ishlatiladi.',
  );
}

if (configuredKey && !validConfiguredKey) {
  console.warn(
    '[alsamos] VITE_SUPABASE_PUBLISHABLE_KEY hosting qiymati noto\'g\'ri formatda; canonical publishable key ishlatiladi.',
  );
}

const SUPABASE_URL =
  !configuredUrl || !validConfiguredUrl || pointsToRetiredProject
    ? CANONICAL_SUPABASE_URL
    : configuredUrl;

const SUPABASE_PUBLISHABLE_KEY =
  !configuredKey || !validConfiguredKey || pointsToRetiredProject
    ? CANONICAL_SUPABASE_PUBLISHABLE_KEY
    : configuredKey;

function requireValue(name: string, value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  const message = `[alsamos] Supabase sozlanmagan: ${name} qiymati yo'q yoki bo'sh.`;
  console.error(message);
  throw new Error(message);
}

const supabaseUrl = requireValue('VITE_SUPABASE_URL', SUPABASE_URL);
const supabaseKey = requireValue('VITE_SUPABASE_PUBLISHABLE_KEY', SUPABASE_PUBLISHABLE_KEY);
const supabaseOrigin = new URL(supabaseUrl).origin;

function extractBearerToken(authorization: string | null): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? '');
  return match?.[1] ?? null;
}

async function syncRealtimeAccessToken(accessToken: string) {
  try {
    await supabaseClient.realtime.setAuth(accessToken);
  } catch (realtimeError) {
    console.warn('[alsamos/auth] Realtime token sync failed:', realtimeError);
  }
}

/**
 * Resolve a usable access token after an expired-JWT response. A different
 * token may already have been produced by another recovery path while this
 * particular request was in flight; in that case reuse it instead of rotating
 * the refresh token again. Otherwise coordinate one refresh for all waiters.
 */
async function refreshExpiredAccessToken(
  failedAuthorization: string | null,
): Promise<string | null> {
  const failedAccessToken = extractBearerToken(failedAuthorization);
  const { data: currentSessionData } = await supabaseClient.auth.getSession();
  const currentAccessToken = currentSessionData.session?.access_token ?? null;

  if (
    failedAccessToken &&
    currentAccessToken &&
    currentAccessToken !== failedAccessToken
  ) {
    await syncRealtimeAccessToken(currentAccessToken);
    return currentAccessToken;
  }

  if (failedAccessToken && !currentAccessToken) {
    // The session was already cleared while this request was in flight.
    return null;
  }

  return coordinateSupabaseJwtRefresh(async () => {
    // Re-check inside the shared critical section. A refresh may have completed
    // between the getSession() above and our turn to enter this callback.
    const { data: latestSessionData } = await supabaseClient.auth.getSession();
    const latestAccessToken = latestSessionData.session?.access_token ?? null;
    if (
      failedAccessToken &&
      latestAccessToken &&
      latestAccessToken !== failedAccessToken
    ) {
      await syncRealtimeAccessToken(latestAccessToken);
      return latestAccessToken;
    }

    const { data, error } = await supabaseClient.auth.refreshSession();
    const accessToken = data.session?.access_token ?? null;

    if (!error && accessToken) {
      await syncRealtimeAccessToken(accessToken);
      return accessToken;
    }

    const message = error?.message ?? 'Session refresh returned no access token';
    console.warn('[alsamos/auth] Expired JWT refresh failed:', message);

    if (error && isTerminalRefreshTokenError(message)) {
      await supabaseClient.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }

    return null;
  });
}

/**
 * Run one protected request and transparently recover only the explicit
 * PostgREST "JWT expired" failure. Permission/RLS 401s are returned untouched.
 * A clone is kept before the first attempt so JSON RPC/mutation bodies can be
 * replayed safely after the token refresh.
 */
async function fetchWithExpiredJwtRecovery(request: Request): Promise<Response> {
  const retryTemplate = request.clone();
  const response = await fetch(request);
  if (response.status !== 401) return response;

  const bodyText = await response.clone().text().catch(() => '');
  if (!isExpiredSupabaseJwtResponse(response.status, bodyText)) return response;

  const freshAccessToken = await refreshExpiredAccessToken(
    retryTemplate.headers.get('authorization'),
  );
  if (!freshAccessToken) return response;

  const retryHeaders = new Headers(retryTemplate.headers);
  retryHeaders.set('Authorization', `Bearer ${freshAccessToken}`);

  return fetch(new Request(retryTemplate, { headers: retryHeaders }));
}

// Some client networks intermittently time out or close direct PostgREST
// connections to *.supabase.co. Keep Auth/Realtime untouched, but route
// browser /rest/v1 traffic through an external same-origin Vercel rewrite.
// The original Supabase request headers (public apikey + user JWT) are preserved,
// so PostgREST and RLS remain the authorization boundary.
const sameOriginSupabaseFetch: typeof fetch = async (input, init) => {
  if (typeof window === 'undefined') {
    return fetch(input, init);
  }

  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  let target: URL;
  try {
    target = new URL(rawUrl, window.location.origin);
  } catch {
    return fetch(input, init);
  }

  const inputIsRequest = typeof Request !== 'undefined' && input instanceof Request;
  const requestMethod = String(init?.method ?? (inputIsRequest ? input.method : 'GET')).toUpperCase();
  const requestHeaders = new Headers(inputIsRequest ? input.headers : init?.headers);

  // Account deletion must be performed server-side with the service role so the
  // Auth user and retained/profile data are handled together. Older settings UI
  // calls DELETE /profiles directly; transparently upgrade only that exact
  // self-profile deletion path instead of weakening the profiles RLS policy.
  if (
    target.origin === supabaseOrigin &&
    target.pathname === '/rest/v1/profiles' &&
    requestMethod === 'DELETE' &&
    (target.searchParams.get('id') ?? '').startsWith('eq.')
  ) {
    const authorization = requestHeaders.get('authorization');
    if (!authorization) {
      return new Response(
        JSON.stringify({ message: 'Hisobni o‘chirish uchun qaytadan kiring.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const deleteHeaders = new Headers();
    deleteHeaders.set('Authorization', authorization);
    deleteHeaders.set('apikey', requestHeaders.get('apikey') || supabaseKey);
    deleteHeaders.set('Content-Type', 'application/json');
    deleteHeaders.set('Accept', 'application/json');
    const clientInfo = requestHeaders.get('x-client-info');
    if (clientInfo) deleteHeaders.set('x-client-info', clientInfo);

    return fetchWithExpiredJwtRecovery(
      new Request(`${supabaseOrigin}/functions/v1/account-delete`, {
        method: 'POST',
        headers: deleteHeaders,
        body: JSON.stringify({ confirm: 'DELETE' }),
      }),
    ).then((response) => {
      if (response.ok) {
        return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
      }
      return response;
    });
  }

  if (target.origin !== supabaseOrigin || !target.pathname.startsWith('/rest/v1/')) {
    return fetch(input, init);
  }

  const restSuffix = target.pathname.slice('/rest/v1'.length);
  const proxyUrl = `${window.location.origin}/__supabase-rest${restSuffix}${target.search}`;

  const proxyRequest = inputIsRequest
    ? new Request(new Request(proxyUrl, input), init)
    : new Request(proxyUrl, init);

  return fetchWithExpiredJwtRecovery(proxyRequest);
};

const supabaseClient = createClient<Database>(supabaseUrl, supabaseKey, {
  global: {
    fetch: sameOriginSupabaseFetch,
  },
  auth: {
    storage: sharedSupabaseStorage,
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Browsers on some networks intermittently close direct connections to the
// Supabase Edge Functions gateway even when the function itself runs. Keep a
// persistent FunctionsClient and override only account-signup so it goes
// through Alsamos' same-origin Vercel proxy. SupabaseClient exposes `functions`
// through a getter, so patching a temporary getter result would not persist.
const functionsClient = supabaseClient.functions;
const directFunctionsInvoke = functionsClient.invoke.bind(functionsClient);
(functionsClient as any).invoke = async (functionName: string, options?: any) => {
  if (functionName !== 'account-signup' || typeof window === 'undefined') {
    return directFunctionsInvoke(functionName as any, options as any);
  }

  try {
    const response = await fetch('/api/account-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(options?.body ?? {}),
      credentials: 'same-origin',
    });

    const payload = await response.json().catch(() => null);
    if (response.ok) return { data: payload, error: null };

    const message =
      typeof payload?.message === 'string' && payload.message
        ? payload.message
        : typeof payload?.error === 'string' && payload.error
          ? payload.error
          : `Signup request failed (${response.status})`;

    const error = new Error(message) as Error & { context?: Response };
    error.context = response;
    return { data: payload, error };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error('Signup request failed');
    return { data: null, error };
  }
};

// Shadow SupabaseClient's `functions` getter with the persistent patched client.
Object.defineProperty(supabaseClient, 'functions', {
  value: functionsClient,
  configurable: true,
  enumerable: false,
});

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = supabaseClient;
