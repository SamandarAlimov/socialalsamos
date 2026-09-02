/**
 * Koordinatadan haqiqiy manzilni oladi (OpenStreetMap Nominatim, kalitsiz).
 *
 * Foydalanuvchi "joriy joylashuv" ni yuborganda bazada faqat kenglik/uzunlik
 * saqlanadi. Postda "Joriy joylashuv" degan umumiy yozuv emas, aynan qayer
 * ekani ko'rinishi kerak — shuning uchun manzil shu yerda tiklanadi.
 *
 * Natija sessionStorage'da keshlanadi: bitta lentada bir nuqta uchun
 * takroriy so'rov yuborilmaydi.
 */

export interface ResolvedAddress {
  /** Qisqa nom: ko'cha yoki mahalla nomi. Kartaning sarlavhasi. */
  short: string;
  /** To'liq manzil. Kartaning tagidagi matn. */
  full: string;
}

const CACHE_PREFIX = 'alsamos.reverse-geocode.v1:';
const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

function cacheKey(latitude: number, longitude: number): string {
  return CACHE_PREFIX + latitude.toFixed(5) + ',' + longitude.toFixed(5);
}

function readCache(key: string): ResolvedAddress | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResolvedAddress;
    return parsed && typeof parsed.full === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: ResolvedAddress): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // xotira to'lgan bo'lishi mumkin — kesh majburiy emas
  }
}

type NominatimAddress = Record<string, unknown>;

function pick(address: NominatimAddress, keys: string[]): string | null {
  for (const key of keys) {
    const value = address[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Manzil bo'laklaridan odam o'qiydigan qatorlar yasaydi. */
function buildAddress(payload: Record<string, unknown>): ResolvedAddress | null {
  const address = (payload.address ?? {}) as NominatimAddress;
  const displayName =
    typeof payload.display_name === 'string' ? payload.display_name.trim() : '';

  const poiName =
    (typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null) ??
    pick(address, ['amenity', 'shop', 'tourism', 'leisure', 'office', 'building', 'house_name']);
  const street = pick(address, ['road', 'pedestrian', 'footway']);
  const houseNumber = pick(address, ['house_number']);
  const streetLine = street ? street + (houseNumber ? ' ' + houseNumber : '') : null;
  const area = pick(address, ['neighbourhood', 'suburb', 'city_district', 'village', 'town', 'county']);
  const city = pick(address, ['city', 'town', 'state', 'region']);
  const country = pick(address, ['country']);

  // POI mavjud bo'lsa sarlavha ko'cha emas, aynan joy nomi bo'lishi kerak:
  // masalan "Hoji Nuriddin jome masjidi".
  const short =
    poiName ??
    streetLine ??
    area ??
    city ??
    (displayName ? displayName.split(',')[0].trim() : null);

  if (!short) return null;

  const fullParts = [streetLine, area, city, country]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, all) => all.indexOf(part) === index);

  return {
    short,
    full: fullParts.length > 0 ? fullParts.join(', ') : displayName || short,
  };
}

/** Koordinatadan manzilni oladi; topilmasa `null` qaytaradi. */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<ResolvedAddress | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const key = cacheKey(latitude, longitude);
  const cached = readCache(key);
  if (cached) return cached;

  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(latitude),
    lon: String(longitude),
    zoom: '18',
    addressdetails: '1',
    'accept-language': 'uz,ru,en',
  });

  try {
    const response = await fetch(ENDPOINT + '?' + params.toString(), { signal });
    if (!response.ok) return null;

    const payload = (await response.json()) as Record<string, unknown>;
    const resolved = buildAddress(payload);
    if (resolved) writeCache(key, resolved);
    return resolved;
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') return null;
    console.error('Manzilni aniqlab bo\u2018lmadi:', error);
    return null;
  }
}

/** "Current location" kabi umumiy yorliqlar haqiqiy manzil hisoblanmaydi. */
export function isGenericLocationLabel(label: string | null | undefined): boolean {
  if (!label) return true;
  const lower = label.trim().toLowerCase();
  return (
    lower === '' ||
    lower === 'joylashuv' ||
    lower === 'joriy joylashuv' ||
    lower === 'current location' ||
    lower === 'my location' ||
    lower === 'location' ||
    lower === 'live location'
  );
}
