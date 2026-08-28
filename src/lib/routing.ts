/** Marshrut hisoblash (OSRM). URL manzillar bo'laklardan yig'iladi. */

const H = 'https://';
const PRIMARY = H + 'routing.openstreetmap.de';
const FALLBACK = H + 'router.project-osrm.org';

export type RouteMode = 'car' | 'foot' | 'bike' | 'transit';

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface RouteStep {
  distanceM: number;
  durationS: number;
  instruction: string;
  name: string;
  maneuver: string;
  modifier?: string;
}

export interface RouteResult {
  mode: RouteMode;
  distanceM: number;
  durationS: number;
  /** [lat, lng] juftliklari - Leaflet Polyline uchun. */
  coordinates: [number, number][];
  steps: RouteStep[];
  label: string;
}

const PROFILE: Record<RouteMode, string> = {
  car: 'routed-car',
  foot: 'routed-foot',
  bike: 'routed-bike',
  transit: 'routed-foot',
};

export function maneuverText(step: {
  maneuver?: string;
  modifier?: string;
  name?: string;
}): string {
  const name = step.name ? ' - ' + step.name : '';
  switch (step.maneuver) {
    case 'depart':
      return 'Yo\u2019lni boshlang' + name;
    case 'arrive':
      return 'Manzilga yetib keldingiz';
    case 'roundabout':
    case 'rotary':
      return 'Aylanma yo\u2019lga kiring' + name;
    case 'merge':
      return 'Qo\u2019shiling' + name;
    case 'fork':
      return 'Ayirilishda davom eting' + name;
    default:
      break;
  }
  switch (step.modifier) {
    case 'left':
      return 'Chapga buriling' + name;
    case 'slight left':
      return 'Chapga ozgina buriling' + name;
    case 'sharp left':
      return 'Keskin chapga buriling' + name;
    case 'right':
      return 'O\u2019ngga buriling' + name;
    case 'slight right':
      return 'O\u2019ngga ozgina buriling' + name;
    case 'sharp right':
      return 'Keskin o\u2019ngga buriling' + name;
    case 'uturn':
      return 'Teskari buriling' + name;
    default:
      return 'To\u2019g\u2019ri davom eting' + name;
  }
}

function labelFor(mode: RouteMode, index: number): string {
  if (index === 0) return 'Eng tez yo\u2019l';
  if (index === 1) return 'Muqobil yo\u2019l';
  return 'Yana bir yo\u2019l';
}

interface OsrmStep {
  distance: number;
  duration: number;
  name?: string;
  maneuver?: { type?: string; modifier?: string };
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: { steps?: OsrmStep[] }[];
}

async function request(
  base: string,
  mode: RouteMode,
  from: RoutePoint,
  to: RoutePoint,
  signal?: AbortSignal,
): Promise<OsrmRoute[]> {
  const coords =
    from.longitude + ',' + from.latitude + ';' + to.longitude + ',' + to.latitude;
  const url =
    base +
    '/' +
    PROFILE[mode] +
    '/route/v1/driving/' +
    coords +
    '?overview=full&geometries=geojson&steps=true&alternatives=true';
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('routing failed');
  const data = (await response.json()) as { routes?: OsrmRoute[] };
  return data.routes ?? [];
}

export async function fetchRoutes(
  mode: RouteMode,
  from: RoutePoint,
  to: RoutePoint,
  signal?: AbortSignal,
): Promise<RouteResult[]> {
  let raw: OsrmRoute[] = [];
  try {
    raw = await request(PRIMARY, mode, from, to, signal);
  } catch {
    raw = await request(FALLBACK, mode, from, to, signal);
  }

  return raw.slice(0, 3).map((route, index) => ({
    mode,
    distanceM: route.distance,
    durationS: mode === 'transit' ? route.duration * 0.6 + 300 : route.duration,
    coordinates: (route.geometry?.coordinates ?? []).map(
      (pair) => [pair[1], pair[0]] as [number, number],
    ),
    steps: (route.legs?.[0]?.steps ?? []).map((step) => ({
      distanceM: step.distance,
      durationS: step.duration,
      name: step.name ?? '',
      maneuver: step.maneuver?.type ?? 'continue',
      modifier: step.maneuver?.modifier,
      instruction: maneuverText({
        maneuver: step.maneuver?.type,
        modifier: step.maneuver?.modifier,
        name: step.name,
      }),
    })),
    label: labelFor(mode, index),
  }));
}

export function formatKm(distanceM: number): string {
  if (distanceM < 1000) return Math.round(distanceM) + ' m';
  return (distanceM / 1000).toFixed(distanceM < 10000 ? 1 : 0) + ' km';
}

export function formatMinutes(durationS: number): string {
  const minutes = Math.round(durationS / 60);
  if (minutes < 60) return minutes + ' daq';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? hours + ' soat ' + rest + ' daq' : hours + ' soat';
}

export function arrivalTime(durationS: number): string {
  const date = new Date(Date.now() + durationS * 1000);
  return date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}
