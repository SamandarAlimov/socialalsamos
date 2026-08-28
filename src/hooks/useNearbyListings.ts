import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/supabaseAny';

export interface NearbyListing {
  id: string;
  title: string;
  price: number;
  currency: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  image: string | null;
  distanceM: number | null;
}

interface Center {
  latitude: number;
  longitude: number;
}

function metersBetween(a: Center, b: Center): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/**
 * Xaritadagi nuqta atrofidagi Bozor e'lonlari. Koordinatasi bo'lmagan
 * e'lonlar uchun "location" matni bo'yicha zaxira qidiruv ishlaydi.
 */
export function useNearbyListings(center?: Center | null, radiusKm = 5, fallbackQuery?: string) {
  const [listings, setListings] = useState<NearbyListing[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!center) {
      setListings([]);
      return;
    }
    setLoading(true);
    try {
      const dLat = radiusKm / 111;
      const dLng = radiusKm / (111 * Math.max(0.2, Math.cos((center.latitude * Math.PI) / 180)));

      const { data } = await db
        .from('products')
        .select('id, title, price, currency, location, latitude, longitude, images:product_images(url, position)')
        .eq('status', 'active')
        .not('latitude', 'is', null)
        .gte('latitude', center.latitude - dLat)
        .lte('latitude', center.latitude + dLat)
        .gte('longitude', center.longitude - dLng)
        .lte('longitude', center.longitude + dLng)
        .limit(30);

      let rows = data ?? [];

      if (!rows.length && fallbackQuery) {
        const { data: byText } = await db
          .from('products')
          .select('id, title, price, currency, location, latitude, longitude, images:product_images(url, position)')
          .eq('status', 'active')
          .ilike('location', '%' + fallbackQuery + '%')
          .limit(20);
        rows = byText ?? [];
      }

      const mapped: NearbyListing[] = rows.map(
        (row: {
          id: string;
          title: string;
          price: number;
          currency: string | null;
          location: string | null;
          latitude: number | null;
          longitude: number | null;
          images?: { url: string; position: number }[];
        }) => {
          const images = (row.images ?? []).slice().sort((a, b) => a.position - b.position);
          return {
            id: row.id,
            title: row.title,
            price: row.price,
            currency: row.currency ?? 'UZS',
            location: row.location,
            latitude: row.latitude,
            longitude: row.longitude,
            image: images[0]?.url ?? null,
            distanceM:
              row.latitude != null && row.longitude != null
                ? Math.round(
                    metersBetween(center, { latitude: row.latitude, longitude: row.longitude }),
                  )
                : null,
          };
        },
      );

      mapped.sort((a, b) => (a.distanceM ?? 1e9) - (b.distanceM ?? 1e9));
      setListings(mapped);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.latitude, center?.longitude, radiusKm, fallbackQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  return { listings, loading, reload: load };
}
