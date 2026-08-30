/**
 * Xarita uchun HAQIQIY joy qidiruv dvigateli.
 *
 * Nima uchun kerak edi:
 *  - Eski `searchPlaces` faqat Photon'ning `q=` erkin matn qidiruvidan
 *    foydalanardi. Shu sababli:
 *      1) "Restoranlar", "Zaprovka", "Parkovka" kabi FILTRLAR ishlamasdi -
 *         chunki kategoriya nomi shunchaki matn sifatida yuborilardi.
 *      2) "Rahimjon ota masjidi" kabi mahalliy nomlar topilmasdi - Photon
 *         o'zbekcha nomlarni, apostrof variantlarini (o', o\u2018, o\u02bb) va
 *         so'z tartibini tushunmaydi, natijalar esa O'zbekiston bilan
 *         cheklanmagan edi.
 *
 * Yechim: kategoriya bo'yicha qidiruv OpenStreetMap Overpass API orqali
 * (haqiqiy POI teglari), nom bo'yicha qidiruv esa 3 manbadan parallel:
 *  - Overpass `name~"...",i` (mahalliy nomlar uchun eng kuchli)
 *  - Nominatim (countrycodes=uz, viewbox bias)
 *  - Photon (tez avtoto'ldirish)
 * Natijalar birlashtirilib, nom mosligi + masofa bo'yicha saralanadi.
 */

import { distanceMeters } from './geocoding';

export type PlaceCategoryId =
  | 'restaurant'
  | 'cafe'
  | 'fast_food'
  | 'bakery'
  | 'fuel'
  | 'parking'
  | 'pharmacy'
  | 'hospital'
  | 'atm'
  | 'bank'
  | 'market'
  | 'supermarket'
  | 'mosque'
  | 'hotel'
  | 'school'
  | 'gym'
  | 'car_wash'
  | 'bus_stop';

export interface PlaceCategory {
  id: PlaceCategoryId;
  /** Foydalanuvchiga ko'rinadigan nom (o'zbekcha). */
  label: string;
  emoji: string;
  /** Overpass teg filtrlari, masalan `amenity=restaurant`. */
  filters: string[];
  /** Qidiruv matnidan kategoriyani aniqlash uchun kalit so'zlar. */
  keywords: string[];
}

