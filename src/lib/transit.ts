/**
 * Jamoat transporti: avtobus bekatlari va ularga keladigan marshrutlar.
 *
 * Muammo: bekatga bosilganda hech qanday ma'lumot chiqmasdi.
 * Yechim: OpenStreetMap Overpass API dan bekat + unga bog'langan marshrut
 * relatsiyalarini olamiz (`route=bus|trolleybus|minibus|tram|subway`), keyin
 * `interval` / `headway` teglaridan kelish vaqtini hisoblaymiz.
 *
 * Real ETA faqat GTFS/GTFS-Realtime gateway yoki explicit legacy realtime
 * provider bergan qiymatdan ko‘rsatiladi; OSM intervaldan ETA uydirilmaydi.
 */

import { distanceMeters } from './geocoding';

export interface TransitStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  kind: 'bus' | 'trolleybus' | 'tram' | 'subway' | 'station';
  shelter?: boolean;
  bench?: boolean;
  code?: string | null;
  gtfsStopId?: string | null;
  distanceM?: number;
}

export interface TransitRoute {
  id: string;
  /** Marshrut raqami, masalan "57". */
  ref: string;
  name: string;
  mode: 'bus' | 'trolleybus' | 'minibus' | 'tram' | 'subway' | 'train' | 'other';
  from?: string | null;
  to?: string | null;
  operator?: string | null;
  colour?: string | null;
  /** Qatnov oralig'i (daqiqa), teglardan yoki taxminiy. */
  intervalMin: number;
  /** Keyingi kelish vaqtlari (daqiqada), taxminiy yoki real. */
  nextArrivalsMin: number[];
  /** Ma'lumot manbasi: real vaqt yoki jadval/taxmin. */
  realtime: boolean;
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function overpass(query: string, signal?: AbortSignal): Promise<any> {
  let lastError: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal,
      });
      if (!response.ok) throw new Error('Overpass ' + response.status);
      return await response.json();
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error('Overpass javob bermadi');
}

function stopKind(tags: Record<string, string>): TransitStop['kind'] {
  if (tags.railway === 'subway_entrance' || tags.station === 'subway') return 'subway';
  if (tags.railway === 'tram_stop') return 'tram';
  if (tags.trolleybus === 'yes') return 'trolleybus';
  if (tags.amenity === 'bus_station') return 'station';
  return 'bus';
}

/** Atrofdagi bekatlar. */
export async function fetchNearbyStops(
  center: { latitude: number; longitude: number },
  options?: { radiusM?: number; signal?: AbortSignal },
): Promise<TransitStop[]> {
  const radius = options?.radiusM ?? 1500;
  const query =
    '[out:json][timeout:25];\n(\n' +
    'node["highway"="bus_stop"](around:' + radius + ',' + center.latitude + ',' + center.longitude + ');\n' +
    'node["public_transport"="platform"](around:' + radius + ',' + center.latitude + ',' + center.longitude + ');\n' +
    'node["railway"="tram_stop"](around:' + radius + ',' + center.latitude + ',' + center.longitude + ');\n' +
    'nwr["amenity"="bus_station"](around:' + radius + ',' + center.latitude + ',' + center.longitude + ');\n' +
    ');\nout tags center 80;';

  const data = await overpass(query, options?.signal);
  return ((data?.elements ?? []) as any[])
    .map((element): TransitStop | null => {
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (typeof lat !== 'number' || typeof lon !== 'number') return null;
      const tags: Record<string, string> = element.tags ?? {};
      return {
        id: element.type + '/' + element.id,
        name: tags.name || tags['name:uz'] || tags['name:ru'] || 'Bekat',
        latitude: lat,
        longitude: lon,
        kind: stopKind(tags),
        shelter: tags.shelter === 'yes',
        bench: tags.bench === 'yes',
        code: tags.ref || tags.local_ref || null,
        gtfsStopId:
          tags['gtfs:stop_id'] ||
          tags['ref:gtfs'] ||
          tags['gtfs_id'] ||
          null,
        distanceM: distanceMeters(center.latitude, center.longitude, lat, lon),
      };
    })
    .filter((stop): stop is TransitStop => stop !== null)
    .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
}

function parseIntervalMin(tags: Record<string, string>): number {
  const raw = tags.interval || tags.headway || tags['interval:peak'] || '';
  // "00:10:00" yoki "10" formatlari
  const hms = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hms) return Number(hms[1]) * 60 + Number(hms[2]);
  const num = Number(String(raw).replace(/[^\d]/g, ''));
  if (num > 0 && num < 180) return num;
  return 0;
}

