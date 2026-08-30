import { useCallback, useEffect, type MutableRefObject } from 'react';
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { distanceMeters } from '@/lib/geocoding';
import { getLayer, getOverlay, type MapLayerId } from '@/lib/mapLayers';
import {
  clusterSvg,
  incidentSvg,
  meDotSvg,
  navigationArrowSvg,
  pinSvg,
  stopSvg,
  vehicleSvg,
} from '@/lib/placeIcons';
import {
  type MapEngineController,
  type MapLatLng,
  type MapSceneLine,
  type MapSceneMarker,
  type MapViewport,
} from '@/lib/mapEngine';
import {
  trafficTileTemplate,
  type TrafficProviderStatus,
} from '@/lib/traffic';
import { cn } from '@/lib/utils';
import { LeafletEngineBridge } from './LeafletEngineBridge';

interface LeafletMapSurfaceProps {
  controllerRef: MutableRefObject<MapEngineController | null>;
  center: { latitude: number; longitude: number };
  zoom: number;
  fitTo?: MapLatLng[] | null;
  layerId: MapLayerId;
  overlays: string[];
  markers: MapSceneMarker[];
  lines: MapSceneLine[];
  navigationActive?: boolean;
  pickMode?: boolean;
  referenceCenter: { latitude: number; longitude: number };
  highContrast?: boolean;
  traffic?: TrafficProviderStatus | null;
  trafficRevision?: number;
  onViewport: (viewport: MapViewport) => void;
  onMovedCenter: (
    center: { latitude: number; longitude: number } | null,
  ) => void;
  onMapClick: (
    point: { latitude: number; longitude: number },
    zoom: number,
  ) => void | Promise<void>;
  onMarkerClick?: (id: string) => void;
  onManualPan?: () => void;
}

