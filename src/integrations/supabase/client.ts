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

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    storage: sharedSupabaseStorage,
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
