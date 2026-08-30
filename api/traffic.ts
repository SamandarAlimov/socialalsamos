type TrafficProviderId = 'tomtom-orbis' | 'template';

type TrafficProviderConfig = {
  id: TrafficProviderId;
  label: string;
  attribution: string;
  minZoom: number;
  maxZoom: number;
  refreshSeconds: number;
  tileUrl: (input: {
    z: number;
    x: number;
    y: number;
    style: 'light' | 'dark';
  }) => string;
  headers: Record<string, string>;
};

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function env(name: string): string {
  return String(process.env[name] ?? '').trim();
}

function safeHeadersFromJson(raw: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => [key, String(value)]),
    );
  } catch {
    return {};
  }
}

function providerConfig(): TrafficProviderConfig | null {
  const explicitProvider = env('TRAFFIC_PROVIDER').toLowerCase();
  const tomtomKey =
    env('TOMTOM_TRAFFIC_API_KEY') ||
    env('TRAFFIC_TOMTOM_API_KEY');

  if (
    explicitProvider === 'tomtom' ||
    explicitProvider === 'tomtom-orbis' ||
    (!explicitProvider && tomtomKey)
  ) {
    if (!tomtomKey) return null;
    return {
      id: 'tomtom-orbis',
      label: 'TomTom Traffic',
      attribution: 'Traffic data © TomTom',
      minZoom: 0,
      maxZoom: 22,
      refreshSeconds: 60,
      tileUrl: ({ z, x, y, style }) =>
        'https://api.tomtom.com/maps/orbis/traffic/flow/raster/tile/' +
        z +
        '/' +
        x +
        '/' +
        y +
        '?apiVersion=2&style=' +
        style +
        '&tileSize=256',
      headers: {
        'TomTom-Api-Key': tomtomKey,
        Accept: 'image/png,image/*;q=0.9,*/*;q=0.8',
      },
    };
  }

  const template = env('TRAFFIC_TILE_URL_TEMPLATE');
  if (
    explicitProvider === 'template' ||
    (!explicitProvider && template)
  ) {
    if (!template || !/^https:\/\//i.test(template)) return null;
    const label = env('TRAFFIC_PROVIDER_NAME') || 'Traffic provider';
    const attribution =
      env('TRAFFIC_ATTRIBUTION') || 'Traffic data provider';
    const minZoom = Math.max(0, Number(env('TRAFFIC_MIN_ZOOM') || 0));
    const maxZoom = Math.min(
      22,
      Math.max(minZoom, Number(env('TRAFFIC_MAX_ZOOM') || 22)),
    );
    const refreshSeconds = Math.max(
      15,
      Number(env('TRAFFIC_REFRESH_SECONDS') || 60),
    );
    const headers = safeHeadersFromJson(
      env('TRAFFIC_TILE_HEADERS_JSON'),
    );

    return {
      id: 'template',
      label,
      attribution,
      minZoom,
      maxZoom,
      refreshSeconds,
      tileUrl: ({ z, x, y, style }) =>
        template
          .replaceAll('{z}', String(z))
          .replaceAll('{x}', String(x))
          .replaceAll('{y}', String(y))
          .replaceAll('{style}', style),
      headers,
    };
  }

  return null;
}

function validTileCoordinate(
  zValue: unknown,
  xValue: unknown,
  yValue: unknown,
): { z: number; x: number; y: number } | null {
  const z = Number(zValue);
  const x = Number(xValue);
  const y = Number(yValue);
  if (
    !Number.isInteger(z) ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    z < 0 ||
    z > 22
  ) {
    return null;
  }

  const max = 2 ** z;
  if (x < 0 || y < 0 || x >= max || y >= max) return null;
  return { z, x, y };
}

async function proxyTile(
  config: TrafficProviderConfig,
  tile: { z: number; x: number; y: number },
  style: 'light' | 'dark',
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(
      config.tileUrl({ ...tile, style }),
      {
        headers: config.headers,
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      throw new Error(
        'Traffic provider HTTP ' + response.status,
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      bytes,
      contentType:
        response.headers.get('content-type') || 'image/png',
      etag: response.headers.get('etag'),
      cacheControl:
        response.headers.get('cache-control') ||
        'public, max-age=30, s-maxage=45, stale-while-revalidate=120',
    };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const config = providerConfig();
  const action = String(req.query?.action ?? 'status');

  if (action === 'status') {
    res.setHeader(
      'Cache-Control',
      'public, max-age=30, s-maxage=60, stale-while-revalidate=120',
    );
    res.status(200).json(
      config
        ? {
            configured: true,
            provider: config.id,
            label: config.label,
            attribution: config.attribution,
            minZoom: config.minZoom,
            maxZoom: config.maxZoom,
            refreshSeconds: config.refreshSeconds,
          }
        : {
            configured: false,
            provider: null,
            label: null,
            attribution: null,
            minZoom: 0,
            maxZoom: 22,
            refreshSeconds: 60,
          },
    );
    return;
  }

  if (action !== 'tile') {
    res.status(400).json({ error: 'Unknown traffic action' });
    return;
  }

  if (!config) {
    res.setHeader('Cache-Control', 'public, max-age=15');
    res.status(404).end();
    return;
  }

  const tile = validTileCoordinate(
    req.query?.z,
    req.query?.x,
    req.query?.y,
  );
  if (!tile) {
    res.status(400).json({ error: 'Invalid tile coordinates' });
    return;
  }
  if (tile.z < config.minZoom || tile.z > config.maxZoom) {
    res.status(204).end();
    return;
  }

  const style =
    String(req.query?.style ?? 'light') === 'dark'
      ? 'dark'
      : 'light';

  try {
    const proxied = await proxyTile(config, tile, style);
    res.setHeader('Content-Type', proxied.contentType);
    res.setHeader('Cache-Control', proxied.cacheControl);
    if (proxied.etag) res.setHeader('ETag', proxied.etag);
    res.status(200).send(proxied.bytes);
  } catch (error) {
    console.error('traffic tile failed', error);
    res.setHeader(
      'Cache-Control',
      'public, max-age=5, stale-if-error=60',
    );
    res.status(502).end();
  }
}