function markerIcon(marker: MapSceneMarker) {
  if (marker.kind === 'me') {
    return L.divIcon({
      html: meDotSvg(),
      className: 'alsamos-me',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  if (marker.kind === 'navigation') {
    return L.divIcon({
      html: navigationArrowSvg(marker.bearing),
      className: 'alsamos-navigation-arrow',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
  }

  if (marker.kind === 'cluster') {
    const count = Math.max(1, marker.count ?? 1);
    const size = count > 20 ? 42 : count > 8 ? 38 : 34;
    return L.divIcon({
      html: clusterSvg(count),
      className: 'alsamos-cluster',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  if (marker.kind === 'incident') {
    return L.divIcon({
      html: incidentSvg(marker.label || 'incident', marker.color || '#F97316'),
      className: 'alsamos-traffic-incident',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }

  if (marker.kind === 'stop') {
    return L.divIcon({
      html: stopSvg(),
      className: 'alsamos-stop',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }

  if (marker.kind === 'vehicle') {
    return L.divIcon({
      html: vehicleSvg(
        marker.label || 'BUS',
        marker.color,
        marker.bearing,
      ),
      className: 'alsamos-live-vehicle',
      iconSize: [42, 38],
      iconAnchor: [21, 32],
    });
  }

  const isSelected = marker.kind === 'selected';
  const isRouteDestination = marker.kind === 'route-destination';
  const size =
    isSelected
      ? 40
      : isRouteDestination
        ? 38
        : marker.kind === 'place'
          ? 30
          : 34;
  const height = Math.round(size * 1.4);
  return L.divIcon({
    html: pinSvg(
      marker.color ||
        (isRouteDestination ? '#ef4444' : '#2F6FED'),
      {
        size,
        active:
          isSelected ||
          isRouteDestination ||
          Boolean(marker.active),
      },
    ),
    className:
      marker.kind.startsWith('route-')
        ? 'alsamos-route-location'
        : 'alsamos-pin',
    iconSize: [size, height],
    iconAnchor: [size / 2, height],
  });
}

function LeafletCamera({
  center,
  zoom,
  fitTo,
}: {
  center: { latitude: number; longitude: number };
  zoom: number;
  fitTo?: MapLatLng[] | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (fitTo && fitTo.length > 1) {
      map.fitBounds(L.latLngBounds(fitTo), {
        padding: [48, 48],
      });
    }
  }, [fitTo, map]);

  useEffect(() => {
    if (fitTo?.length) return;
    map.setView(
      [center.latitude, center.longitude],
      zoom,
      { animate: true },
    );
  }, [center.latitude, center.longitude, fitTo, map, zoom]);

  return null;
}

function LeafletViewportObserver({
  referenceCenter,
  onViewport,
  onMovedCenter,
}: {
  referenceCenter: { latitude: number; longitude: number };
  onViewport: (viewport: MapViewport) => void;
  onMovedCenter: (
    center: { latitude: number; longitude: number } | null,
  ) => void;
}) {
  const publish = useCallback(
    (map: L.Map, moved: boolean) => {
      const bounds = map.getBounds();
      onViewport({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
        zoom: map.getZoom(),
      });

      if (!moved) return;
      const mapCenter = map.getCenter();
      const candidate = {
        latitude: mapCenter.lat,
        longitude: mapCenter.lng,
      };
      onMovedCenter(
        distanceMeters(
          referenceCenter.latitude,
          referenceCenter.longitude,
          candidate.latitude,
          candidate.longitude,
        ) > 250
          ? candidate
          : null,
      );
    },
    [
      referenceCenter.latitude,
      referenceCenter.longitude,
      onViewport,
      onMovedCenter,
    ],
  );

  const map = useMapEvents({
    moveend: (event) => publish(event.target as L.Map, true),
    zoomend: (event) => publish(event.target as L.Map, true),
  });

  useEffect(() => {
    publish(map, false);
  }, [map, publish]);

  return null;
}

function LeafletInteractionObserver({
  navigationActive,
  pickMode,
  onMapClick,
  onManualPan,
}: {
  navigationActive: boolean;
  pickMode: boolean;
  onMapClick: (
    point: { latitude: number; longitude: number },
    zoom: number,
  ) => void | Promise<void>;
  onManualPan?: () => void;
}) {
  useMapEvents({
    click: (event) => {
      if (navigationActive) return;
      void onMapClick(
        {
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        },
        (event.target as L.Map).getZoom(),
      );
    },
    dragstart: () => {
      if (navigationActive) onManualPan?.();
    },
  });

  // pickMode is part of the renderer contract even though Leaflet's click
  // path is identical: MapPage chooses which callback to pass.
  void pickMode;
  return null;
}

export function LeafletMapSurface({
  controllerRef,
  center,
  zoom,
  fitTo,
  layerId,
  overlays,
  markers,
  lines,
  navigationActive = false,
  pickMode = false,
  referenceCenter,
  highContrast = false,
  traffic = null,
  trafficRevision = 0,
  onViewport,
  onMovedCenter,
  onMapClick,
  onMarkerClick,
  onManualPan,
}: LeafletMapSurfaceProps) {
  const layer = getLayer(layerId);

  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={zoom}
      zoomControl={false}
      attributionControl={false}
      preferCanvas
      className="h-full w-full"
    >
      <TileLayer
        key={'base:' + layer.id}
        url={layer.url}
        attribution={layer.attribution}
        maxZoom={layer.maxZoom}
        maxNativeZoom={layer.maxNativeZoom}
        updateWhenIdle
        keepBuffer={3}
      />

      {layer.labelsUrl && (
        <TileLayer
          key={'labels:' + layer.id}
          url={layer.labelsUrl}
          attribution={layer.attribution}
          maxZoom={layer.maxZoom}
          updateWhenIdle
          keepBuffer={2}
        />
      )}

      {traffic?.configured && overlays.includes('traffic') && (
        <TileLayer
          key={
            'traffic:' +
            (layerId === 'night' ? 'dark' : 'light') +
            ':' +
            trafficRevision
          }
          url={trafficTileTemplate(
            layerId === 'night' ? 'dark' : 'light',
            trafficRevision,
          )}
          attribution={traffic.attribution ?? undefined}
          minZoom={traffic.minZoom}
          maxZoom={traffic.maxZoom}
          opacity={0.88}
          updateWhenIdle={false}
          keepBuffer={2}
        />
      )}

      {overlays
        .filter((id) => id !== 'stops')
        .map((id) => {
          const overlay = getOverlay(id);
          if (!overlay?.url) return null;
          return (
            <TileLayer
              key={overlay.id}
              url={overlay.url}
              attribution={overlay.attribution}
              opacity={overlay.opacity ?? 0.85}
            />
          );
        })}

      <LeafletEngineBridge controllerRef={controllerRef} />
      <LeafletCamera center={center} zoom={zoom} fitTo={fitTo} />
      <LeafletViewportObserver
        referenceCenter={referenceCenter}
        onViewport={onViewport}
        onMovedCenter={onMovedCenter}
      />
      <LeafletInteractionObserver
        navigationActive={navigationActive}
        pickMode={pickMode}
        onMapClick={onMapClick}
        onManualPan={onManualPan}
      />

      {markers.map((marker) => (
        <Marker
          key={marker.id}
          position={[marker.latitude, marker.longitude]}
          icon={markerIcon(marker)}
          zIndexOffset={
            marker.kind === 'navigation'
              ? 1000
              : marker.kind === 'route-destination'
                ? 720
                : marker.kind === 'route-origin'
                  ? 710
                  : marker.kind === 'route-stop'
                    ? 700
                    : marker.kind === 'vehicle'
                      ? 350
                      : 0
          }
          eventHandlers={{
            click: () => onMarkerClick?.(marker.id),
          }}
        >
          {marker.label && marker.kind !== 'me' && (
            <Tooltip
              direction="top"
              offset={[
                0,
                marker.kind === 'navigation' ||
                marker.kind === 'incident' ||
                marker.kind === 'cluster' ||
                marker.kind === 'stop' ||
                marker.kind === 'vehicle'
                  ? -20
                  : -28,
              ]}
              opacity={1}
              className={cn(
                'alsamos-map-tooltip',
                highContrast && 'alsamos-map-tooltip--contrast',
              )}
            >
              <span className="font-semibold">{marker.label}</span>
            </Tooltip>
          )}
        </Marker>
      ))}

      {lines.map((line) =>
        line.coordinates.length > 1 ? (
          <Polyline
            key={line.id}
            positions={line.coordinates}
            color={line.color}
            weight={line.width}
            opacity={line.opacity ?? 1}
          />
        ) : null,
      )}
    </MapContainer>
  );
}

export default LeafletMapSurface;
