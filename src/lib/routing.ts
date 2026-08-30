import {
  fetchTransitJourneyRoutes,
  type TransitJourneyLeg,
  type TransitJourneyRoute,
} from './transitRealtime';
import {
  fetchTrafficAwareRoutes,
  type TrafficAwareRouteSection,
} from './traffic';

/** Marshrut hisoblash (OSRM). URL manzillar bo'laklardan yig'iladi. */

const H = 'https://';
const PRIMARY = H + 'routing.openstreetmap.de';
const FALLBACK_CAR = H + 'router.project-osrm.org';

export type RouteMode = 'car' | 'foot' | 'bike' | 'transit';

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface RouteLane {
  indications: string[];
  valid: boolean;
  active?: boolean;
}

export interface RouteStep {
  distanceM: number;
  durationS: number;
  instruction: string;
  name: string;
  maneuver: string;
  modifier?: string;
  exit?: number;
  lanes?: RouteLane[];
}

export interface RouteLeg {
  fromIndex: number;
  toIndex: number;
  distanceM: number;
  durationS: number;
}

export interface RouteResult {
  mode: RouteMode;
  distanceM: number;
  durationS: number;
  /** [lat, lng] juftliklari - Leaflet Polyline uchun. */
  coordinates: [number, number][];
  steps: RouteStep[];
  label: string;
  /** Input checkpointlar (From, To, To...) route geometryda qayerga to'g'ri keladi. */
  checkpointIndices?: number[];
  /** From→To, To→To segment metrikalari. */
  legs?: RouteLeg[];
  /** Real traffic provider summary, faqat mavjud bo‘lsa. */
  trafficDelayS?: number;
  trafficLengthM?: number;
  noTrafficDurationS?: number | null;
  historicTrafficDurationS?: number | null;
  liveTrafficDurationS?: number | null;
  trafficSections?: TrafficAwareRouteSection[];
  trafficProvider?: string | null;
  /** Transit-router metadata; only populated for real multimodal routes. */
  transitTransfers?: number;
  transitFare?: unknown;
  transitWalkingDistanceM?: number;
  transitDepartureTime?: string | null;
  transitArrivalTime?: string | null;
  transitRealtime?: boolean;
  transitLegs?: TransitJourneyLeg[];
}

const PROFILE: Record<Exclude<RouteMode, 'transit'>, { prefix: string; profile: string }> = {
  car: { prefix: 'routed-car', profile: 'driving' },
  foot: { prefix: 'routed-foot', profile: 'walking' },
  bike: { prefix: 'routed-bike', profile: 'cycling' },
};

/**
 * Oddiy OSRM jamoat transportini hisoblamaydi. Shuning uchun piyoda marshrutni
 * "transit" deb tezlashtirib ko'rsatish noto'g'ri edi. Real transit router
 * ulanganidan keyin shu adapter alohida implementatsiya qilinadi.
 */
export function hasTransitRoutingProvider(): boolean {
  // Runtime holati Supabase transit gateway statusi orqali aniqlanadi.
  // Bu funksiya backward compatibility uchun qoldirilgan.
  return false;
}

