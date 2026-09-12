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
// canonical project here as a safe migration fallback so a stale hosting env
// cannot accidentally send the web app back to the retired Lovable project.
// Hosting env values still take precedence unless they point at that retired
// project.
const CANONICAL_PROJECT_REF = 'tcykulflvagvwuygwgmu';
const RETIRED_PROJECT_REF = 'mbhjganbihamoiqmankv';
const CANONICAL_SUPABASE_URL = `https://${CANONICAL_PROJECT_REF}.supabase.co`;
const CANONICAL_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_ZfK2a0Rut0mlFYVaLpKt9g_YmX-Ppu1';

const configuredUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const configuredKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const configuredProjectId = String(import.meta.env.VITE_SUPABASE_PROJECT_ID || '').trim();

const pointsToRetiredProject =
  configuredProjectId === RETIRED_PROJECT_REF ||
  configuredUrl.includes(RETIRED_PROJECT_REF);

const SUPABASE_URL =
  !configuredUrl || pointsToRetiredProject
    ? CANONICAL_SUPABASE_URL
    : configuredUrl;

const SUPABASE_PUBLISHABLE_KEY =
  !configuredKey || pointsToRetiredProject
    ? CANONICAL_SUPABASE_PUBLISHABLE_KEY
    : configuredKey;

/**
 * Env validatsiyasi.
 *
 * Client config has a canonical fallback during the backend migration. Invalid
 * custom hosting values still fail fast so deployments do not silently point at
 * an unintended project.
 */
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

if (!/^https?:\/\//.test(supabaseUrl)) {
  const message =
    `[alsamos] VITE_SUPABASE_URL noto'g'ri formatda: "${supabaseUrl}". ` +
    `To'liq URL kerak, masalan https://<project-ref>.supabase.co`;
  console.error(message);
  throw new Error(message);
}

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
