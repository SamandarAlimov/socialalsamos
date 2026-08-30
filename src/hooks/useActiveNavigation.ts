import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { distanceMeters } from '@/lib/geocoding';
import type { RouteMode, RouteResult, RouteStep } from '@/lib/routing';

export interface NavigationPosition {
  latitude: number;
  longitude: number;
  heading: number | null;
  speedMps: number | null;
  accuracyM: number;
  timestamp: number;
}

export interface NavigationSnapshot {
  remainingDistanceM: number;
  remainingDurationS: number;
  distanceToRouteM: number;
  nearestRouteIndex: number;
  currentStepIndex: number;
  currentStep: RouteStep | null;
  distanceToManeuverM: number;
  arrived: boolean;
  rerouting: boolean;
}

interface UseActiveNavigationOptions {
  active: boolean;
  route: RouteResult | null;
  mode: RouteMode;
  destination: { latitude: number; longitude: number } | null;
  onPosition?: (position: NavigationPosition) => void;
  onReroute?: (
    from: { latitude: number; longitude: number },
    context: { nearestRouteIndex: number },
  ) => Promise<void> | void;
  onArrive?: () => void;
}

interface RouteProjection {
  coordinate: [number, number];
  segmentIndex: number;
  progressM: number;
  distanceM: number;
}

const EMPTY_SNAPSHOT: NavigationSnapshot = {
  remainingDistanceM: 0,
  remainingDurationS: 0,
  distanceToRouteM: 0,
  nearestRouteIndex: 0,
  currentStepIndex: 0,
  currentStep: null,
  distanceToManeuverM: 0,
  arrived: false,
  rerouting: false,
};

function bearingDegrees(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

function angularBlend(previous: number, next: number, alpha: number): number {
  const delta = ((next - previous + 540) % 360) - 180;
  return (previous + delta * alpha + 360) % 360;
}

function cumulativeRouteDistances(coordinates: [number, number][]): number[] {
  if (!coordinates.length) return [];
  const cumulative = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];
    cumulative.push(
      cumulative[index - 1] +
        distanceMeters(previous[0], previous[1], current[0], current[1]),
    );
  }
  return cumulative;
}

function projectPointToSegment(
  point: { latitude: number; longitude: number },
  start: [number, number],
  end: [number, number],
): { coordinate: [number, number]; ratio: number; distanceM: number } {
  // Mahalliy masofalarda equirectangular proyeksiya route snap uchun yetarlicha
  // aniq va har GPS sample uchun og'ir geometriya kutubxonasini talab qilmaydi.
  const lat0 = ((point.latitude + start[0] + end[0]) / 3 * Math.PI) / 180;
  const scaleX = Math.max(0.2, Math.cos(lat0));
  const px = point.longitude * scaleX;
  const py = point.latitude;
  const ax = start[1] * scaleX;
  const ay = start[0];
  const bx = end[1] * scaleX;
  const by = end[0];

  const abX = bx - ax;
  const abY = by - ay;
  const lengthSq = abX * abX + abY * abY;
  const ratio =
    lengthSq <= Number.EPSILON
      ? 0
      : Math.max(
          0,
          Math.min(1, ((px - ax) * abX + (py - ay) * abY) / lengthSq),
        );

  const coordinate: [number, number] = [
    start[0] + (end[0] - start[0]) * ratio,
    start[1] + (end[1] - start[1]) * ratio,
  ];

  return {
    coordinate,
    ratio,
    distanceM: distanceMeters(
      point.latitude,
      point.longitude,
      coordinate[0],
      coordinate[1],
    ),
  };
}

