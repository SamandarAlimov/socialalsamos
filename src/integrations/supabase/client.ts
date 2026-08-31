// Supabase browser client.
//
// The auth session is stored per account slot (see lib/accountSlots.ts) and
// shared across *.alsamos.com. `storageKey` is set explicitly so slots can be
// enumerated and cleaned up deterministically.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { sharedSupabaseStorage } from './sharedCookieStorage';
import { AUTH_STORAGE_KEY } from '@/lib/authConstants';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Env validatsiyasi.
 *
 * Ilgari bu qiymatlar tekshirilmasdan `createClient` ga berilardi. Agar
 * production build'da `VITE_SUPABASE_URL` yoki `VITE_SUPABASE_PUBLISHABLE_KEY`
 * bo'lmasa (masalan Vercel env sozlanmagan yoki build boshqa muhitda qilingan),
 * har bir so'rov "Failed to fetch" / "Invalid API key" bilan yiqilardi va
 * foydalanuvchi hamma sahifada sababsiz "yuklab bo'lmadi" xatosini ko'rardi.
 *
 * Endi sabab darhol ko'rinadi: modul yuklanishida aniq xabar bilan xato
 * tashlanadi va konsolga qanday tuzatish kerakligi yoziladi.
 */
function requireEnv(name: string, value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  const message =
    `[alsamos] Supabase sozlanmagan: ${name} env o'zgaruvchisi yo'q yoki bo'sh. ` +
    `Bu holatda ilovaning hamma sahifasi ma'lumot yuklay olmaydi. ` +
    `Lokalda .env faylga (.env.example dan ko'chirib) qo'shing, ` +
    `productionda esa hosting (Vercel) Environment Variables bo'limiga qo'shib, ` +
    `qayta deploy qiling. VITE_ bilan boshlanadigan o'zgaruvchilar faqat build ` +
    `vaqtida o'qiladi, shuning uchun env qo'shgandan keyin redeploy shart.`;

  console.error(message);
  throw new Error(message);
}

const supabaseUrl = requireEnv('VITE_SUPABASE_URL', SUPABASE_URL);
const supabaseKey = requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY', SUPABASE_PUBLISHABLE_KEY);

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