export function maneuverText(step: {
  maneuver?: string;
  modifier?: string;
  name?: string;
  exit?: number;
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
  maneuver?: { type?: string; modifier?: string; exit?: number };
  intersections?: {
    lanes?: {
      indications?: string[];
      valid?: boolean;
      active?: boolean;
    }[];
  }[];
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: { distance?: number; duration?: number; steps?: OsrmStep[] }[];
}

async function request(
  base: string,
  mode: Exclude<RouteMode, 'transit'>,
  points: RoutePoint[],
  signal?: AbortSignal,
  bare = false,
): Promise<OsrmRoute[]> {
  const coords = points
    .map((point) => point.longitude + ',' + point.latitude)
    .join(';');
  const config = PROFILE[mode];
  const path = bare
    ? '/route/v1/' + config.profile + '/'
    : '/' + config.prefix + '/route/v1/' + config.profile + '/';
  const url =
    base +
    path +
    coords +
    '?overview=full&geometries=geojson&steps=true&alternatives=true';
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('routing failed');
  const data = (await response.json()) as { routes?: OsrmRoute[] };
  return data.routes ?? [];
}

function nearestCheckpointIndices(
  coordinates: [number, number][],
  points: RoutePoint[],
): number[] {
  if (!coordinates.length) return points.map(() => 0);

  let minIndex = 0;
  return points.map((point) => {
    let bestIndex = minIndex;
    let bestDistance = Infinity;

    for (let index = minIndex; index < coordinates.length; index += 1) {
      const coordinate = coordinates[index];
      const dLat = coordinate[0] - point.latitude;
      const dLng = coordinate[1] - point.longitude;
      const score = dLat * dLat + dLng * dLng;
      if (score < bestDistance) {
        bestDistance = score;
        bestIndex = index;
      }
    }

    minIndex = bestIndex;
    return bestIndex;
  });
}

function mapOsrmRoutes(
  raw: OsrmRoute[],
  mode: Exclude<RouteMode, 'transit'>,
  points: RoutePoint[],
): RouteResult[] {
  return raw.slice(0, 3).map((route, index) => {
    const coordinates = (route.geometry?.coordinates ?? []).map(
      (pair) => [pair[1], pair[0]] as [number, number],
    );

    return {
      mode,
      distanceM: route.distance,
      durationS: route.duration,
      coordinates,
      steps: (route.legs ?? []).flatMap((leg) =>
        (leg.steps ?? []).map((step) => {
          const laneIntersection = (step.intersections ?? []).find(
            (intersection) => intersection.lanes?.length,
          );
          const lanes = laneIntersection?.lanes?.map((lane) => ({
            indications: Array.isArray(lane.indications)
              ? lane.indications
              : [],
            valid: Boolean(lane.valid),
            active: Boolean(lane.active),
          }));

          return {
            distanceM: step.distance,
            durationS: step.duration,
            name: step.name ?? '',
            maneuver: step.maneuver?.type ?? 'continue',
            modifier: step.maneuver?.modifier,
            exit: step.maneuver?.exit,
            lanes,
            instruction: maneuverText({
              maneuver: step.maneuver?.type,
              modifier: step.maneuver?.modifier,
              name: step.name,
              exit: step.maneuver?.exit,
            }),
          };
        }),
      ),
      label: labelFor(mode, index),
      checkpointIndices: nearestCheckpointIndices(coordinates, points),
      legs: (route.legs ?? []).map((leg, legIndex) => ({
        fromIndex: legIndex,
        toIndex: legIndex + 1,
        distanceM: Number(leg.distance) || 0,
        durationS: Number(leg.duration) || 0,
      })),
    };
  });
}

function mapTrafficAwareRoutes(
  raw: Awaited<ReturnType<typeof fetchTrafficAwareRoutes>>,
  points: RoutePoint[],
): RouteResult[] {
  if (!raw?.length) return [];

  return raw.map((route, index) => {
    const coordinates = (route.coordinates ?? []).filter(
      (pair): pair is [number, number] =>
        Array.isArray(pair) &&
        pair.length >= 2 &&
        Number.isFinite(Number(pair[0])) &&
        Number.isFinite(Number(pair[1])),
    );

    return {
      mode: 'car',
      distanceM: Number(route.distanceM) || 0,
      durationS: Number(route.durationS) || 0,
      coordinates,
      steps: (route.steps ?? []).map((step) => ({
        distanceM: Number(step.distanceM) || 0,
        durationS: Number(step.durationS) || 0,
        instruction: step.instruction || 'Yo‘lda davom eting',
        name: step.name || '',
        maneuver: step.maneuver || 'straight',
      })),
      label:
        route.label ||
        (index === 0
          ? 'Tirbandlik bilan eng tez'
          : labelFor('car', index)),
      checkpointIndices: nearestCheckpointIndices(
        coordinates,
        points,
      ),
      legs: route.legs ?? [],
      trafficDelayS: Math.max(0, Number(route.trafficDelayS) || 0),
      trafficLengthM: Math.max(0, Number(route.trafficLengthM) || 0),
      noTrafficDurationS:
        route.noTrafficDurationS == null
          ? null
          : Number(route.noTrafficDurationS),
      historicTrafficDurationS:
        route.historicTrafficDurationS == null
          ? null
          : Number(route.historicTrafficDurationS),
      liveTrafficDurationS:
        route.liveTrafficDurationS == null
          ? null
          : Number(route.liveTrafficDurationS),
      trafficSections: Array.isArray(route.trafficSections)
        ? route.trafficSections
        : [],
      trafficProvider: route.provider ?? 'tomtom',
    };
  });
}

function transitRouteSteps(
  route: TransitJourneyRoute,
): RouteStep[] {
  if (route.steps?.length) {
    return route.steps.map((step) => ({
      distanceM: Number(step.distanceM) || 0,
      durationS: Number(step.durationS) || 0,
      name: step.name ?? step.routeRef ?? '',
      maneuver: step.maneuver ?? step.mode ?? 'transit',
      modifier: step.modifier,
      instruction:
        step.instruction ??
        [
          step.routeRef,
          step.from && step.to
            ? step.from + ' → ' + step.to
            : null,
        ]
          .filter(Boolean)
          .join(' · ') ??
        'Jamoat transportida davom eting',
    }));
  }

  return (route.legs ?? []).map((leg) => {
    const routeName =
      leg.routeRef || leg.routeName || leg.headsign || '';
    const endpoints =
      leg.from && leg.to
        ? leg.from + ' → ' + leg.to
        : leg.to || leg.from || '';
    const instruction =
      leg.mode === 'walk'
        ? endpoints
          ? 'Piyoda · ' + endpoints
          : 'Piyoda davom eting'
        : [routeName, endpoints].filter(Boolean).join(' · ') ||
          'Jamoat transportida davom eting';

    return {
      distanceM: Number(leg.distanceM) || 0,
      durationS: Number(leg.durationS) || 0,
      name: routeName,
      maneuver: leg.mode || 'transit',
      instruction,
    };
  });
}

function mapTransitJourneyAlternatives(
  routes: TransitJourneyRoute[],
  points: RoutePoint[],
): RouteResult[] {
  return routes.slice(0, 4).flatMap((route, index) => {
    const coordinates = (route.coordinates ?? []).filter(
      (pair): pair is [number, number] =>
        Array.isArray(pair) &&
        pair.length >= 2 &&
        Number.isFinite(Number(pair[0])) &&
        Number.isFinite(Number(pair[1])),
    );
    if (!coordinates.length) return [];

    return [
      {
        mode: 'transit' as const,
        distanceM: Number(route.distanceM) || 0,
        durationS: Number(route.durationS) || 0,
        coordinates,
        steps: transitRouteSteps(route),
        label:
          route.label ||
          (index === 0
            ? 'Eng qulay transport'
            : 'Muqobil transport'),
        checkpointIndices: nearestCheckpointIndices(
          coordinates,
          points,
        ),
        legs:
          points.length === 2
            ? [
                {
                  fromIndex: 0,
                  toIndex: 1,
                  distanceM: Number(route.distanceM) || 0,
                  durationS: Number(route.durationS) || 0,
                },
              ]
            : undefined,
        transitTransfers: Math.max(
          0,
          Number(route.transfers) || 0,
        ),
        transitFare: route.fare ?? null,
        transitWalkingDistanceM: Math.max(
          0,
          Number(route.walkingDistanceM) || 0,
        ),
        transitDepartureTime: route.departureTime ?? null,
        transitArrivalTime: route.arrivalTime ?? null,
        transitRealtime: Boolean(route.realtime),
        transitLegs: route.legs ?? [],
      },
    ];
  });
}

async function fetchTransitThrough(
  points: RoutePoint[],
): Promise<RouteResult[]> {
  if (points.length < 2) return [];

  if (points.length === 2) {
    const response = await fetchTransitJourneyRoutes({
      from: {
        latitude: points[0].latitude,
        longitude: points[0].longitude,
      },
      to: {
        latitude: points[1].latitude,
        longitude: points[1].longitude,
      },
    });
    return mapTransitJourneyAlternatives(
      response?.routes ?? [],
      points,
    );
  }

  let totalDistanceM = 0;
  let totalDurationS = 0;
  let totalTransfers = 0;
  let walkingDistanceM = 0;
  const coordinates: [number, number][] = [];
  const steps: RouteStep[] = [];
  const checkpointIndices: number[] = [0];
  const legs: RouteLeg[] = [];
  const transitLegs: TransitJourneyLeg[] = [];
  let fare: unknown = null;
  let departureTime: string | null = null;
  let arrivalTime: string | null = null;
  let realtime = false;

  for (let index = 0; index < points.length - 1; index += 1) {
    const response = await fetchTransitJourneyRoutes({
      from: {
        latitude: points[index].latitude,
        longitude: points[index].longitude,
      },
      to: {
        latitude: points[index + 1].latitude,
        longitude: points[index + 1].longitude,
      },
    });
    const route = response?.routes?.[0];
    if (!route) return [];

    const legDistanceM = Number(route.distanceM) || 0;
    const legDurationS = Number(route.durationS) || 0;
    totalDistanceM += legDistanceM;
    totalDurationS += legDurationS;
    totalTransfers += Math.max(
      0,
      Number(route.transfers) || 0,
    );
    walkingDistanceM += Math.max(
      0,
      Number(route.walkingDistanceM) || 0,
    );
    fare ??= route.fare ?? null;
    departureTime ??= route.departureTime ?? null;
    arrivalTime = route.arrivalTime ?? arrivalTime;
    realtime = realtime || Boolean(route.realtime);
    transitLegs.push(...(route.legs ?? []));

    legs.push({
      fromIndex: index,
      toIndex: index + 1,
      distanceM: legDistanceM,
      durationS: legDurationS,
    });

    const legCoordinates = (route.coordinates ?? []).filter(
      (pair): pair is [number, number] =>
        Array.isArray(pair) &&
        pair.length >= 2 &&
        Number.isFinite(Number(pair[0])) &&
        Number.isFinite(Number(pair[1])),
    );

    if (coordinates.length && legCoordinates.length) {
      legCoordinates.shift();
    }
    coordinates.push(...legCoordinates);
    checkpointIndices.push(
      Math.max(0, coordinates.length - 1),
    );
    steps.push(...transitRouteSteps(route));
  }

  return [
    {
      mode: 'transit',
      distanceM: totalDistanceM,
      durationS: totalDurationS,
      coordinates,
      steps,
      label: 'Eng qulay transport',
      checkpointIndices,
      legs,
      transitTransfers: totalTransfers,
      transitFare: fare,
      transitWalkingDistanceM: walkingDistanceM,
      transitDepartureTime: departureTime,
      transitArrivalTime: arrivalTime,
      transitRealtime: realtime,
      transitLegs,
    },
  ];
}

export async function fetchRoutesThrough(
  mode: RouteMode,
  points: RoutePoint[],
  signal?: AbortSignal,
): Promise<RouteResult[]> {
  if (points.length < 2) return [];

  if (mode === 'transit') {
    return fetchTransitThrough(points);
  }

  if (mode === 'car') {
    const trafficAware = await fetchTrafficAwareRoutes(
      points,
      signal,
    );
    const normalizedTraffic = mapTrafficAwareRoutes(
      trafficAware,
      points,
    );
    if (normalizedTraffic.length) {
      return normalizedTraffic;
    }
  }

  let raw: OsrmRoute[] = [];
  try {
    raw = await request(PRIMARY, mode, points, signal);
  } catch {
    if (mode !== 'car') throw new Error('routing provider unavailable');
    raw = await request(FALLBACK_CAR, mode, points, signal, true);
  }

  return mapOsrmRoutes(raw, mode, points);
}

export async function optimizeRouteWaypoints<T extends RoutePoint>(
  mode: RouteMode,
  origin: RoutePoint,
  waypoints: T[],
  destination: RoutePoint,
  signal?: AbortSignal,
): Promise<T[]> {
  if (waypoints.length < 2 || mode === 'transit') return waypoints;

  const config = PROFILE[mode];
  const points = [origin, ...waypoints, destination];
  const coords = points
    .map((point) => point.longitude + ',' + point.latitude)
    .join(';');
  const url =
    PRIMARY +
    '/' +
    config.prefix +
    '/trip/v1/' +
    config.profile +
    '/' +
    coords +
    '?roundtrip=false&source=first&destination=last&overview=false&steps=false';

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return waypoints;
    const data = (await response.json()) as {
      waypoints?: { waypoint_index?: number }[];
    };
    if (
      !Array.isArray(data.waypoints) ||
      data.waypoints.length !== points.length
    ) {
      return waypoints;
    }

    // OSRM waypoints input tartibida qaytadi; waypoint_index esa
    // optimallashgan safardagi pozitsiyani ko'rsatadi.
    const ordered = waypoints
      .map((waypoint, index) => ({
        waypoint,
        order: Number(data.waypoints?.[index + 1]?.waypoint_index),
      }))
      .filter((item) => Number.isFinite(item.order))
      .sort((a, b) => a.order - b.order)
      .map((item) => item.waypoint);

    return ordered.length === waypoints.length ? ordered : waypoints;
  } catch {
    return waypoints;
  }
}

export async function fetchRoutes(
  mode: RouteMode,
  from: RoutePoint,
  to: RoutePoint,
  signal?: AbortSignal,
): Promise<RouteResult[]> {
  return fetchRoutesThrough(mode, [from, to], signal);
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
