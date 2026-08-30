import type { MapPlace } from '@/lib/mapPlaces';
import type { RouteMode, RouteResult } from '@/lib/routing';

const STORAGE_KEY = 'alsamos.map.navigation.session.v1';
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

export interface NavigationSession {
  version: 1;
  updatedAt: number;
  active: boolean;
  following: boolean;
  mode: RouteMode;
  routeIndex: number;
  routeOrigin: {
    latitude: number;
    longitude: number;
    name: string;
  } | null;
  destination: MapPlace | null;
  routes: RouteResult[];
}

function validPoint(value: unknown): value is { latitude: number; longitude: number } {
  if (!value || typeof value !== 'object') return false;
  const point = value as { latitude?: unknown; longitude?: unknown };
  return (
    Number.isFinite(Number(point.latitude)) &&
    Number.isFinite(Number(point.longitude))
  );
}

function validRoute(route: unknown): route is RouteResult {
  if (!route || typeof route !== 'object') return false;
  const candidate = route as Partial<RouteResult>;
  return (
    ['car', 'foot', 'bike', 'transit'].includes(String(candidate.mode)) &&
    Number.isFinite(Number(candidate.distanceM)) &&
    Number.isFinite(Number(candidate.durationS)) &&
    Array.isArray(candidate.coordinates) &&
    candidate.coordinates.length > 1
  );
}

export function readNavigationSession(): NavigationSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NavigationSession>;

    if (
      parsed.version !== 1 ||
      !Number.isFinite(Number(parsed.updatedAt)) ||
      Date.now() - Number(parsed.updatedAt) > MAX_AGE_MS ||
      !['car', 'foot', 'bike', 'transit'].includes(String(parsed.mode)) ||
      !Array.isArray(parsed.routes)
    ) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const routes = parsed.routes.filter(validRoute);
    if (!routes.length) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const destination =
      parsed.destination && validPoint(parsed.destination)
        ? (parsed.destination as MapPlace)
        : null;
    if (!destination) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const routeOrigin =
      parsed.routeOrigin && validPoint(parsed.routeOrigin)
        ? {
            latitude: Number(parsed.routeOrigin.latitude),
            longitude: Number(parsed.routeOrigin.longitude),
            name: String(parsed.routeOrigin.name || 'Boshlanish nuqtasi'),
          }
        : null;

    return {
      version: 1,
      updatedAt: Number(parsed.updatedAt),
      active: Boolean(parsed.active) && parsed.mode !== 'transit',
      following: parsed.following !== false,
      mode: parsed.mode as RouteMode,
      routeIndex: Math.max(
        0,
        Math.min(Number(parsed.routeIndex) || 0, routes.length - 1),
      ),
      routeOrigin,
      destination,
      routes,
    };
  } catch {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // no-op
    }
    return null;
  }
}

export function writeNavigationSession(
  session: Omit<NavigationSession, 'version' | 'updatedAt'>,
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: NavigationSession = {
      version: 1,
      updatedAt: Date.now(),
      ...session,
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private mode/storage quota sabab navigationning o'zi buzilmasin.
  }
}

export function clearNavigationSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
