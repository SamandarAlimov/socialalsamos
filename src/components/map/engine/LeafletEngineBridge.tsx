import { useEffect, type MutableRefObject } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

import type { MapEngineController } from '@/lib/mapEngine';

export function LeafletEngineBridge({
  controllerRef,
}: {
  controllerRef: MutableRefObject<MapEngineController | null>;
}) {
  const map = useMap();

  useEffect(() => {
    const controller: MapEngineController = {
      getZoom: () => map.getZoom(),
      setView: (point, zoom, options) => {
        map.setView(point, zoom ?? map.getZoom(), {
          animate: options?.animate ?? true,
        });
      },
      flyTo: (point, zoom, options) => {
        map.flyTo(point, zoom ?? map.getZoom(), {
          animate: options?.animate ?? true,
          duration: options?.duration,
        });
      },
      panTo: (point, options) => {
        map.panTo(point, {
          animate: options?.animate ?? true,
          duration: options?.duration,
        });
      },
      fitBounds: (points, options) => {
        if (points.length < 2) return;
        map.fitBounds(L.latLngBounds(points), {
          padding: options?.padding ?? [48, 48],
          animate: options?.animate ?? true,
        });
      },
      zoomIn: () => map.zoomIn(),
      zoomOut: () => map.zoomOut(),
      resize: () => map.invalidateSize({ animate: false }),
    };

    controllerRef.current = controller;
    return () => {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [controllerRef, map]);

  return null;
}

export default LeafletEngineBridge;
