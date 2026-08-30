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
  apiKey?: string;
  incidents: boolean;
  routing: boolean;
};

type TrafficPoint = {
  latitude: number;
  longitude: number;
};

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
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
      apiKey: tomtomKey,
      incidents: true,
      routing: true,
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
      incidents: false,
      routing: false,
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

function finiteCoordinate(
  value: unknown,
  min: number,
  max: number,
): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function validBounds(query: any): {
  south: number;
  west: number;
  north: number;
  east: number;
} | null {
  const south = finiteCoordinate(query?.south, -90, 90);
  const north = finiteCoordinate(query?.north, -90, 90);
  const west = finiteCoordinate(query?.west, -180, 180);
  const east = finiteCoordinate(query?.east, -180, 180);
  if (
    south == null ||
    north == null ||
    west == null ||
    east == null ||
    south >= north ||
    west >= east
  ) {
    return null;
  }
  return { south, west, north, east };
}

function validRoutePoints(input: unknown): TrafficPoint[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 20)
    .map((point: any) => {
      const latitude = finiteCoordinate(point?.latitude, -90, 90);
      const longitude = finiteCoordinate(point?.longitude, -180, 180);
      return latitude == null || longitude == null
        ? null
        : { latitude, longitude };
    })
    .filter((point): point is TrafficPoint => Boolean(point));
}

function midpointOfGeometry(
  geometry: any,
): { latitude: number; longitude: number } | null {
  const coordinates = geometry?.coordinates;
  if (!Array.isArray(coordinates)) return null;

  if (
    geometry?.type === 'Point' &&
    Number.isFinite(Number(coordinates[0])) &&
    Number.isFinite(Number(coordinates[1]))
  ) {
    return {
      latitude: Number(coordinates[1]),
      longitude: Number(coordinates[0]),
    };
  }

  if (geometry?.type === 'LineString' && coordinates.length) {
    const point = coordinates[Math.floor(coordinates.length / 2)];
    if (
      Array.isArray(point) &&
      Number.isFinite(Number(point[0])) &&
      Number.isFinite(Number(point[1]))
    ) {
      return {
        latitude: Number(point[1]),
        longitude: Number(point[0]),
      };
    }
  }

  return null;
}

function incidentCategory(iconCategory: unknown): string {
  const raw = String(iconCategory ?? '').toLowerCase();
  const numeric = Number(iconCategory);
  if (raw.includes('accident') || numeric === 1) return 'accident';
  if (raw.includes('jam') || numeric === 6) return 'jam';
  if (raw.includes('laneclosed') || raw.includes('lane_closed') || numeric === 7) {
    return 'lane_closed';
  }
  if (raw.includes('roadclosed') || raw.includes('road_closed') || numeric === 8) {
    return 'road_closed';
  }
  if (raw.includes('roadworks') || raw.includes('road_works') || numeric === 9) {
    return 'road_works';
  }
  if (raw.includes('flood') || numeric === 11) return 'flood';
  if (raw.includes('broken') || numeric === 14) return 'broken_vehicle';
  return 'other';
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

async function fetchTomTomIncidents(
  config: TrafficProviderConfig,
  bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  },
) {
  if (!config.apiKey || !config.incidents) {
    return { configured: false, incidents: [] };
  }

  const url = new URL(
    'https://api.tomtom.com/maps/orbis/traffic/incidents/details',
  );
  url.searchParams.set('apiVersion', '2');
  url.searchParams.set(
    'bbox',
    [
      bounds.west,
      bounds.south,
      bounds.east,
      bounds.north,
    ].join(','),
  );
  url.searchParams.set('timeValidity', 'present');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'TomTom-Api-Key': config.apiKey,
        'TomTom-Api-Version': '2',
        Accept: 'application/json',
        'Accept-Language': 'ru-RU,en-GB;q=0.8',
        Attributes:
          'incidents(type,geometry(type,coordinates),properties(id,iconCategory,magnitudeOfDelay,events(description,code,iconCategory),startTime,endTime,from,to,length,delay,roadNumbers,timeValidity,probabilityOfOccurrence,lastReportTime))',
      },
    });
    if (!response.ok) {
      throw new Error('TomTom incidents HTTP ' + response.status);
    }
    const data = await response.json();
    const incidents = Array.isArray(data?.incidents)
      ? data.incidents
      : [];

    return {
      configured: true,
      provider: config.id,
      attribution: config.attribution,
      incidents: incidents
        .map((incident: any) => {
          const position = midpointOfGeometry(incident?.geometry);
          if (!position) return null;
          const properties = incident?.properties ?? {};
          const descriptions = Array.isArray(properties.events)
            ? properties.events
                .map((event: any) => String(event?.description ?? '').trim())
                .filter(Boolean)
            : [];
          return {
            id: String(properties.id || ''),
            category: incidentCategory(properties.iconCategory),
            iconCategory: properties.iconCategory ?? null,
            magnitude: Number(properties.magnitudeOfDelay) || 0,
            description: descriptions.join(' · ') || null,
            from: properties.from || null,
            to: properties.to || null,
            delayS: Number(properties.delay) || 0,
            lengthM: Number(properties.length) || 0,
            startTime: properties.startTime || null,
            endTime: properties.endTime || null,
            lastReportTime: properties.lastReportTime || null,
            roadNumbers: Array.isArray(properties.roadNumbers)
              ? properties.roadNumbers
              : [],
            probability: properties.probabilityOfOccurrence || null,
            geometry: incident.geometry ?? null,
            ...position,
          };
        })
        .filter(Boolean)
        .slice(0, 250),
    };
  } finally {
    clearTimeout(timer);
  }
}