/** Xaritadagi filtr tugmalari - Yandex/Google Mapsdagidek. */
export const PLACE_CATEGORIES: PlaceCategory[] = [
  {
    id: 'restaurant',
    label: 'Restoranlar',
    emoji: '\ud83c\udf7d\ufe0f',
    filters: ['amenity=restaurant'],
    keywords: ['restoran', 'restaurant', 'ресторан', 'ovqat', 'milliy taom'],
  },
  {
    id: 'cafe',
    label: 'Kafe / Kofe',
    emoji: '\u2615',
    filters: ['amenity=cafe', 'shop=coffee', 'cuisine=coffee_shop'],
    keywords: ['kafe', 'kofe', 'qahva', 'cafe', 'coffee', 'coffee shop', 'кафе', 'кофе'],
  },
  {
    id: 'fast_food',
    label: 'Fast food',
    emoji: '\ud83c\udf54',
    filters: ['amenity=fast_food'],
    keywords: ['fast food', 'lavash', 'burger', 'pizza', 'pitsa', 'fastfud'],
  },
  {
    id: 'bakery',
    label: 'Nonvoyxona',
    emoji: '\ud83e\udd50',
    filters: ['shop=bakery'],
    keywords: ['non', 'nonvoy', 'bakery', 'tandir', 'выпечка'],
  },
  {
    id: 'fuel',
    label: 'Zaprovka',
    emoji: '\u26fd',
    filters: ['amenity=fuel', 'amenity=charging_station'],
    keywords: [
      'zaprovka',
      'zapravka',
      'yoqilgi',
      "yoqilg'i",
      'benzin',
      'metan',
      'propan',
      'gaz',
      'fuel',
      'заправка',
      'азс',
    ],
  },
  {
    id: 'parking',
    label: 'Parkovka',
    emoji: '\ud83c\udd7f\ufe0f',
    filters: ['amenity=parking', 'amenity=parking_entrance'],
    keywords: ['parkovka', 'parking', 'toxtash', "to'xtash", 'парковка', 'stoyanka'],
  },
  {
    id: 'pharmacy',
    label: 'Dorixona',
    emoji: '\ud83d\udc8a',
    filters: ['amenity=pharmacy'],
    keywords: ['dorixona', 'apteka', 'pharmacy', 'аптека', 'dori'],
  },
  {
    id: 'hospital',
    label: 'Shifoxona',
    emoji: '\ud83c\udfe5',
    filters: ['amenity=hospital', 'amenity=clinic', 'amenity=doctors'],
    keywords: ['shifoxona', 'klinika', 'poliklinika', 'hospital', 'больница', 'tibbiyot'],
  },
  {
    id: 'atm',
    label: 'Bankomat',
    emoji: '\ud83c\udfe7',
    filters: ['amenity=atm'],
    keywords: ['bankomat', 'atm', 'банкомат', 'naqd pul'],
  },
  {
    id: 'bank',
    label: 'Banklar',
    emoji: '\ud83c\udfe6',
    filters: ['amenity=bank'],
    keywords: ['bank', 'банк', 'filial'],
  },
  {
    id: 'market',
    label: 'Bozor',
    emoji: '\ud83e\uded1',
    filters: ['amenity=marketplace'],
    keywords: ['bozor', 'market', 'рынок', 'dehqon bozori'],
  },
  {
    id: 'supermarket',
    label: "Do'kon",
    emoji: '\ud83d\uded2',
    filters: ['shop=supermarket', 'shop=convenience', 'shop=greengrocer'],
    keywords: ['dokon', "do'kon", 'magazin', 'supermarket', 'shop', 'магазин'],
  },
  {
    id: 'mosque',
    label: 'Masjidlar',
    emoji: '\ud83d\udd4c',
    filters: ['amenity=place_of_worship&religion=muslim', 'building=mosque'],
    keywords: ['masjid', 'masjidi', 'mosque', 'мечеть', 'jome', 'juma masjidi', 'namoz'],
  },
  {
    id: 'hotel',
    label: 'Mehmonxona',
    emoji: '\ud83c\udfe8',
    filters: ['tourism=hotel', 'tourism=guest_house', 'tourism=hostel'],
    keywords: ['mehmonxona', 'hotel', 'hostel', 'гостиница', 'otel'],
  },
  {
    id: 'school',
    label: 'Maktab',
    emoji: '\ud83c\udfeb',
    filters: ['amenity=school', 'amenity=kindergarten', 'amenity=university'],
    keywords: ['maktab', 'school', 'bogcha', "bog'cha", 'universitet', 'школа', 'litsey'],
  },
  {
    id: 'gym',
    label: 'Sport zali',
    emoji: '\ud83c\udfcb\ufe0f',
    filters: ['leisure=fitness_centre', 'leisure=sports_centre'],
    keywords: ['sport', 'gym', 'fitnes', 'fitness', 'спортзал'],
  },
  {
    id: 'car_wash',
    label: 'Moyka',
    emoji: '\ud83e\uddfd',
    filters: ['amenity=car_wash'],
    keywords: ['moyka', 'car wash', 'avtomoyka', 'мойка'],
  },
  {
    id: 'bus_stop',
    label: 'Bekatlar',
    emoji: '\ud83d\ude8f',
    filters: ['highway=bus_stop', 'public_transport=platform', 'amenity=bus_station'],
    keywords: ['bekat', 'avtobus', 'bus', 'остановка', 'stansiya', 'metro'],
  },
];

