const PHOTON_URL = 'https://photon.komoot.io/api/';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
];

const memoryCache = new Map<string, { at: number; data: unknown }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 250;

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function cacheGet(key: string): unknown | null {
  const cached = memoryCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.at > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return cached.data;
}

function cacheSet(key: string, data: unknown) {
  if (memoryCache.size >= CACHE_MAX) {
    const oldest = memoryCache.keys().next().value as string | undefined;
    if (oldest) memoryCache.delete(oldest);
  }
  memoryCache.set(key, { at: Date.now(), data });
}

async function fetchJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = 2600,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AlsamosMap/1.0 (+https://alsamos.com)',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) throw new Error('upstream ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function finiteCoordinate(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

async function photonSearch(query: string, lat: number | null, lng: number | null) {
  const params = new URLSearchParams({
    q: query,
    limit: '20',
    lang: 'default',
  });
  if (lat != null && lng != null) {
    params.set('lat', String(lat));
    params.set('lon', String(lng));
  }
  return fetchJson(PHOTON_URL + '?' + params.toString(), {}, 2200);
}

async function nominatimSearch(
  query: string,
  lat: number | null,
  lng: number | null,
) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    limit: '20',
    countrycodes: 'uz',
    'accept-language': 'uz,ru,en',
    q: query,
  });

  if (lat != null && lng != null) {
    const d = 1.2;
    params.set(
      'viewbox',
      [lng - d, lat + d, lng + d, lat - d].join(','),
    );
  }

  return fetchJson(
    NOMINATIM_URL + '/search?' + params.toString(),
    {},
    2600,
  );
}

function normalizeOsmType(value: unknown): 'node' | 'way' | 'relation' | null {
  const type = String(value ?? '').toLowerCase();
  if (type === 'node' || type === 'n') return 'node';
  if (type === 'way' || type === 'w') return 'way';
  if (type === 'relation' || type === 'r') return 'relation';
  return null;
}

function canonicalOsmId(type: unknown, id: unknown): string | null {
  const osmType = normalizeOsmType(type);
  const osmId = String(id ?? '').trim();
  if (!osmType || !/^\d+$/.test(osmId)) return null;
  return 'osm:' + osmType + ':' + osmId;
}

function normalizedName(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bb\u02bc\u0060\u00b4]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNominatimResults(data: unknown): any[] {
  if (!Array.isArray(data)) return [];

  return data.flatMap((item: any) => {
    const latitude = Number(item?.lat);
    const longitude = Number(item?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

    const namedetails =
      item.namedetails && typeof item.namedetails === 'object'
        ? item.namedetails
        : {};
    const extras =
      item.extratags && typeof item.extratags === 'object'
        ? item.extratags
        : {};
    const name =
      namedetails.name ||
      namedetails['name:uz'] ||
      namedetails['name:ru'] ||
      namedetails['name:en'] ||
      item.name ||
      String(item.display_name ?? '').split(',')[0] ||
      'Nomsiz joy';

    return [
      {
        source: 'nominatim',
        id:
          'nominatim/' +
          String(item.osm_type ?? 'x') +
          '/' +
          String(item.osm_id ?? item.place_id ?? latitude + ',' + longitude),
        canonicalId:
          canonicalOsmId(item.osm_type, item.osm_id) ??
          null,
        name,
        latitude,
        longitude,
        address: item.display_name ?? null,
        rawKey: typeof item.category === 'string' ? item.category : null,
        rawValue: typeof item.type === 'string' ? item.type : null,
        extras,
      },
    ];
  });
}

function normalizePhotonResults(data: unknown): any[] {
  const features =
    data && typeof data === 'object' && Array.isArray((data as any).features)
      ? (data as any).features
      : [];

  return features.flatMap((feature: any) => {
    const coords = feature?.geometry?.coordinates;
    const props = feature?.properties ?? {};
    if (!Array.isArray(coords) || coords.length < 2) return [];

    const latitude = Number(coords[1]);
    const longitude = Number(coords[0]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

    return [
      {
        source: 'photon',
        id: 'photon/' + String(props.osm_id ?? coords.join(',')),
        canonicalId:
          canonicalOsmId(props.osm_type, props.osm_id) ??
          null,
        name: props.name || props.street || props.city || 'Nomsiz joy',
        latitude,
        longitude,
        address:
          [props.street, props.housenumber, props.city, props.state, props.country]
            .filter(Boolean)
            .join(', ') || null,
        rawKey: typeof props.osm_key === 'string' ? props.osm_key : null,
        rawValue: typeof props.osm_value === 'string' ? props.osm_value : null,
        extras: {},
      },
    ];
  });
}

function mergeUnifiedPlaces(items: any[]): any[] {
  const merged = new Map<string, any>();

  for (const item of items) {
    const key =
      item.canonicalId ||
      normalizedName(item.name) +
        '@' +
        Number(item.latitude).toFixed(4) +
        ',' +
        Number(item.longitude).toFixed(4);

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, item);
      continue;
    }

    const existingRichness =
      Number(Boolean(existing.address)) +
      Object.keys(existing.extras ?? {}).length +
      Number(existing.source === 'nominatim');
    const nextRichness =
      Number(Boolean(item.address)) +
      Object.keys(item.extras ?? {}).length +
      Number(item.source === 'nominatim');

    if (nextRichness > existingRichness) {
      merged.set(key, {
        ...existing,
        ...item,
        canonicalId: item.canonicalId || existing.canonicalId || null,
      });
    }
  }

  return Array.from(merged.values()).slice(0, 45);
}