function nearestRouteProjection(
  point: { latitude: number; longitude: number },
  coordinates: [number, number][],
  cumulative: number[],
  hint: number,
): RouteProjection {
  if (!coordinates.length) {
    return {
      coordinate: [point.latitude, point.longitude],
      segmentIndex: 0,
      progressM: 0,
      distanceM: Infinity,
    };
  }
  if (coordinates.length === 1) {
    return {
      coordinate: coordinates[0],
      segmentIndex: 0,
      progressM: 0,
      distanceM: distanceMeters(
        point.latitude,
        point.longitude,
        coordinates[0][0],
        coordinates[0][1],
      ),
    };
  }

  const scan = (from: number, to: number): RouteProjection => {
    let best: RouteProjection = {
      coordinate: coordinates[Math.max(0, Math.min(hint, coordinates.length - 1))],
      segmentIndex: Math.max(0, Math.min(hint, coordinates.length - 2)),
      progressM: cumulative[Math.max(0, Math.min(hint, cumulative.length - 1))] ?? 0,
      distanceM: Infinity,
    };

    for (let index = from; index <= to; index += 1) {
      const projected = projectPointToSegment(
        point,
        coordinates[index],
        coordinates[index + 1],
      );
      if (projected.distanceM >= best.distanceM) continue;

      const segmentLength =
        (cumulative[index + 1] ?? cumulative[index] ?? 0) -
        (cumulative[index] ?? 0);
      best = {
        coordinate: projected.coordinate,
        segmentIndex: index,
        progressM:
          (cumulative[index] ?? 0) + Math.max(0, segmentLength) * projected.ratio,
        distanceM: projected.distanceM,
      };
    }
    return best;
  };

  const maxSegment = coordinates.length - 2;
  const windowed = scan(
    Math.max(0, hint - 30),
    Math.min(maxSegment, hint + 220),
  );

  if (windowed.distanceM <= 220 || coordinates.length <= 280) return windowed;
  return scan(0, maxSegment);
}

function stepProgress(
  steps: RouteStep[],
  travelledM: number,
): {
  index: number;
  step: RouteStep | null;
  distanceToManeuverM: number;
} {
  if (!steps.length) {
    return { index: 0, step: null, distanceToManeuverM: 0 };
  }

  let cumulative = 0;
  for (let index = 0; index < steps.length; index += 1) {
    cumulative += Math.max(0, Number(steps[index].distanceM) || 0);
    if (travelledM <= cumulative || index === steps.length - 1) {
      return {
        index,
        step: steps[index],
        distanceToManeuverM: Math.max(0, cumulative - travelledM),
      };
    }
  }

  return {
    index: steps.length - 1,
    step: steps[steps.length - 1],
    distanceToManeuverM: 0,
  };
}

function smoothPosition(
  raw: NavigationPosition,
  previous: NavigationPosition | null,
): NavigationPosition {
  if (!previous) return raw;

  const elapsedS = Math.max(0.25, (raw.timestamp - previous.timestamp) / 1000);
  const movedM = distanceMeters(
    previous.latitude,
    previous.longitude,
    raw.latitude,
    raw.longitude,
  );
  const derivedSpeed = movedM / elapsedS;

  // Juda yomon GPS sample eski yaxshi fixni sakratib yubormasin.
  if (
    raw.accuracyM > 120 &&
    previous.accuracyM < 70 &&
    elapsedS < 8 &&
    derivedSpeed > 45
  ) {
    return {
      ...previous,
      timestamp: raw.timestamp,
      accuracyM: raw.accuracyM,
    };
  }

  const speed =
    raw.speedMps != null
      ? raw.speedMps
      : Number.isFinite(derivedSpeed)
        ? Math.min(70, derivedSpeed)
        : 0;
  const accuracyFactor = Math.max(0.16, Math.min(0.78, 45 / Math.max(12, raw.accuracyM)));
  const motionFactor = Math.max(0.22, Math.min(0.9, speed / 14 + 0.18));
  const alpha = Math.max(0.18, Math.min(0.88, accuracyFactor * 0.55 + motionFactor * 0.45));

  const latitude =
    previous.latitude + (raw.latitude - previous.latitude) * alpha;
  const longitude =
    previous.longitude + (raw.longitude - previous.longitude) * alpha;

  let heading = raw.heading;
  if (heading == null && movedM >= 2.5) {
    heading = bearingDegrees(previous, raw);
  }
  if (heading != null && previous.heading != null) {
    const headingAlpha = speed >= 7 ? 0.5 : speed >= 2 ? 0.34 : 0.2;
    heading = angularBlend(previous.heading, heading, headingAlpha);
  } else if (heading == null) {
    heading = previous.heading;
  }

  const speedMps =
    raw.speedMps == null
      ? previous.speedMps
      : previous.speedMps == null
        ? raw.speedMps
        : previous.speedMps + (raw.speedMps - previous.speedMps) * 0.38;

  return {
    ...raw,
    latitude,
    longitude,
    heading,
    speedMps,
  };
}

