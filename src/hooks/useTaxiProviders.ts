import { useEffect, useState } from 'react';
import { db } from '@/lib/supabaseAny';
import {
  TAXI_PROVIDERS,
  providerFromRow,
  type TaxiProvider,
  type TaxiProviderRow,
} from '@/lib/taxiProviders';

/**
 * Taxi operatorlari Supabase'dan boshqariladi. Jadval/migratsiya hali
 * deploy qilinmagan yoki tarmoq ishlamasa built-in provayderlar fallback.
 */
export function useTaxiProviders() {
  const [providers, setProviders] = useState<TaxiProvider[]>(TAXI_PROVIDERS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await db
          .from('taxi_providers')
          .select(
            'slug, name, logo_url, deep_link, web_link, phone, base_fare, per_km, per_min, min_fare, city, position, is_active',
          )
          .eq('is_active', true)
          .order('position', { ascending: true });

        if (error) throw error;
        if (cancelled) return;

        const rows = (data ?? []) as (TaxiProviderRow & { is_active?: boolean })[];
        setProviders(rows.length ? rows.map(providerFromRow) : TAXI_PROVIDERS);
      } catch {
        if (!cancelled) setProviders(TAXI_PROVIDERS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { providers, loading };
}

export default useTaxiProviders;
