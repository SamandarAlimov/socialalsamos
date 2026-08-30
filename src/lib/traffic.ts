export type TrafficProviderId =
  | 'tomtom-orbis'
  | 'template';

export type TrafficStyle = 'light' | 'dark';

export interface TrafficProviderStatus {
  configured: boolean;
  provider: TrafficProviderId | null;
  label: string | null;
  attribution: string | null;
  minZoom: number;
  maxZoom: number;
  refreshSeconds: number;
  incidents?: boolean;
  routing?: boolean;
}

export interface TrafficIncident {
  id: string;
  category:
    | 'accident'
    | 'jam'
    | 'lane_closed'
    | 'road_closed'
    | 'road_works'
    | 'flood'
    | 'broken_vehicle'
    | 'other';
  iconCategory?: string | number | null;
  magnitude: number;
  description?: string | null;
  from?: string | null;
  to?: string | null;
  delayS: number;
  lengthM: number;
  startTime?: string | null;
  endTime?: string | null;
  lastReportTime?: string | null;
  roadNumbers: string[];
  probability?: string | null;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  } | null;
  latitude: number;
  longitude: number;
}

export interface TrafficAwareRouteSection {
  startIndex: number;
  endIndex: number;
  category: string;
  delayS: number;
  magnitude: number;
  effectiveSpeedKmh?: number | null;
}

export interface TrafficAwareRoute {
  mode: 'car';
  distanceM: number;
  durationS: number;
  noTrafficDurationS?: number | null;
  historicTrafficDurationS?: number | null;
  liveTrafficDurationS?: number | null;
  trafficDelayS: number;
  trafficLengthM: number;
  coordinates: [number, number][];
  steps: {
    distanceM: number;
    durationS: number;
    instruction: string;
    name: string;
    maneuver: string;
  }[];
  trafficSections: TrafficAwareRouteSection[];
  label: string;
  legs: {
    fromIndex: number;
    toIndex: number;
    distanceM: number;
    durationS: number;
  }[];
  provider: 'tomtom';
}

const FALLBACK_STATUS: TrafficProviderStatus = {
  configured: false,
  provider: null,
  label: null,
  attribution: null,
  minZoom: 0,
  maxZoom: 22,
  refreshSeconds: 60,
  incidents: false,
  routing: false,
};

export async function fetchTrafficProviderStatus(
  signal?: AbortSignal,
): Promise<TrafficProviderStatus> {
  try {
    const response = await fetch('/api/traffic?action=status', {
      signal,
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) return FALLBACK_STATUS;
    const data = await response.json();
    return {
      configured: Boolean(data?.configured),
      provider:
        data?.provider === 'tomtom-orbis' ||
        data?.provider === 'template'
          ? data.provider
          : null,
      label:
        typeof data?.label === 'string'
          ? data.label
          : null,
      attribution:
        typeof data?.attribution === 'string'
          ? data.attribution
          : null,
      minZoom: Number.isFinite(Number(data?.minZoom))
        ? Number(data.minZoom)
        : 0,
      maxZoom: Number.isFinite(Number(data?.maxZoom))
        ? Number(data.maxZoom)
        : 22,
      refreshSeconds: Math.max(
        15,
        Number(data?.refreshSeconds) || 60,
      ),
      incidents: Boolean(data?.incidents),
      routing: Boolean(data?.routing),
    };
  } catch {
    return FALLBACK_STATUS;
  }
}

export function trafficTileTemplate(
  style: TrafficStyle,
  revision?: number,
): string {
  const version =
    revision != null && Number.isFinite(revision)
      ? '&v=' + Math.max(0, Math.floor(revision))
      : '';
  return (
    '/api/traffic?action=tile' +
    '&style=' +
    style +
    '&z={z}&x={x}&y={y}' +
    version
  );
}


export async function fetchTrafficIncidents(
  bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  },
  signal?: AbortSignal,
): Promise<TrafficIncident[]> {
  const params = new URLSearchParams({
    action: 'incidents',
    south: String(bounds.south),
    west: String(bounds.west),
    north: String(bounds.north),
    east: String(bounds.east),
  });

  try {
    const response = await fetch('/api/traffic?' + params.toString(), {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.incidents)
      ? data.incidents.filter(
          (item: TrafficIncident) =>
            item &&
            typeof item.id === 'string' &&
            Number.isFinite(item.latitude) &&
            Number.isFinite(item.longitude),
        )
      : [];
  } catch {
    return [];
  }
}

export async function fetchTrafficAwareRoutes(
  points: {
    latitude: number;
    longitude: number;
  }[],
  signal?: AbortSignal,
): Promise<TrafficAwareRoute[] | null> {
  try {
    const response = await fetch('/api/traffic?action=route', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ points }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.configured) return null;
    return Array.isArray(data?.routes)
      ? data.routes
      : [];
  } catch {
    return null;
  }
}

export function trafficIncidentLabel(
  incident: TrafficIncident,
): string {
  switch (incident.category) {
    case 'accident':
      return 'Yo‘l-transport hodisasi';
    case 'jam':
      return 'Tirbandlik';
    case 'lane_closed':
      return 'Yo‘l qatori yopilgan';
    case 'road_closed':
      return 'Yo‘l yopilgan';
    case 'road_works':
      return 'Yo‘l ta’miri';
    case 'flood':
      return 'Suv bosishi';
    case 'broken_vehicle':
      return 'Nosoz transport';
    default:
      return 'Yo‘ldagi hodisa';
  }
}


export function trafficIncidentColor(
  category: TrafficIncident['category'],
): string {
  switch (category) {
    case 'road_closed':
      return '#DC2626';
    case 'accident':
      return '#EF4444';
    case 'road_works':
      return '#F97316';
    case 'lane_closed':
      return '#F59E0B';
    case 'jam':
      return '#E11D48';
    case 'flood':
      return '#0EA5E9';
    case 'broken_vehicle':
      return '#8B5CF6';
    default:
      return '#F97316';
  }
}
