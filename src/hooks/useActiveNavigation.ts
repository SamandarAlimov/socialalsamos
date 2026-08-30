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
  ) => Promise<void> | void;
  onArrive?: () => void;
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
  return (Math.atan2(y, x) * 180) / Math.PI + 360 % 360;
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

function nearestCoordinateIndex(
  point: { latitude: number; longitude: number },
  coordinates: [number, number][],
  hint: number,
): { index: number; distanceM: number } {
  if (!coordinates.length) return { index: 0, distanceM: Infinity };

  const search = (from: number, to: number) => {
    let bestIndex = from;
    let bestDistance = Infinity;
    for (let index = from; index <= to; index += 1) {
      const coordinate = coordinates[index];
      const distance = distanceMeters(
        point.latitude,
        point.longitude,
        coordinate[0],
        coordinate[1],
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    return { index: bestIndex, distanceM: bestDistance };
  };

  const windowed = search(
    Math.max(0, hint - 35),
    Math.min(coordinates.length - 1, hint + 260),
  );

  // GPS sakrashi yoki reroute paytida hint noto'g'ri bo'lishi mumkin.
  if (windowed.distanceM <= 220 || coordinates.length <= 300) return windowed;
  return search(0, coordinates.length - 1);
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

function offRouteThreshold(mode: RouteMode): number {
  if (mode === 'foot') return 45;
  if (mode === 'bike') return 60;
  if (mode === 'transit') return 90;
  return 85;
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

  const previousPositionRef = useRef<NavigationPosition | null>(null);
  const nearestIndexRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const arrivedRef = useRef(false);
  const reroutingRef = useRef(false);

  const cumulative = useMemo(
    () => cumulativeRouteDistances(route?.coordinates ?? []),
    [route?.coordinates],
  );

  useEffect(() => {
    nearestIndexRef.current = 0;
    arrivedRef.current = false;
    setSnapshot((current) => ({
      ...EMPTY_SNAPSHOT,
      rerouting: current.rerouting,
    }));
  }, [route]);

  const evaluate = useCallback(
    async (next: NavigationPosition) => {
      if (!route?.coordinates?.length) return;

      const nearest = nearestCoordinateIndex(
        next,
        route.coordinates,
        nearestIndexRef.current,
      );
      nearestIndexRef.current = Math.max(nearestIndexRef.current, nearest.index);

      const lastIndex = route.coordinates.length - 1;
      const routeTotalM =
        cumulative[lastIndex] || Math.max(1, Number(route.distanceM) || 1);
      const routeRemainingM =
        Math.max(0, routeTotalM - (cumulative[nearest.index] ?? 0)) +
        Math.min(nearest.distanceM, 120);
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
      const arrived = destinationDistanceM <= 35 || routeRemainingM <= 25;

      if (arrived && !arrivedRef.current) {
        arrivedRef.current = true;
        onArrive?.();
      }

      setSnapshot((current) => ({
        remainingDistanceM: routeRemainingM,
        remainingDurationS,
        distanceToRouteM: nearest.distanceM,
        nearestRouteIndex: nearest.index,
        currentStepIndex: step.index,
        currentStep: arrived ? null : step.step,
        distanceToManeuverM: arrived ? 0 : step.distanceToManeuverM,
        arrived,
        rerouting: current.rerouting,
      }));

      const accurateEnough = next.accuracyM <= 65;
      const shouldReroute =
        !arrived &&
        accurateEnough &&
        nearest.distanceM > offRouteThreshold(mode) &&
        Date.now() - lastRerouteAtRef.current > 12_000 &&
        !reroutingRef.current &&
        Boolean(onReroute);

      if (shouldReroute && onReroute) {
        lastRerouteAtRef.current = Date.now();
        reroutingRef.current = true;
        setSnapshot((current) => ({ ...current, rerouting: true }));
        try {
          await onReroute({
            latitude: next.latitude,
            longitude: next.longitude,
          });
        } finally {
          reroutingRef.current = false;
          setSnapshot((current) => ({ ...current, rerouting: false }));
        }
      }
    },
    [route, cumulative, destination, mode, onArrive, onReroute],
  );

  useEffect(() => {
    if (!active) {
      setError(null);
      setPosition(null);
      previousPositionRef.current = null;
      nearestIndexRef.current = 0;
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
        const previous = previousPositionRef.current;
        const rawHeading = geolocation.coords.heading;
        const nextBase = {
          latitude: geolocation.coords.latitude,
          longitude: geolocation.coords.longitude,
        };

        let heading =
          rawHeading != null && Number.isFinite(rawHeading)
            ? Number(rawHeading)
            : null;

        if (heading == null && previous) {
          const moved = distanceMeters(
            previous.latitude,
            previous.longitude,
            nextBase.latitude,
            nextBase.longitude,
          );
          if (moved >= 3) {
            heading = bearingDegrees(previous, nextBase);
          } else {
            heading = previous.heading;
          }
        }

        const next: NavigationPosition = {
          ...nextBase,
          heading,
          speedMps:
            geolocation.coords.speed != null &&
            Number.isFinite(geolocation.coords.speed)
              ? Math.max(0, Number(geolocation.coords.speed))
              : null,
          accuracyM: Math.max(0, Number(geolocation.coords.accuracy) || 0),
          timestamp: geolocation.timestamp || Date.now(),
        };

        previousPositionRef.current = next;
        setPosition(next);
        setError(null);
        onPosition?.(next);
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
        maximumAge: 1000,
        timeout: 10_000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [active, evaluate, onPosition]);

  return {
    position,
    snapshot,
    error,
  };
}

export default useActiveNavigation;
