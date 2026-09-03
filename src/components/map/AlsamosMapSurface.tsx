import { useCallback, useMemo, useRef, useState, type MutableRefObject } from 'react';

import { LeafletMapSurface } from '@/components/map/engine/LeafletMapSurface';
import { VectorMapSurface } from '@/components/map/engine/VectorMapSurface';
import {
  readPreferredMapEngine,
  vectorStyleUrl,
  type MapEngineController,
  type MapSceneLine,
  type MapSceneMarker,
  type MapViewport,
} from '@/lib/mapEngine';
import type { MapLayerId } from '@/lib/mapLayers';
import { cn } from '@/lib/utils';

interface AlsamosMapSurfaceProps {
  center: { latitude: number; longitude: number };
  zoom?: number;
  markers?: MapSceneMarker[];
  lines?: MapSceneLine[];
  layerId?: MapLayerId;
  overlays?: string[];
  pickMode?: boolean;
  referenceCenter?: { latitude: number; longitude: number };
  controllerRef?: MutableRefObject<MapEngineController | null>;
  className?: string;
  onMapClick?: (
    point: { latitude: number; longitude: number },
    zoom: number,
  ) => void | Promise<void>;
  onMarkerClick?: (id: string) => void;
  onViewport?: (viewport: MapViewport) => void;
  onMovedCenter?: (
    center: { latitude: number; longitude: number } | null,
  ) => void;
}

/**
 * Platformadagi yagona qayta ishlatiladigan map renderer.
 *
 * MapPage bilan aynan bir xil engine tanlovi, raster/vector surface,
 * marker renderer va localStorage preference ishlatiladi. Create, Messages,
 * Settings va boshqa feature'lar alohida Leaflet/OSM map qurmasligi kerak.
 */
export function AlsamosMapSurface({
  center,
  zoom = 15,
  markers = [],
  lines = [],
  layerId = 'map',
  overlays = [],
  pickMode = false,
  referenceCenter,
  controllerRef,
  className,
  onMapClick,
  onMarkerClick,
  onViewport,
  onMovedCenter,
}: AlsamosMapSurfaceProps) {
  const localControllerRef = useRef<MapEngineController | null>(null);
  const activeControllerRef = controllerRef ?? localControllerRef;
  const [engine, setEngine] = useState(() => readPreferredMapEngine());

  const effectiveEngine =
    engine === 'vector' && (layerId === 'map' || layerId === 'night')
      ? 'vector'
      : 'raster';

  const stableReferenceCenter = referenceCenter ?? center;

  const handleViewport = useCallback(
    (viewport: MapViewport) => {
      onViewport?.(viewport);
    },
    [onViewport],
  );

  const handleMovedCenter = useCallback(
    (next: { latitude: number; longitude: number } | null) => {
      onMovedCenter?.(next);
    },
    [onMovedCenter],
  );

  const handleMapClick = useCallback(
    (
      point: { latitude: number; longitude: number },
      currentZoom: number,
    ) => {
      if (!onMapClick) return;
      return onMapClick(point, currentZoom);
    },
    [onMapClick],
  );

  const content = useMemo(() => {
    if (effectiveEngine === 'vector') {
      return (
        <VectorMapSurface
          controllerRef={activeControllerRef}
          center={center}
          zoom={zoom}
          styleUrl={vectorStyleUrl(layerId === 'night')}
          markers={markers}
          lines={lines}
          buildings3d={false}
          pickMode={pickMode}
          referenceCenter={stableReferenceCenter}
          onViewport={handleViewport}
          onMovedCenter={handleMovedCenter}
          onMapClick={handleMapClick}
          onMarkerClick={onMarkerClick}
          onError={() => setEngine('raster')}
        />
      );
    }

    return (
      <LeafletMapSurface
        controllerRef={activeControllerRef}
        center={center}
        zoom={zoom}
        layerId={layerId}
        overlays={overlays}
        markers={markers}
        lines={lines}
        pickMode={pickMode}
        referenceCenter={stableReferenceCenter}
        onViewport={handleViewport}
        onMovedCenter={handleMovedCenter}
        onMapClick={handleMapClick}
        onMarkerClick={onMarkerClick}
      />
    );
  }, [
    activeControllerRef,
    center,
    effectiveEngine,
    handleMapClick,
    handleMovedCenter,
    handleViewport,
    layerId,
    lines,
    markers,
    onMarkerClick,
    overlays,
    pickMode,
    stableReferenceCenter,
    zoom,
  ]);

  return (
    <div className={cn('h-full w-full overflow-hidden bg-muted', className)}>
      {content}
    </div>
  );
}

export default AlsamosMapSurface;
