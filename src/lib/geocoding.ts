/**
 * Joy qidirish va teskari geokodlash.
 *
 * Ochiq manbalardan foydalanamiz (kalit talab qilmaydi):
 *  - Photon (Komoot)  — tez avtoto'ldirish uchun asosiy
 *  - Nominatim (OSM)  — zaxira va teskari geokodlash uchun
 *
 * `VITE_GEOCODER_URL` berilsa, o'z serverimiz ishlatiladi (limitlar yo'q).
 */

export interface GeoPlace {
  /** Tashqi manba identifikatori (takrorlanmaslik uchun). */
  externalId: string;
  externalSource: 'photon' | 'nominatim' | 'custom';
  name: string;
  address?: string | null;
  category?: string | null;
  latitude: number;
  longitude: number;
  /** Foydalanuvchidan masofa (metr), agar hisoblangan bo'lsa. */
  distanceM?: number;
}

const CUSTOM_GEOCODER = String(import.meta.env.VITE_GEOCODER_URL ?? '').replace(/\/+$/, '');
const PHOTON_URL = 'https://photon.komoot.io';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

/** Ikki nuqta orasidagi masofa (metr) — Haversine. */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export function formatDistance(meters?: number): string {
  if (meters === undefined || meters === null) return '';
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

function photonFeatureToPlace(feature: any): GeoPlace | null {
  const coords = feature?.geometry?.coordinates;
  const props = feature?.properties ?? {};
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const addressParts = [props.street, props.housenumber, props.district, props.city, props.state, props.country]
    .filter(Boolean)
    .join(', ');

  return {
    externalId: String(props.osm_id ?? `${coords[1]},${coords[0]}`),
    externalSource: 'photon',
    name: props.name || props.street || props.city || 'Nomsiz joy',
    address: addressParts || null,
    category: props.osm_value || props.osm_key || null,
    latitude: Number(coords[1]),
    longitude: Number(coords[0]),
  };
}

function nominatimItemToPlace(item: any): GeoPlace | null {
  if (!item?.lat || !item?.lon) return null;
  return {
    externalId: String(item.osm_id ?? item.place_id ?? `${item.lat},${item.lon}`),
    externalSource: 'nominatim',
    name: item.name || String(item.display_name ?? '').split(',')[0] || 'Nomsiz joy',
    address: item.display_name ?? null,
    category: item.type ?? item.class ?? null,
    latitude: Number(item.lat),
    longitude: Number(item.lon),
  };
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<any> {
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Geokodlash xatosi (${response.status})`);
  return response.json();
}

/** Matn bo'yicha joy qidirish. */
export async function searchPlaces(
  query: string,
  center?: { latitude: number; longitude: number } | null,
  signal?: AbortSignal,
): Promise<GeoPlace[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const bias = center ? `&lat=${center.latitude}&lon=${center.longitude}` : '';

  try {
    const base = CUSTOM_GEOCODER || PHOTON_URL;
    const data = await fetchJson(
      `${base}/api/?q=${encodeURIComponent(term)}&limit=15${bias}`,
      signal,
    );

    const places = ((data?.features ?? []) as any[])
      .map(photonFeatureToPlace)
      .filter((place): place is GeoPlace => place !== null);

    if (places.length > 0) return withDistances(places, center);
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    console.warn('Photon ishlamadi, Nominatim sinaladi:', error);
  }

  const data = await fetchJson(
    `${NOMINATIM_URL}/search?format=jsonv2&addressdetails=1&limit=15&q=${encodeURIComponent(term)}`,
    signal,
  );

  const places = ((data ?? []) as any[])
    .map(nominatimItemToPlace)
    .filter((place): place is GeoPlace => place !== null);

  return withDistances(places, center);
}

function withDistances(
  places: GeoPlace[],
  center?: { latitude: number; longitude: number } | null,
): GeoPlace[] {
  if (!center) return places;
  return places
    .map((place) => ({
      ...place,
      distanceM: distanceMeters(center.latitude, center.longitude, place.latitude, place.longitude),
    }))
    .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
}

/** Koordinata bo'yicha manzilni aniqlash. */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<GeoPlace | null> {
  try {
    const base = CUSTOM_GEOCODER || PHOTON_URL;
    const data = await fetchJson(
      `${base}/reverse?lat=${latitude}&lon=${longitude}`,
      signal,
    );
    const first = (data?.features ?? [])[0];
    const place = first ? photonFeatureToPlace(first) : null;
    if (place) return place;
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
  }

  try {
    const data = await fetchJson(
      `${NOMINATIM_URL}/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
      signal,
    );
    return nominatimItemToPlace(data);
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    return null;
  }
}

/**
 * Atrofdagi joylar — Telegramdagi "yaqin joylar" ro'yxati analogi.
 * Photon ning `lat/lon` bias imkoniyatidan foydalanadi.
 */
export async function nearbyPlaces(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<GeoPlace[]> {
  const categories = ['restaurant', 'cafe', 'park', 'shop', 'hotel', 'school', 'mosque'];

  try {
    const base = CUSTOM_GEOCODER || PHOTON_URL;
    const results = await Promise.all(
      categories.map(async (category) => {
        try {
          const data = await fetchJson(
            `${base}/api/?q=${category}&lat=${latitude}&lon=${longitude}&limit=6`,
            signal,
          );
          return ((data?.features ?? []) as any[])
            .map(photonFeatureToPlace)
            .filter((place): place is GeoPlace => place !== null);
        } catch {
          return [];
        }
      }),
    );

    const merged = new Map<string, GeoPlace>();
    for (const place of results.flat()) {
      const key = `${place.externalSource}:${place.externalId}`;
      if (!merged.has(key)) merged.set(key, place);
    }

    const places = withDistances(Array.from(merged.values()), { latitude, longitude });
    // 25 km dan uzoq "yaqin joy" bo'lmaydi
    return places.filter((place) => (place.distanceM ?? 0) < 25000).slice(0, 24);
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    return [];
  }
}
