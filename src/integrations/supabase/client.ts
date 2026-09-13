// Supabase browser client.
//
// The auth session is stored per account slot (see lib/accountSlots.ts) and
// shared across *.alsamos.com. `storageKey` is set explicitly so slots can be
// enumerated and cleaned up deterministically.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { sharedSupabaseStorage } from './sharedCookieStorage';
import { AUTH_STORAGE_KEY } from '@/lib/authConstants';

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

// Some client networks intermittently time out or close direct PostgREST
// connections to *.supabase.co. Keep Auth/Realtime untouched, but route
// browser /rest/v1 traffic through Alsamos' same-origin Vercel proxy. The proxy
// forwards the user's JWT and the public project key, so normal Supabase RLS
// remains the authorization boundary.
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

  if (target.origin !== supabaseOrigin || !target.pathname.startsWith('/rest/v1/')) {
    return fetch(input, init);
  }

  const proxyUrl = new URL('/api/supabase-rest', window.location.origin);
  proxyUrl.searchParams.set('path', `${target.pathname}${target.search}`);

  if (typeof Request !== 'undefined' && input instanceof Request) {
    return fetch(new Request(proxyUrl.toString(), input), init);
  }

  return fetch(proxyUrl.toString(), init);
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