function routeInstruction(step: any): {
  distanceM: number;
  durationS: number;
  instruction: string;
  name: string;
  maneuver: string;
} {
  return {
    distanceM: Number(step?.routeOffsetInMeters) || 0,
    durationS: Number(step?.travelTimeInSeconds) || 0,
    instruction:
      String(step?.message || step?.combinedMessage || '').trim() ||
      'Yo‘lda davom eting',
    name:
      String(
        step?.street ||
          step?.roadNumbers?.[0] ||
          '',
      ).trim(),
    maneuver: String(step?.maneuver || 'STRAIGHT').toLowerCase(),
  };
}

async function fetchTomTomRoute(
  config: TrafficProviderConfig,
  points: TrafficPoint[],
) {
  if (!config.apiKey || !config.routing || points.length < 2) {
    return { configured: false, routes: [] };
  }

  const locations = points
    .map((point) => point.latitude + ',' + point.longitude)
    .join(':');
  const url = new URL(
    'https://api.tomtom.com/routing/1/calculateRoute/' +
      locations +
      '/json',
  );
  url.searchParams.set('key', config.apiKey);
  url.searchParams.set('routeType', 'fastest');
  url.searchParams.set('travelMode', 'car');
  url.searchParams.set('traffic', 'true');
  url.searchParams.set('departAt', 'now');
  url.searchParams.set('routeRepresentation', 'polyline');
  url.searchParams.set('computeTravelTimeFor', 'all');
  url.searchParams.set('maxAlternatives', '2');
  url.searchParams.set('instructionsType', 'text');
  url.searchParams.set('language', 'ru-RU');
  url.searchParams.append('sectionType', 'traffic');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error('TomTom routing HTTP ' + response.status);
    }
    const data = await response.json();
    const routes = Array.isArray(data?.routes) ? data.routes : [];

    return {
      configured: true,
      provider: config.id,
      attribution: config.attribution,
      routes: routes.slice(0, 3).map((route: any, index: number) => {
        const coordinates: [number, number][] = [];
        const legs = Array.isArray(route?.legs) ? route.legs : [];
        const normalizedLegs = legs.map((leg: any, legIndex: number) => {
          const legPoints = Array.isArray(leg?.points)
            ? leg.points
                .map((point: any) => [
                  Number(point?.latitude),
                  Number(point?.longitude),
                ] as [number, number])
                .filter(
                  (point: [number, number]) =>
                    Number.isFinite(point[0]) &&
                    Number.isFinite(point[1]),
                )
            : [];
          if (coordinates.length && legPoints.length) legPoints.shift();
          coordinates.push(...legPoints);
          const summary = leg?.summary ?? {};
          return {
            fromIndex: legIndex,
            toIndex: legIndex + 1,
            distanceM: Number(summary.lengthInMeters) || 0,
            durationS: Number(summary.travelTimeInSeconds) || 0,
          };
        });

        const summary = route?.summary ?? {};
        const sections = Array.isArray(route?.sections)
          ? route.sections
              .filter(
                (section: any) =>
                  String(section?.sectionType ?? '').toUpperCase() ===
                  'TRAFFIC',
              )
              .map((section: any) => ({
                startIndex: Math.max(
                  0,
                  Number(section?.startPointIndex) || 0,
                ),
                endIndex: Math.max(
                  0,
                  Number(section?.endPointIndex) || 0,
                ),
                category: String(
                  section?.simpleCategory || 'OTHER',
                ).toLowerCase(),
                delayS: Number(section?.delayInSeconds) || 0,
                magnitude: Number(section?.magnitudeOfDelay) || 0,
                effectiveSpeedKmh:
                  Number(section?.effectiveSpeedInKmh) || null,
              }))
          : [];

        const instructions = Array.isArray(route?.guidance?.instructions)
          ? route.guidance.instructions.map(routeInstruction)
          : [];

        return {
          mode: 'car',
          distanceM: Number(summary.lengthInMeters) || 0,
          durationS: Number(summary.travelTimeInSeconds) || 0,
          noTrafficDurationS:
            Number(summary.noTrafficTravelTimeInSeconds) || null,
          historicTrafficDurationS:
            Number(summary.historicTrafficTravelTimeInSeconds) || null,
          liveTrafficDurationS:
            Number(summary.liveTrafficIncidentsTravelTimeInSeconds) || null,
          trafficDelayS: Number(summary.trafficDelayInSeconds) || 0,
          trafficLengthM: Number(summary.trafficLengthInMeters) || 0,
          coordinates,
          steps: instructions,
          trafficSections: sections,
          label:
            index === 0
              ? 'Tirbandlik bilan eng tez'
              : index === 1
                ? 'Tirbandlikni chetlab'
                : 'Muqobil yo‘l',
          legs: normalizedLegs,
          provider: 'tomtom',
        };
      }),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function parseBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
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
            incidents: config.incidents,
            routing: config.routing,
          }
        : {
            configured: false,
            provider: null,
            label: null,
            attribution: null,
            minZoom: 0,
            maxZoom: 22,
            refreshSeconds: 60,
            incidents: false,
            routing: false,
          },
    );
    return;
  }

  if (action === 'incidents') {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'GET required' });
      return;
    }
    if (!config?.incidents) {
      res.status(200).json({ configured: false, incidents: [] });
      return;
    }
    const bounds = validBounds(req.query);
    if (!bounds) {
      res.status(400).json({ error: 'Invalid traffic bounds' });
      return;
    }
    try {
      const result = await fetchTomTomIncidents(config, bounds);
      res.setHeader(
        'Cache-Control',
        'public, max-age=20, s-maxage=30, stale-while-revalidate=60',
      );
      res.status(200).json(result);
    } catch (error) {
      console.error('traffic incidents failed', error);
      res.status(502).json({
        configured: true,
        incidents: [],
        error: 'Traffic incidents temporarily unavailable',
      });
    }
    return;
  }

  if (action === 'route') {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST required' });
      return;
    }
    if (!config?.routing) {
      res.status(200).json({ configured: false, routes: [] });
      return;
    }
    const body = await parseBody(req);
    const points = validRoutePoints(body?.points);
    if (points.length < 2) {
      res.status(400).json({ error: 'At least two route points required' });
      return;
    }
    try {
      const result = await fetchTomTomRoute(config, points);
      res.setHeader('Cache-Control', 'private, max-age=15');
      res.status(200).json(result);
    } catch (error) {
      console.error('traffic-aware routing failed', error);
      res.status(502).json({
        configured: true,
        routes: [],
        error: 'Traffic-aware routing temporarily unavailable',
      });
    }
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
