/**
 * Yo'nalish (marshrut) qurish - OSRM ochiq serverlari orqali.
 * Har bir transport turi uchun alohida router ishlatiladi, shu sababli
 * piyoda va velosiped yo'nalishlari ham to'g'ri hisoblanadi.
 */

export type RouteMode = 'car' | 'foot' | 'bike' | 'transit';

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface RouteStep {
  instruction: string;
  distanceM: number;
  durationS: number;
  name?: string;
  type?: string;
  modifier?: string;
}

export interface RouteResult {
  mode: RouteMode;
  distanceM: number;
  durationS: number;
  /** Leaflet uchun [lat, lng] massivi. */
  coordinates: Array<[number, number]>;
  steps: RouteStep[];
}

const ENDPOINTS: Record<Exclude<RouteMode, 'transit'>, string> = {
  car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/',
  bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike/',
};

const FALLBACK = 'https://router.project-osrm.org/route/v1/driving/';

const DIRECTION: Record<string, string> = {
  left: 'chapga',
  right: 'o\u2018ngga',
  'slight left': 'chapga bir oz',
  'slight right': 'o\u2018ngga bir oz',
  'sharp left': 'keskin chapga',
  'sharp right': 'keskin o\u2018ngga',
  straight: 'to\u2018g\u2018riga',
  uturn: 'orqaga qayting',
};

function maneuverText(step: any): string {
  const type = step?.maneuver?.type ?? '';
  const modifier = step?.maneuver?.modifier ?? '';
  const name = step?.name ? ' \u2014 ' + step.name : '';
  const side = DIRECTION[modifier] ?? '';

  switch (type) {
    case 'depart':
      return 'Yo\u2018lni boshlang' + name;
    case 'arrive':
      return 'Manzilga yetib keldingiz' + name;
    case 'turn':
      return (side ? side.charAt(0).toUpperCase() + side.slice(1) + ' buriling' : 'Buriling') + name;
    case 'roundabout':
    case 'rotary':
      return 'Aylanma harakatga kiring' + name;
    case 'merge':
      return 'Yo\u2018lga qo\u2018shiling' + name;
    case 'fork':
      return 'Ayrilishda ' + (side || 'to\u2018g\u2018riga') + ' yuring' + name;
    case 'end of road':
      return 'Yo\u2018l oxirida ' + (side || 'to\u2018g\u2018riga') + ' buriling' + name;
    case 'new name':
    case 'continue':
      return 'Davom eting' + name;
    default:
      return (side ? side + ' yuring' : 'Davom eting') + name;
  }
}

export async function fetchRoutes(
  mode: RouteMode,
  from: RoutePoint,
  to: RoutePoint,
  signal?: AbortSignal,
): Promise<RouteResult[]> {
  const profile = mode === 'transit' ? 'car' : mode;
  const coords =
    from.longitude + ',' + from.latitude + ';' + to.longitude + ',' + to.latitude;
  const params = 'overview=full&geometries=geojson&steps=true&alternatives=true';

  const urls = [ENDPOINTS[profile] + coords + '?' + params, FALLBACK + coords + '?' + params];

  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Router ' + response.status);
      const data = await response.json();
      const routes = (data?.routes ?? []) as any[];
      if (!routes.length) throw new Error('Marshrut topilmadi');

      return routes.slice(0, 3).map((route) => ({
        mode,
        distanceM: Math.round(route.distance ?? 0),
        durationS: Math.round(
          // Jamoat transporti taxminiy: avtomobil vaqtiga bekat to'xtashlari qo'shiladi.
          mode === 'transit' ? (route.duration ?? 0) * 1.7 + 300 : route.duration ?? 0,
        ),
        coordinates: ((route.geometry?.coordinates ?? []) as Array<[number, number]>).map(
          ([lng, lat]) => [lat, lng] as [number, number],
        ),
        steps: ((route.legs?.[0]?.steps ?? []) as any[]).map((step) => ({
          instruction: maneuverText(step),
          distanceM: Math.round(step.distance ?? 0),
          durationS: Math.round(step.duration ?? 0),
          name: step.name || undefined,
          type: step.maneuver?.type,
          modifier: step.maneuver?.modifier,
        })),
      }));
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      lastError = error;
    }
  }

  throw lastError ?? new Error('Yo\u2018nalish qurilmadi');
}

export function formatKm(meters: number): string {
  if (meters < 1000) return meters + ' m';
  return (meters / 1000).toFixed(meters < 10000 ? 1 : 0) + ' km';
}

export function formatMinutes(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return minutes + ' daq';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours + ' soat' + (rest ? ' ' + rest + ' daq' : '');
}

export function arrivalTime(seconds: number): string {
  const date = new Date(Date.now() + seconds * 1000);
  return date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}
