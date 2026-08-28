import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * `src/integrations/supabase/types.ts` avtomatik generatsiya qilinadi va yangi
 * jadvallar (polls, post_media, hashtags, ...) unga hali kirmagan.
 *
 * Shu sababli yangi jadvallar bilan ishlashda `db` dan foydalanamiz — mavjud
 * kodning tip xavfsizligi buzilmaydi, faqat yangi jadvallar `any` bo'ladi.
 * Types qayta generatsiya qilingandan keyin bu fayl olib tashlanadi.
 */
export const db = supabase as unknown as SupabaseClient<any, 'public', any>;

export type DbClient = typeof db;
