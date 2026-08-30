import { useEffect, useMemo, useState } from 'react';

import {
  fetchTrafficIncidents,
  type TrafficIncident,
} from '@/lib/traffic';

interface TrafficViewport {
  south: number;
  west: number;
  north: number;
  east: number;
  zoom: number;
}

function roundedBounds(viewport: TrafficViewport | null) {
  if (!viewport) return null;
  const precision = viewport.zoom >= 14 ? 3 : 2;
  const round = (value: number) =>
    Number(value.toFixed(precision));
  return {
    south: round(viewport.south),
    west: round(viewport.west),
    north: round(viewport.north),
    east: round(viewport.east),
  };
}

export function useTrafficIncidents(
  viewport: TrafficViewport | null,
  enabled: boolean,
  refreshSeconds = 60,
) {
  const bounds = useMemo(
    () => roundedBounds(viewport),
    [
      viewport?.south,
      viewport?.west,
      viewport?.north,
      viewport?.east,
      viewport?.zoom,
    ],
  );
  const [incidents, setIncidents] = useState<TrafficIncident[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !bounds) {
      setIncidents([]);
      setLoading(false);
      return;
    }

    let disposed = false;
    let controller: AbortController | null = null;

    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      setLoading(true);
      const next = await fetchTrafficIncidents(
        bounds,
        controller.signal,
      );
      if (!disposed && !controller.signal.aborted) {
        setIncidents(next);
        setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(
      () => void load(),
      Math.max(20, refreshSeconds) * 1000,
    );

    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [
    enabled,
    bounds?.south,
    bounds?.west,
    bounds?.north,
    bounds?.east,
    refreshSeconds,
  ]);

  return { incidents, loading };
}

export default useTrafficIncidents;