function snappedNavigationPosition(
  position: NavigationPosition,
  projection: RouteProjection,
): NavigationPosition {
  const snapThreshold = Math.max(
    18,
    Math.min(52, Math.max(1, position.accuracyM) * 1.35),
  );
  if (projection.distanceM > snapThreshold) return position;

  return {
    ...position,
    latitude: projection.coordinate[0],
    longitude: projection.coordinate[1],
  };
}

function offRouteThreshold(mode: RouteMode, accuracyM: number): number {
  const accuracyAllowance = Math.max(0, Math.min(45, accuracyM * 0.45));
  if (mode === 'foot') return 38 + accuracyAllowance;
  if (mode === 'bike') return 52 + accuracyAllowance;
  if (mode === 'transit') return 85 + accuracyAllowance;
  return 68 + accuracyAllowance;
}

export function useActiveNavigation({
  active,
  route,
  mode,
  destination,
  onPosition,
  onReroute,
  onArrive,
}: UseActiveNavigationOptions) {
  const [position, setPosition] = useState<NavigationPosition | null>(null);
  const [snapshot, setSnapshot] = useState<NavigationSnapshot>(EMPTY_SNAPSHOT);
  const [error, setError] = useState<string | null>(null);

  const smoothedPositionRef = useRef<NavigationPosition | null>(null);
  const nearestIndexRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const offRouteSamplesRef = useRef(0);
  const arrivedRef = useRef(false);
  const reroutingRef = useRef(false);

  const cumulative = useMemo(
    () => cumulativeRouteDistances(route?.coordinates ?? []),
    [route?.coordinates],
  );

  useEffect(() => {
    nearestIndexRef.current = 0;
    offRouteSamplesRef.current = 0;
    arrivedRef.current = false;
    setSnapshot((current) => ({
      ...EMPTY_SNAPSHOT,
      remainingDistanceM: Number(route?.distanceM) || 0,
      remainingDurationS: Number(route?.durationS) || 0,
      currentStep: route?.steps?.[0] ?? null,
      distanceToManeuverM: Number(route?.steps?.[0]?.distanceM) || 0,
      rerouting: current.rerouting,
    }));
  }, [route]);

  const evaluate = useCallback(
    async (next: NavigationPosition) => {
      if (!route?.coordinates?.length) {
        setPosition(next);
        onPosition?.(next);
        return;
      }

      const projection = nearestRouteProjection(
        next,
        route.coordinates,
        cumulative,
        nearestIndexRef.current,
      );
      nearestIndexRef.current = Math.max(
        nearestIndexRef.current,
        projection.segmentIndex,
      );

      const displayPosition = snappedNavigationPosition(next, projection);
      setPosition(displayPosition);
      onPosition?.(displayPosition);

      const lastIndex = route.coordinates.length - 1;
      const routeTotalM =
        cumulative[lastIndex] || Math.max(1, Number(route.distanceM) || 1);
      const routeRemainingM =
        Math.max(0, routeTotalM - projection.progressM) +
        Math.min(projection.distanceM, 100);
      const ratio = Math.max(
        0,
        Math.min(1, routeRemainingM / Math.max(1, routeTotalM)),
      );
      const remainingDurationS = Math.max(
        0,
        Math.round((Number(route.durationS) || 0) * ratio),
      );
      const travelledM = Math.max(0, routeTotalM - routeRemainingM);
      const step = stepProgress(route.steps ?? [], travelledM);

      const destinationDistanceM = destination
        ? distanceMeters(
            next.latitude,
            next.longitude,
            destination.latitude,
            destination.longitude,
          )
        : routeRemainingM;
      const arrived = destinationDistanceM <= 35 || routeRemainingM <= 22;

      if (arrived && !arrivedRef.current) {
        arrivedRef.current = true;
        onArrive?.();
      }

      setSnapshot((current) => ({
        remainingDistanceM: routeRemainingM,
        remainingDurationS,
        distanceToRouteM: projection.distanceM,
        nearestRouteIndex: projection.segmentIndex,
        currentStepIndex: step.index,
        currentStep: arrived ? null : step.step,
        distanceToManeuverM: arrived ? 0 : step.distanceToManeuverM,
        arrived,
        rerouting: current.rerouting,
      }));

      const threshold = offRouteThreshold(mode, next.accuracyM);
      const accurateEnough = next.accuracyM <= 75;
      if (!arrived && accurateEnough && projection.distanceM > threshold) {
        offRouteSamplesRef.current += 1;
      } else {
        offRouteSamplesRef.current = Math.max(0, offRouteSamplesRef.current - 1);
      }

      const speedMps = next.speedMps ?? 0;
      const samplesRequired = speedMps >= 8 ? 2 : speedMps >= 2 ? 3 : 4;
      const shouldReroute =
        !arrived &&
        accurateEnough &&
        offRouteSamplesRef.current >= samplesRequired &&
        Date.now() - lastRerouteAtRef.current > 15_000 &&
        !reroutingRef.current &&
        Boolean(onReroute);

      if (shouldReroute && onReroute) {
        lastRerouteAtRef.current = Date.now();
        offRouteSamplesRef.current = 0;
        reroutingRef.current = true;
        setSnapshot((current) => ({ ...current, rerouting: true }));
        try {
          await onReroute(
            {
              latitude: next.latitude,
              longitude: next.longitude,
            },
            { nearestRouteIndex: projection.segmentIndex },
          );
        } finally {
          reroutingRef.current = false;
          setSnapshot((current) => ({ ...current, rerouting: false }));
        }
      }
    },
    [route, cumulative, destination, mode, onArrive, onReroute, onPosition],
  );

  // Navigatsiya vaqtida ekran o'chmasin. Browser backgrounddan qaytganda
  // wake lock avtomatik bekor bo'lishi mumkin, shuning uchun visible bo'lganda
  // qayta so'raymiz.
  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return;

    let disposed = false;
    let lock: { release: () => Promise<void> } | null = null;
    const wakeNavigator = navigator as Navigator & {
      wakeLock?: {
        request: (type: 'screen') => Promise<{ release: () => Promise<void> }>;
      };
    };

    const requestWakeLock = async () => {
      if (
        disposed ||
        document.visibilityState !== 'visible' ||
        !wakeNavigator.wakeLock?.request
      ) {
        return;
      }
      try {
        lock = await wakeNavigator.wakeLock.request('screen');
        if (disposed && lock) {
          await lock.release().catch(() => undefined);
          lock = null;
        }
      } catch {
        // Wake Lock optional; navigation GPS ishlashda davom etadi.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void requestWakeLock();
    };

    void requestWakeLock();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (lock) void lock.release().catch(() => undefined);
    };
  }, [active]);

  useEffect(() => {
    if (!active) {
      setError(null);
      setPosition(null);
      smoothedPositionRef.current = null;
      nearestIndexRef.current = 0;
      offRouteSamplesRef.current = 0;
      reroutingRef.current = false;
      setSnapshot(EMPTY_SNAPSHOT);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Joylashuv xizmati mavjud emas.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (geolocation) => {
        const rawBase = {
          latitude: geolocation.coords.latitude,
          longitude: geolocation.coords.longitude,
        };
        const previous = smoothedPositionRef.current;

        let heading =
          geolocation.coords.heading != null &&
          Number.isFinite(geolocation.coords.heading)
            ? Number(geolocation.coords.heading)
            : null;

        if (heading == null && previous) {
          const moved = distanceMeters(
            previous.latitude,
            previous.longitude,
            rawBase.latitude,
            rawBase.longitude,
          );
          if (moved >= 2.5) {
            heading = bearingDegrees(previous, rawBase);
          } else {
            heading = previous.heading;
          }
        }

        const raw: NavigationPosition = {
          ...rawBase,
          heading,
          speedMps:
            geolocation.coords.speed != null &&
            Number.isFinite(geolocation.coords.speed)
              ? Math.max(0, Number(geolocation.coords.speed))
              : null,
          accuracyM: Math.max(0, Number(geolocation.coords.accuracy) || 0),
          timestamp: geolocation.timestamp || Date.now(),
        };

        const next = smoothPosition(raw, previous);
        smoothedPositionRef.current = next;
        setError(null);
        void evaluate(next);
      },
      (geolocationError) => {
        const message =
          geolocationError.code === geolocationError.PERMISSION_DENIED
            ? 'Navigatsiya uchun joylashuv ruxsatini yoqing.'
            : geolocationError.code === geolocationError.TIMEOUT
              ? 'GPS signali kutilmoqda.'
              : 'Joylashuvni kuzatib bo‘lmadi.';
        setError(message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 700,
        timeout: 10_000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [active, evaluate]);

  return {
    position,
    snapshot,
    error,
  };
}

export default useActiveNavigation;
