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

    const key =
      action +
      ':' +
      query.toLowerCase() +
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
    if (action === 'photon') {
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