export function findCategory(id?: string | null): PlaceCategory | undefined {
  if (!id) return undefined;
  return PLACE_CATEGORIES.find((category) => category.id === id);
}

export interface MapPlace {
  id: string;
  source: 'overpass' | 'nominatim' | 'photon';
  name: string;
  categoryId?: PlaceCategoryId;
  categoryLabel?: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  openingHours?: string | null;
  brand?: string | null;
  cuisine?: string | null;
  wheelchair?: string | null;
  distanceM?: number;
  /** Xom OSM teglari - batafsil kartada ishlatiladi. */
  tags?: Record<string, string>;
  /** Nom mosligi bahosi (ichki saralash uchun). */
  score?: number;
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/** O'zbekiston chegaralari (south, west, north, east) - qidiruvni cheklash uchun. */
export const UZ_BBOX = { south: 37.1, west: 55.9, north: 45.7, east: 73.2 };

const overpassCache = new Map<string, { at: number; data: unknown }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

type SearchResult = { places: MapPlace[]; category?: PlaceCategory };
const mapSearchCache = new Map<string, { at: number; data: SearchResult }>();
const SEARCH_CACHE_TTL_MS = 3 * 60 * 1000;
const SEARCH_CACHE_MAX = 80;


/**
 * Public geocoder/Overpass endpointlari ba'zan TCP/fetch darajasida javobsiz
 * qoladi. Oddiy AbortController faqat query o'zgarganda ishlardi, shu sabab UI
 * loading holatida cheksiz qolib ketishi mumkin edi.
 */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 6500,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const parentSignal = init.signal;

  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (parentSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (timedOut) throw new Error('Map provider timeout');
    throw error;
  } finally {
    window.clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

function searchCacheKey(
  query: string,
  center?: { latitude: number; longitude: number } | null,
): string {
  const location = center
    ? center.latitude.toFixed(2) + ',' + center.longitude.toFixed(2)
    : 'uz';
  return normalizeQuery(query) + '@' + location;
}

function readSearchCache(key: string): SearchResult | null {
  const hit = mapSearchCache.get(key);
  if (!hit || Date.now() - hit.at > SEARCH_CACHE_TTL_MS) {
    if (hit) mapSearchCache.delete(key);
    return null;
  }
  return hit.data;
}

function writeSearchCache(key: string, data: SearchResult): void {
  if (mapSearchCache.size >= SEARCH_CACHE_MAX) {
    const oldestKey = mapSearchCache.keys().next().value as string | undefined;
    if (oldestKey) mapSearchCache.delete(oldestKey);
  }
  mapSearchCache.set(key, { at: Date.now(), data });
}

async function overpass(
  query: string,
  signal?: AbortSignal,
  totalBudgetMs = 8000,
): Promise<any> {
  const cached = overpassCache.get(query);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  let lastError: unknown = null;
  const startedAt = Date.now();
  for (const endpoint of OVERPASS_ENDPOINTS) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const remaining = totalBudgetMs - (Date.now() - startedAt);
    if (remaining <= 0) break;

    try {
      const response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
          signal,
        },
        Math.min(4000, remaining),
      );
      if (!response.ok) throw new Error('Overpass ' + response.status);
      const data = await response.json();
      overpassCache.set(query, { at: Date.now(), data });
      return data;
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error('Overpass javob bermadi');
}

/** OSM elementidan koordinata olish (node -> lat/lon, way/relation -> center). */
function elementLatLng(element: any): { lat: number; lon: number } | null {
  if (typeof element?.lat === 'number' && typeof element?.lon === 'number') {
    return { lat: element.lat, lon: element.lon };
  }
  if (element?.center && typeof element.center.lat === 'number') {
    return { lat: element.center.lat, lon: element.center.lon };
  }
  return null;
}

function addressFromTags(tags: Record<string, string>): string | null {
  const parts = [
    tags['addr:street'],
    tags['addr:housenumber'],
    tags['addr:city'] || tags['addr:place'],
    tags['addr:district'],
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function filterParts(filter: string): [string, string][] {
  return filter
    .split('&')
    .map((part) => {
      const splitAt = part.indexOf('=');
      return splitAt > 0
        ? [part.slice(0, splitAt), part.slice(splitAt + 1)]
        : ['', ''];
    })
    .filter(([key, value]) => Boolean(key && value));
}

function categoryFromTags(tags: Record<string, string>): PlaceCategory | undefined {
  for (const category of PLACE_CATEGORIES) {
    for (const filter of category.filters) {
      const parts = filterParts(filter);
      if (parts.length && parts.every(([key, value]) => tags[key] === value)) return category;
    }
  }
  return undefined;
}

function elementToPlace(element: any): MapPlace | null {
  const position = elementLatLng(element);
  if (!position) return null;
  const tags: Record<string, string> = element.tags ?? {};
  const category = categoryFromTags(tags);
  const name =
    tags.name ||
    tags['name:uz'] ||
    tags['name:ru'] ||
    tags['name:en'] ||
    tags.brand ||
    tags.operator ||
    category?.label ||
    'Nomsiz joy';

  return {
    id: element.type + '/' + element.id,
    source: 'overpass',
    name,
    categoryId: category?.id,
    categoryLabel: category?.label,
    latitude: position.lat,
    longitude: position.lon,
    address: addressFromTags(tags),
    phone: tags.phone || tags['contact:phone'] || null,
    website: tags.website || tags['contact:website'] || null,
    openingHours: tags.opening_hours || null,
    brand: tags.brand || tags.operator || null,
    cuisine: tags.cuisine || null,
    wheelchair: tags.wheelchair || null,
    tags,
  };
}

function withDistance(
  places: MapPlace[],
  center?: { latitude: number; longitude: number } | null,
): MapPlace[] {
  if (!center) return places;
  return places.map((place) => ({
    ...place,
    distanceM: distanceMeters(center.latitude, center.longitude, place.latitude, place.longitude),
  }));
}

/**
 * Kategoriya bo'yicha atrofdagi joylar (FILTRLAR shu funksiya ustida ishlaydi).
 * `radiusM` - qidiruv radiusi, default 4 km; kerak bo'lsa avtomatik kengaytiriladi.
 */
export async function fetchPlacesByCategory(
  categoryId: PlaceCategoryId,
  center: { latitude: number; longitude: number },
  options?: { radiusM?: number; limit?: number; signal?: AbortSignal },
): Promise<MapPlace[]> {
  const category = findCategory(categoryId);
  if (!category) return [];

  const limit = options?.limit ?? 60;
  const radii = options?.radiusM ? [options.radiusM] : [15000];

  for (const radius of radii) {
    const body = category.filters
      .map((filter) => {
        const selector = filterParts(filter)
          .map(([key, value]) => '["' + key + '"="' + value + '"]')
          .join('');
        return (
          'nwr' +
          selector +
          '(around:' +
          radius +
          ',' +
          center.latitude +
          ',' +
          center.longitude +
          ');'
        );
      })
      .join('\n');

    const query =
      '[out:json][timeout:25];\n(\n' + body + '\n);\nout tags center ' + limit + ';';

    const data = await overpass(query, options?.signal);
    const places = ((data?.elements ?? []) as any[])
      .map(elementToPlace)
      .filter((place): place is MapPlace => place !== null)
      .map((place) => ({
        ...place,
        categoryId: place.categoryId ?? category.id,
        categoryLabel: place.categoryLabel ?? category.label,
      }));

    if (places.length > 0) {
      return withDistance(places, center).sort(
        (a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0),
      );
    }
  }

  return [];
}

/** Apostrof/harf variantlarini bir xillashtirish: o\u2018zbek -> o'zbek. */
export function normalizeQuery(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bb\u02bc\u0060\u00b4]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * O'zbekcha/ruscha/inglizcha OSM nomlarida tez-tez uchraydigan yozuv
 * variantlari. Masalan "Rahimjon ota masjidi" OSMda "Rahimjan-Ata Friday
 * Mosque" bo'lishi mumkin. Qidiruv hech qachon faqat bitta transliteratsiyaga
 * bog'lanib qolmasligi kerak.
 */
function queryTokenVariants(token: string): string[] {
  const t = normalizeQuery(token);
  const variants = new Set<string>([t]);

  if (t.includes('jon')) variants.add(t.replace(/jon/g, 'jan'));
  if (t.includes('jan')) variants.add(t.replace(/jan/g, 'jon'));
  if (t === 'ota') variants.add('ata');
  if (t === 'ata') variants.add('ota');
  if (t.startsWith('masjid')) {
    variants.add('mosque');
    variants.add('masjid');
  }
  if (t === 'juma' || t === 'jome') variants.add('friday');

  return Array.from(variants).filter(Boolean);
}

function searchQueryVariants(value: string): string[] {
  const base = normalizeQuery(value);
  const rawTokens = base.split(/\s+/).filter(Boolean);
  const variants = new Set<string>([base]);

  // Bitta-bitta eng ko'p uchraydigan transliteratsiya almashtirishlar.
  rawTokens.forEach((token, index) => {
    for (const variant of queryTokenVariants(token)) {
      if (variant === token) continue;
      const copy = rawTokens.slice();
      copy[index] = variant;
      variants.add(copy.join(' '));
    }
  });

  // Keng tarqalgan diniy nomlash: "... ota masjidi" -> "... ata mosque".
  variants.add(
    rawTokens
      .map((token) => {
        if (token === 'ota') return 'ata';
        if (token.startsWith('masjid')) return 'mosque';
        if (token === 'juma' || token === 'jome') return 'friday';
        if (token.includes('jon')) return token.replace(/jon/g, 'jan');
        return token;
      })
      .join(' '),
  );

  return Array.from(variants).filter((item) => item.length >= 2).slice(0, 8);
}

/** Qidiruv matni kategoriya nomiga o'xshasa - kategoriya qidiruviga o'tamiz. */
export function detectCategoryFromQuery(query: string): PlaceCategory | undefined {
  const normalized = normalizeQuery(query);
  if (!normalized) return undefined;
  return PLACE_CATEGORIES.find((category) =>
    category.keywords.some((keyword) => {
      const key = normalizeQuery(keyword);
      return normalized === key || normalized.includes(key);
    }),
  );
}

function tokens(value: string): string[] {
  return normalizeQuery(value)
    .split(/[^\p{L}\p{N}']+/u)
    .filter((token) => token.length >= 3);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Nom bo'yicha Overpass qidiruvi - mahalliy nomlar uchun eng ishonchli usul. */
async function searchByNameOverpass(
  query: string,
  center?: { latitude: number; longitude: number } | null,
  signal?: AbortSignal,
): Promise<MapPlace[]> {
  const parts = tokens(query);
  if (!parts.length) return [];

  // Eng uzun (eng ajralib turuvchi) so'zni regexga olamiz, qolganlari bilan baholaymiz.
  const primary = parts.slice().sort((a, b) => b.length - a.length)[0];
  const pattern = queryTokenVariants(primary).map(escapeRegex).join('|');

  const area = center
    ? '(around:60000,' + center.latitude + ',' + center.longitude + ')'
    : '(' + UZ_BBOX.south + ',' + UZ_BBOX.west + ',' + UZ_BBOX.north + ',' + UZ_BBOX.east + ')';

  const query1 =
    '[out:json][timeout:25];\n(\n' +
    'nwr["name"~"' + pattern + '",i]' + area + ';\n' +
    'nwr["name:uz"~"' + pattern + '",i]' + area + ';\n' +
    'nwr["name:ru"~"' + pattern + '",i]' + area + ';\n' +
    'nwr["alt_name"~"' + pattern + '",i]' + area + ';\n' +
    ');\nout tags center 60;';

  const data = await overpass(query1, signal, 4200);
  return ((data?.elements ?? []) as any[])
    .map(elementToPlace)
    .filter((place): place is MapPlace => place !== null);
}

/** Nominatim - O'zbekiston bilan cheklangan zaxira qidiruv. */
async function searchByNominatim(
  query: string,
  center?: { latitude: number; longitude: number } | null,
  signal?: AbortSignal,
): Promise<MapPlace[]> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    limit: '20',
    countrycodes: 'uz',
    'accept-language': 'uz,ru,en',
    q: query,
  });
  if (center) {
    const d = 1.2;
    params.set(
      'viewbox',
      [
        center.longitude - d,
        center.latitude + d,
        center.longitude + d,
        center.latitude - d,
      ].join(','),
    );
  }

  const response = await fetchWithTimeout(
    'https://nominatim.openstreetmap.org/search?' + params.toString(),
    { signal, headers: { Accept: 'application/json' } },
    5500,
  );
  if (!response.ok) return [];
  const data = await response.json();

  return ((data ?? []) as any[])
    .map((item): MapPlace | null => {
      if (!item?.lat || !item?.lon) return null;
      return {
        id: 'nominatim/' + (item.osm_type ?? 'x') + '/' + (item.osm_id ?? item.place_id),
        source: 'nominatim',
        name: item.name || String(item.display_name ?? '').split(',')[0] || 'Nomsiz joy',
        latitude: Number(item.lat),
        longitude: Number(item.lon),
        address: item.display_name ?? null,
        categoryLabel: item.type ?? null,
      };
    })
    .filter((place): place is MapPlace => place !== null);
}

/** Photon - tez avtoto'ldirish uchun. */
async function searchByPhoton(
  query: string,
  center?: { latitude: number; longitude: number } | null,
  signal?: AbortSignal,
): Promise<MapPlace[]> {
  const params = new URLSearchParams({ q: query, limit: '15', lang: 'default' });
  if (center) {
    params.set('lat', String(center.latitude));
    params.set('lon', String(center.longitude));
  }
  const response = await fetchWithTimeout(
    'https://photon.komoot.io/api/?' + params.toString(),
    {
      signal,
      headers: { Accept: 'application/json' },
    },
    5000,
  );
  if (!response.ok) return [];
  const data = await response.json();

  return ((data?.features ?? []) as any[])
    .map((feature): MapPlace | null => {
      const coords = feature?.geometry?.coordinates;
      const props = feature?.properties ?? {};
      if (!Array.isArray(coords) || coords.length < 2) return null;
      return {
        id: 'photon/' + (props.osm_id ?? coords.join(',')),
        source: 'photon',
        name: props.name || props.street || props.city || 'Nomsiz joy',
        latitude: Number(coords[1]),
        longitude: Number(coords[0]),
        address:
          [props.street, props.housenumber, props.city, props.state, props.country]
            .filter(Boolean)
            .join(', ') || null,
        categoryLabel: props.osm_value || props.osm_key || null,
      };
    })
    .filter((place): place is MapPlace => place !== null);
}

function editDistance(a: string, b: string): number {
  const left = normalizeQuery(a);
  const right = normalizeQuery(b);
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    // Map search tokens are short. If a row is already far away, continuing
    // adds CPU but will never become a useful typo match.
    if (rowMin > 4 && Math.abs(left.length - right.length) > 2) return rowMin;
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function tokenSimilarity(queryToken: string, candidateToken: string): number {
  const variants = queryTokenVariants(queryToken);
  let best = 0;
  for (const variant of variants) {
    if (candidateToken === variant) return 1;
    if (candidateToken.startsWith(variant) || variant.startsWith(candidateToken)) {
      best = Math.max(best, 0.88);
      continue;
    }
    if (candidateToken.includes(variant) || variant.includes(candidateToken)) {
      best = Math.max(best, 0.78);
      continue;
    }
    const maxLength = Math.max(variant.length, candidateToken.length);
    if (maxLength < 4) continue;
    const distance = editDistance(variant, candidateToken);
    const similarity = 1 - distance / maxLength;
    if (distance <= 2 || similarity >= 0.72) best = Math.max(best, similarity * 0.82);
  }
  return best;
}

export function searchCategorySuggestions(query: string, limit = 5): PlaceCategory[] {
  const normalized = normalizeQuery(query);
  if (normalized.length < 2) return [];
  const queryTokens = normalized.split(/\s+/).filter(Boolean);

  return PLACE_CATEGORIES
    .map((category) => {
      const candidates = [category.label, ...category.keywords]
        .flatMap((value) => normalizeQuery(value).split(/\s+/))
        .filter(Boolean);
      let score = 0;
      for (const queryToken of queryTokens) {
        let tokenBest = 0;
        for (const candidate of candidates) {
          tokenBest = Math.max(tokenBest, tokenSimilarity(queryToken, candidate));
        }
        score += tokenBest;
      }
      score /= Math.max(1, queryTokens.length);
      if (normalizeQuery(category.label).includes(normalized)) score += 0.25;
      if (category.keywords.some((keyword) => normalizeQuery(keyword) === normalized)) score += 0.4;
      return { category, score };
    })
    .filter((item) => item.score >= 0.48)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.category);
}

function scorePlace(place: MapPlace, queryTokens: string[]): number {
  const name = normalizeQuery(place.name);
  const address = normalizeQuery(place.address ?? '');
  const nameTokens = name.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  const addressTokens = address.split(/[^\p{L}\p{N}']+/u).filter(Boolean);

  let tokenScore = 0;
  for (const token of queryTokens) {
    let bestName = 0;
    let bestAddress = 0;
    for (const candidate of nameTokens) {
      bestName = Math.max(bestName, tokenSimilarity(token, candidate));
    }
    for (const candidate of addressTokens) {
      bestAddress = Math.max(bestAddress, tokenSimilarity(token, candidate) * 0.55);
    }
    tokenScore += Math.max(bestName, bestAddress);
  }

  const ratio = queryTokens.length ? tokenScore / queryTokens.length : 0;
  const phrase = normalizeQuery(queryTokens.join(' '));
  const exactPhrase = name === phrase ? 0.55 : name.startsWith(phrase) ? 0.32 : name.includes(phrase) ? 0.2 : 0;
  const sourceBonus = place.source === 'overpass' ? 0.06 : place.source === 'nominatim' ? 0.03 : 0;

  // Local intent is strong on maps: within 2 km gets a noticeable boost, while
  // far-away weak matches should not outrank a good nearby result.
  const distanceKm = (place.distanceM ?? 0) / 1000;
  const localBonus =
    distanceKm <= 2 ? 0.16 :
    distanceKm <= 8 ? 0.1 :
    distanceKm <= 25 ? 0.04 :
    0;
  const distancePenalty = Math.min(distanceKm, 100) / 1400;

  return ratio + exactPhrase + sourceBonus + localBonus - distancePenalty;
}

/**
 * Aqlli qidiruv: "Rahimjon ota masjidi", "zaprovka", "kofe", "Alisher Navoiy 1A"
 * kabi so'rovlarni bir joyda hal qiladi.
 */
export async function searchMapPlaces(
  query: string,
  center?: { latitude: number; longitude: number } | null,
  signal?: AbortSignal,
): Promise<{ places: MapPlace[]; category?: PlaceCategory }> {
  const term = query.trim();
  if (term.length < 2) return { places: [] };

  // 1) Kategoriya so'rovi bo'lsa (masalan "zaprovka") - to'g'ridan-to'g'ri POI filtri.
  const category = detectCategoryFromQuery(term);
  const queryTokens = tokens(term);
  const isPureCategory =
    !!category &&
    queryTokens.length <= 2 &&
    category.keywords.some((keyword) => normalizeQuery(keyword) === normalizeQuery(term));

  const cacheKey = searchCacheKey(term, center);
  const cached = readSearchCache(cacheKey);
  if (cached) return cached;

  if (category && center && isPureCategory) {
    const places = await fetchPlacesByCategory(category.id, center, { signal });
    const result = { places, category };
    writeSearchCache(cacheKey, result);
    return result;
  }


  // 2) Nom bo'yicha qidiruv. Productionda har bir tugma bosishda 7-8 ta
  // geocoder so'rovi yubormaymiz: avval uchta asosiy manba bir martadan.
  const variants = searchQueryVariants(term);
  const settled = await Promise.allSettled([
    searchByNameOverpass(term, center, signal),
    searchByNominatim(term, center, signal),
    searchByPhoton(term, center, signal),
  ]);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const merged = new Map<string, MapPlace>();
  const mergeSettled = (results: PromiseSettledResult<MapPlace[]>[]) => {
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const place of result.value) {
        const key =
          normalizeQuery(place.name) +
          '@' +
          place.latitude.toFixed(4) +
          ',' +
          place.longitude.toFixed(4);
        const existing = merged.get(key);
        // Overpass natijasi teglari boyroq - uni ustun qo'yamiz.
        if (!existing || (existing.source !== 'overpass' && place.source === 'overpass')) {
          merged.set(key, place);
        }
      }
    }
  };
  mergeSettled(settled);

  // Transliteratsiya sabab asosiy qidiruv juda kam natija bersagina Photon
  // alias fallback ishlaydi. Nominatim bir term uchun bir martadan ortiq
  // chaqirilmaydi — public geocoderga ortiqcha yuk tushirmaymiz.
  if (merged.size < 3) {
    const aliases = variants
      .filter((variant) => normalizeQuery(variant) !== normalizeQuery(term))
      .slice(0, 2);
    if (aliases.length) {
      const fallback = await Promise.allSettled(
        aliases.map((variant) => searchByPhoton(variant, center, signal)),
      );
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      mergeSettled(fallback);
    }
  }

  let places = withDistance(Array.from(merged.values()), center);

  // 3) Kategoriya so'zi ham bo'lsa ("masjidi") - shu turdagi joylarni yuqoriga chiqaramiz.
  places = places
    .map((place) => ({ ...place, score: scorePlace(place, queryTokens) }))
    .sort((a, b) => {
      const categoryBonus = (place: MapPlace) =>
        category && place.categoryId === category.id ? 0.35 : 0;
      return (
        (b.score ?? 0) + categoryBonus(b) - ((a.score ?? 0) + categoryBonus(a))
      );
    })
    .slice(0, 40);

  // 4) Hech narsa topilmasa va kategoriya sezilsa - atrofdagi shu turdagi joylar.
  if (places.length === 0 && category && center) {
    const fallback = await fetchPlacesByCategory(category.id, center, { signal });
    const result = { places: fallback, category };
    writeSearchCache(cacheKey, result);
    return result;
  }

  const result = { places, category };
  writeSearchCache(cacheKey, result);
  return result;
}

/** Ochiq/yopiq holatini `opening_hours` dan taxminiy aniqlash. */
export function isProbablyOpen(openingHours?: string | null): boolean | null {
  if (!openingHours) return null;
  const value = openingHours.toLowerCase();
  if (value.includes('24/7')) return true;
  const match = value.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const from = Number(match[1]) * 60 + Number(match[2]);
  const to = Number(match[3]) * 60 + Number(match[4]);
  if (to <= from) return minutes >= from || minutes <= to;
  return minutes >= from && minutes <= to;
}