function routeMode(tags: Record<string, string>): TransitRoute['mode'] {
  const route = tags.route || tags.route_master || '';
  if (route === 'bus') return 'bus';
  if (route === 'trolleybus') return 'trolleybus';
  if (route === 'minibus' || route === 'share_taxi') return 'minibus';
  if (route === 'tram') return 'tram';
  if (route === 'subway') return 'subway';
  if (route === 'train' || route === 'railway') return 'train';
  return 'other';
}

/** Bekatga keladigan marshrutlar. */
export async function fetchStopRoutes(
  stopId: string,
  options?: { signal?: AbortSignal },
): Promise<TransitRoute[]> {
  const [type, id] = stopId.split('/');
  if (!type || !id) return [];

  const selector =
    type === 'node' ? 'rel(bn:' + id + ')' : type === 'way' ? 'rel(bw:' + id + ')' : 'rel(br:' + id + ')';

  const query =
    '[out:json][timeout:25];\n' +
    selector + '["type"="route"];\n' +
    'out tags 60;';

  const data = await overpass(query, options?.signal);

  const routes = ((data?.elements ?? []) as any[])
    .map((element): TransitRoute | null => {
      const tags: Record<string, string> = element.tags ?? {};
      const mode = routeMode(tags);
      if (mode === 'other' && !tags.route) return null;
      const intervalMin = parseIntervalMin(tags);
      const ref = tags.ref || tags['ref:short'] || (tags.name ?? '').split(' ')[0] || '?';
      return {
        id: 'relation/' + element.id,
        ref,
        name: tags.name || tags['name:uz'] || 'Marshrut ' + ref,
        mode,
        from: tags.from ?? null,
        to: tags.to ?? null,
        operator: tags.operator ?? null,
        colour: tags.colour ?? null,
        intervalMin,
        // OSM interval — bu faqat qatnov oralig‘i. Undan sun’iy ETA
        // hosil qilmaymiz; aniq kelish vaqti faqat GTFS-RT'dan keladi.
        nextArrivalsMin: [],
        realtime: false,
      };
    })
    .filter((route): route is TransitRoute => route !== null);

  // Marshrut raqami bo'yicha guruhlash (borish/qaytish yo'nalishlari birlashadi).
  const byRef = new Map<string, TransitRoute>();
  for (const route of routes) {
    const existing = byRef.get(route.ref + ':' + route.mode);
    if (!existing) byRef.set(route.ref + ':' + route.mode, route);
    else if (!existing.to && route.to) byRef.set(route.ref + ':' + route.mode, route);
  }

  return Array.from(byRef.values()).sort((a, b) => {
    const an = Number(a.ref.replace(/\D/g, ''));
    const bn = Number(b.ref.replace(/\D/g, ''));
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    return a.ref.localeCompare(b.ref);
  });
}

const REALTIME_URL = String(import.meta.env.VITE_TRANSIT_RT_URL ?? '').replace(/\/+$/, '');

/** Real-time transport manbasi ulangan-ulanmaganini UI ga bildiradi. */
export function hasRealtimeTransitFeed(): boolean {
  return REALTIME_URL.length > 0;
}

/**
 * Real vaqt (agar shahar API'si ulangan bo'lsa).
 * Javob formati: `{ arrivals: [{ ref, minutes }] }`
 */
export async function fetchRealtimeArrivals(
  stopId: string,
  signal?: AbortSignal,
): Promise<Record<string, number[]> | null> {
  if (!REALTIME_URL) return null;
  try {
    const response = await fetch(
      REALTIME_URL + '/arrivals?stop=' + encodeURIComponent(stopId),
      { signal, headers: { Accept: 'application/json' } },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const map: Record<string, number[]> = {};
    for (const item of (data?.arrivals ?? []) as any[]) {
      const ref = String(item.ref ?? '');
      if (!ref) continue;
      map[ref] = [...(map[ref] ?? []), Number(item.minutes)].sort((a, b) => a - b);
    }
    return map;
  } catch {
    return null;
  }
}

export function formatArrival(minutes: number): string {
  if (minutes <= 1) return 'hozir';
  if (minutes < 60) return minutes + ' daq';
  const hours = Math.floor(minutes / 60);
  return hours + ' soat ' + (minutes % 60) + ' daq';
}
