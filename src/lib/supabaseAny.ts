import { supabase } from '@/integrations/supabase/client';

/**
 * Yangi jadvallar (saved_places, place_visits, place_reviews, taxi_providers)
 * hali generated Supabase tiplari ichida yo'q. Tiplar yangilanmaguncha
 * tiplanmagan klient orqali ishlaymiz.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;

export default db;