async function unifiedSearch(
  query: string,
  variants: string[],
  lat: number | null,
  lng: number | null,
) {
  const terms = Array.from(
    new Set(
      [query, ...variants]
        .map((value) => value.trim())
        .filter((value) => value.length >= 2),
    ),
  ).slice(0, 5);

  const requests: Promise<{ source: string; data: unknown }>[] = [];
  for (const term of terms.slice(0, 4)) {
    requests.push(
      photonSearch(term, lat, lng).then((data) => ({
        source: 'photon',
        data,
      })),
    );
  }
  for (const term of terms.slice(0, 2)) {
    requests.push(
      nominatimSearch(term, lat, lng).then((data) => ({
        source: 'nominatim',
        data,
      })),
    );
  }

  const settled = await Promise.allSettled(requests);
  const normalized: any[] = [];
  let healthyProviders = 0;

  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    healthyProviders += 1;
    if (result.value.source === 'photon') {
      normalized.push(...normalizePhotonResults(result.value.data));
    } else {
      normalized.push(...normalizeNominatimResults(result.value.data));
    }
  }

  if (!healthyProviders) throw new Error('all search providers unavailable');

  return {
    places: mergeUnifiedPlaces(normalized),
    terms,
    healthyProviders,
  };
}

async function reverseSearch(lat: number, lng: number) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    zoom: '18',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    'accept-language': 'uz,ru,en',
  });

  return fetchJson(
    NOMINATIM_URL + '/reverse?' + params.toString(),
    {},
    2400,
  );
}

async function overpass(query: string): Promise<unknown> {
  const cacheKey = 'overpass:' + query;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const request = async (endpoint: string) =>
    fetchJson(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: 'data=' + encodeURIComponent(query),
      },
      3600,
    );

  let data: unknown;
  try {
    data = await Promise.any(
      OVERPASS_ENDPOINTS.slice(0, 2).map((endpoint) => request(endpoint)),
    );
  } catch {
    data = await request(OVERPASS_ENDPOINTS[2]);
  }

  cacheSet(cacheKey, data);
  return data;
}

export default async function handler(req: any, res: any) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    if (req.method === 'POST') {
      const action = String(req.query?.action ?? req.body?.action ?? '');
      if (action !== 'overpass') {
        res.status(400).json({ error: 'unsupported action' });
        return;
      }

      const query = String(req.body?.query ?? '');
      if (!query || query.length > 50_000) {
        res.status(400).json({ error: 'invalid query' });
        return;
      }

      const data = await overpass(query);
      res.setHeader('Cache-Control', 'private, max-age=30');
      res.status(200).json(data);
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method not allowed' });
      return;
    }

    const action = String(req.query?.action ?? '');
    const lat = finiteCoordinate(req.query?.lat, -90, 90);
    const lng = finiteCoordinate(req.query?.lng, -180, 180);

    if (action === 'reverse') {
      if (lat == null || lng == null) {
        res.status(400).json({ error: 'invalid coordinates' });
        return;
      }
      const key = 'reverse:' + lat.toFixed(5) + ',' + lng.toFixed(5);
      const cached = cacheGet(key);
      const data = cached ?? (await reverseSearch(lat, lng));
      if (!cached) cacheSet(key, data);
      res.setHeader(
        'Cache-Control',
        'public, s-maxage=300, stale-while-revalidate=900',
      );
      res.status(200).json(data);
      return;
    }

    const query = String(req.query?.q ?? '').trim();
    if (query.length < 2 || query.length > 180) {
      res.status(400).json({ error: 'invalid query' });
      return;
    }

    const variants = String(req.query?.variants ?? '')
      .split('|')
      .map((value) => value.trim())
      .filter((value) => value.length >= 2)
      .slice(0, 5);

    const key =
      action +
      ':' +
      query.toLowerCase() +
      ':' +
      variants.join('|').toLowerCase() +
      ':' +
      (lat?.toFixed(2) ?? '') +
      ':' +
      (lng?.toFixed(2) ?? '');
    const cached = cacheGet(key);
    if (cached) {
      res.setHeader(
        'Cache-Control',
        'public, s-maxage=300, stale-while-revalidate=900',
      );
      res.status(200).json(cached);
      return;
    }

    let data: unknown;
    if (action === 'search') {
      data = await unifiedSearch(query, variants, lat, lng);
    } else if (action === 'photon') {
      data = await photonSearch(query, lat, lng);
    } else if (action === 'nominatim') {
      data = await nominatimSearch(query, lat, lng);
    } else {
      res.status(400).json({ error: 'unsupported action' });
      return;
    }

    cacheSet(key, data);
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=900',
    );
    res.status(200).json(data);
  } catch (error) {
    res.status(502).json({
      error: 'map upstream unavailable',
      detail: error instanceof Error ? error.message : 'unknown',
    });
  }
}
