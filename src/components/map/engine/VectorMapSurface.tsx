import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';

import {
  clusterSvg,
  meDotSvg,
  navigationArrowSvg,
  pinSvg,
  stopSvg,
  vehicleSvg,
} from '@/lib/placeIcons';
import { distanceMeters } from '@/lib/geocoding';
import {
  vectorFeatureCanonicalId,
  type MapEngineController,
  type MapLatLng,
  type MapSceneLine,
  type MapSceneMarker,
  type MapViewport,
  type VectorRenderedFeature,
} from '@/lib/mapEngine';
import { loadMapLibreRuntime } from '@/lib/maplibreRuntime';
import {
  trafficTileTemplate,
  type TrafficProviderStatus,
  type TrafficStyle,
} from '@/lib/traffic';

interface VectorMapSurfaceProps {
  controllerRef: MutableRefObject<MapEngineController | null>;
  center: { latitude: number; longitude: number };
  zoom: number;
  fitTo?: MapLatLng[] | null;
  styleUrl: string;
  markers: MapSceneMarker[];
  lines: MapSceneLine[];
  navigationActive?: boolean;
  navigationBearing?: number | null;
  navigationPitch?: number;
  buildings3d?: boolean;
  traffic?: TrafficProviderStatus | null;
  trafficEnabled?: boolean;
  trafficStyle?: TrafficStyle;
  trafficRevision?: number;
  pickMode?: boolean;
  referenceCenter: { latitude: number; longitude: number };
  onViewport: (viewport: MapViewport) => void;
  onMovedCenter: (
    center: { latitude: number; longitude: number } | null,
  ) => void;
  onMapClick: (
    point: { latitude: number; longitude: number },
    zoom: number,
  ) => void | Promise<void>;
  onFeatureClick?: (
    feature: VectorRenderedFeature,
    zoom: number,
  ) => void | Promise<void>;
  onMarkerClick?: (id: string) => void;
  onManualPan?: () => void;
  onReady?: () => void;
  onError?: (error: Error) => void;
}

const ROUTE_SOURCE_ID = 'alsamos-route-lines';
const ROUTE_LAYER_ID = 'alsamos-route-lines-layer';
const BUILDING_LAYER_ID = 'alsamos-buildings-3d';
const POI_SOURCE_ID = 'alsamos-vector-pois';
const POI_CLUSTER_LAYER_ID = 'alsamos-vector-poi-clusters';
const POI_CLUSTER_COUNT_LAYER_ID = 'alsamos-vector-poi-cluster-count';
const POI_POINT_LAYER_ID = 'alsamos-vector-poi-points';
const TRAFFIC_SOURCE_ID = 'alsamos-traffic-flow';
const TRAFFIC_LAYER_ID = 'alsamos-traffic-flow-layer';

function markerHtml(marker: MapSceneMarker): string {
  switch (marker.kind) {
    case 'me':
      return meDotSvg();
    case 'navigation':
      return navigationArrowSvg(marker.bearing);
    case 'cluster':
      return clusterSvg(Math.max(1, marker.count ?? 1));
    case 'stop':
      return stopSvg();
    case 'vehicle':
      return vehicleSvg(
        marker.label || 'BUS',
        marker.color,
        marker.bearing,
      );
    case 'route-destination':
      return pinSvg(marker.color || '#ef4444', {
        size: marker.active ? 38 : 34,
        active: Boolean(marker.active),
      });
    case 'route-origin':
    case 'route-stop':
      return pinSvg(marker.color || '#2F6FED', {
        size: marker.active ? 38 : 34,
        active: Boolean(marker.active),
      });
    case 'selected':
      return pinSvg(marker.color || '#2F6FED', {
        size: 40,
        active: true,
      });
    default:
      return pinSvg(marker.color || '#2F6FED', {
        size: marker.active ? 40 : 30,
        active: Boolean(marker.active),
      });
  }
}

function markerAnchor(marker: MapSceneMarker): 'center' | 'bottom' {
  return marker.kind === 'me' ||
    marker.kind === 'navigation' ||
    marker.kind === 'cluster' ||
    marker.kind === 'stop' ||
    marker.kind === 'vehicle'
    ? 'center'
    : 'bottom';
}

function chooseRenderedFeature(features: any[]): any | null {
  const usable = features.filter(
    (feature) =>
      feature?.layer?.id !== ROUTE_LAYER_ID &&
      feature?.source !== ROUTE_SOURCE_ID &&
      feature?.source !== POI_SOURCE_ID &&
      feature?.source !== TRAFFIC_SOURCE_ID,
  );
  if (!usable.length) return null;

  const score = (feature: any) => {
    const layer = String(feature?.layer?.id ?? '').toLowerCase();
    const sourceLayer = String(feature?.sourceLayer ?? '').toLowerCase();
    const properties = feature?.properties ?? {};
    let value = 0;

    if (properties.name || properties['name:uz'] || properties['name:ru']) {
      value += 40;
    }
    if (/poi|place|amenity|shop|tourism|transit/.test(layer + sourceLayer)) {
      value += 35;
    }
    if (/building/.test(layer + sourceLayer)) value += 28;
    if (/road|street|transportation/.test(layer + sourceLayer)) value += 20;
    if (feature?.id != null) value += 5;
    return value;
  };

  return [...usable].sort((a, b) => score(b) - score(a))[0] ?? null;
}

function featureName(feature: any): string | null {
  const properties = feature?.properties ?? {};
  const value =
    properties['name:uz'] ??
    properties.name ??
    properties['name:ru'] ??
    properties['name:en'] ??
    properties.ref ??
    null;
  return value == null ? null : String(value);
}

function add3dBuildings(map: any): void {
  if (!map?.isStyleLoaded?.()) return;
  if (map.getLayer?.(BUILDING_LAYER_ID)) return;

  const style = map.getStyle?.();
  const layers = Array.isArray(style?.layers) ? style.layers : [];
  const buildingLayer = layers.find((layer: any) => {
    const sourceLayer = String(layer?.['source-layer'] ?? '').toLowerCase();
    const id = String(layer?.id ?? '').toLowerCase();
    return sourceLayer === 'building' || id.includes('building');
  });
  if (!buildingLayer?.source) return;

  const firstLabelLayer = layers.find(
    (layer: any) => layer?.type === 'symbol' && layer?.layout?.['text-field'],
  );

  try {
    map.addLayer(
      {
        id: BUILDING_LAYER_ID,
        source: buildingLayer.source,
        'source-layer': buildingLayer['source-layer'] || 'building',
        type: 'fill-extrusion',
        minzoom: 15,
        paint: {
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['zoom'],
            15,
            '#d8d2ca',
            18,
            '#c8c0b6',
          ],
          'fill-extrusion-height': [
            'coalesce',
            ['to-number', ['get', 'render_height']],
            ['to-number', ['get', 'height']],
            ['*', ['to-number', ['get', 'levels']], 3],
            6,
          ],
          'fill-extrusion-base': [
            'coalesce',
            ['to-number', ['get', 'render_min_height']],
            ['to-number', ['get', 'min_height']],
            0,
          ],
          'fill-extrusion-opacity': 0.86,
        },
      },
      firstLabelLayer?.id,
    );
  } catch {
    // Style source schema may not expose a compatible building source.
  }
}

function removeTrafficLayer(map: any): void {
  try {
    if (map.getLayer?.(TRAFFIC_LAYER_ID)) {
      map.removeLayer(TRAFFIC_LAYER_ID);
    }
    if (map.getSource?.(TRAFFIC_SOURCE_ID)) {
      map.removeSource(TRAFFIC_SOURCE_ID);
    }
  } catch {
    // Style may be reloading.
  }
}

function syncTrafficLayer(
  map: any,
  traffic: TrafficProviderStatus | null | undefined,
  enabled: boolean,
  style: TrafficStyle,
  revision = 0,
): void {
  if (!map?.isStyleLoaded?.()) return;

  if (!enabled || !traffic?.configured) {
    removeTrafficLayer(map);
    return;
  }

  removeTrafficLayer(map);

  try {
    map.addSource(TRAFFIC_SOURCE_ID, {
      type: 'raster',
      tiles: [trafficTileTemplate(style, revision)],
      tileSize: 256,
      minzoom: traffic.minZoom,
      maxzoom: traffic.maxZoom,
      attribution: traffic.attribution ?? undefined,
    });

    const beforeLayer = map.getLayer?.(ROUTE_LAYER_ID)
      ? ROUTE_LAYER_ID
      : undefined;
    map.addLayer(
      {
        id: TRAFFIC_LAYER_ID,
        type: 'raster',
        source: TRAFFIC_SOURCE_ID,
        paint: {
          'raster-opacity': 0.9,
          'raster-fade-duration': 180,
        },
      },
      beforeLayer,
    );
  } catch {
    removeTrafficLayer(map);
  }
}

function ensurePoiLayers(map: any): void {
  if (!map?.isStyleLoaded?.()) return;

  if (!map.getSource?.(POI_SOURCE_ID)) {
    map.addSource(POI_SOURCE_ID, {
      type: 'geojson',
      cluster: true,
      clusterRadius: 46,
      clusterMaxZoom: 15,
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });
  }

  if (!map.getLayer?.(POI_CLUSTER_LAYER_ID)) {
    map.addLayer({
      id: POI_CLUSTER_LAYER_ID,
      type: 'circle',
      source: POI_SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#1f2937',
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          16,
          9,
          19,
          20,
          22,
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.92,
      },
    });
  }

  if (!map.getLayer?.(POI_CLUSTER_COUNT_LAYER_ID)) {
    map.addLayer({
      id: POI_CLUSTER_COUNT_LAYER_ID,
      type: 'symbol',
      source: POI_SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-size': 11,
        'text-font': ['Noto Sans Regular'],
      },
      paint: {
        'text-color': '#ffffff',
      },
    });
  }

  if (!map.getLayer?.(POI_POINT_LAYER_ID)) {
    map.addLayer({
      id: POI_POINT_LAYER_ID,
      type: 'circle',
      source: POI_SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['coalesce', ['get', 'color'], '#2F6FED'],
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11,
          4,
          16,
          7,
          19,
          9,
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.96,
      },
    });
  }
}

function poiGeoJson(markers: MapSceneMarker[]) {
  return {
    type: 'FeatureCollection',
    features: markers
      .filter((marker) => marker.kind === 'place')
      .map((marker) => ({
        type: 'Feature',
        properties: {
          markerId: marker.id,
          label: marker.label ?? '',
          color: marker.color || '#2F6FED',
        },
        geometry: {
          type: 'Point',
          coordinates: [marker.longitude, marker.latitude],
        },
      })),
  };
}

function ensureRouteLayer(map: any): void {
  if (!map?.isStyleLoaded?.()) return;

  if (!map.getSource?.(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });
  }

  if (!map.getLayer?.(ROUTE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['get', 'width'],
        'line-opacity': ['coalesce', ['get', 'opacity'], 1],
      },
    });
  }
}

function linesGeoJson(lines: MapSceneLine[]) {
  return {
    type: 'FeatureCollection',
    features: lines
      .filter((line) => line.coordinates.length > 1)
      .map((line) => ({
        type: 'Feature',
        properties: {
          id: line.id,
          color: line.color,
          width: line.width,
          opacity: line.opacity ?? 1,
        },
        geometry: {
          type: 'LineString',
          coordinates: line.coordinates.map(([lat, lng]) => [lng, lat]),
        },
      })),
  };
}

export function VectorMapSurface({
  controllerRef,
  center,
  zoom,
  fitTo,
  styleUrl,
  markers,
  lines,
  navigationActive = false,
  navigationBearing = null,
  navigationPitch = 48,
  buildings3d = true,
  traffic = null,
  trafficEnabled = false,
  trafficStyle = 'light',
  trafficRevision = 0,
  pickMode = false,
  referenceCenter,
  onViewport,
  onMovedCenter,
  onMapClick,
  onFeatureClick,
  onMarkerClick,
  onManualPan,
  onReady,
  onError,
}: VectorMapSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initialViewRef = useRef({
    center,
    zoom,
    navigationActive,
    navigationBearing,
    navigationPitch,
  });
  const mapRef = useRef<any>(null);
  const mapLibreRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);
  const callbacksRef = useRef({
    pickMode,
    referenceCenter,
    onViewport,
    onMovedCenter,
    onMapClick,
    onFeatureClick,
    onMarkerClick,
    onManualPan,
  });
  const [styleRevision, setStyleRevision] = useState(0);

  callbacksRef.current = {
    pickMode,
    referenceCenter,
    onViewport,
    onMovedCenter,
    onMapClick,
    onFeatureClick,
    onMarkerClick,
    onManualPan,
  };

  const publishViewport = useCallback((map: any, moved: boolean) => {
    const bounds = map.getBounds?.();
    const mapCenter = map.getCenter?.();
    if (!bounds || !mapCenter) return;

    callbacksRef.current.onViewport({
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
      zoom: map.getZoom(),
    });

    if (!moved) return;

    const candidate = {
      latitude: mapCenter.lat,
      longitude: mapCenter.lng,
    };
    const ref = callbacksRef.current.referenceCenter;
    callbacksRef.current.onMovedCenter(
      distanceMeters(
        ref.latitude,
        ref.longitude,
        candidate.latitude,
        candidate.longitude,
      ) > 250
        ? candidate
        : null,
    );
  }, []);

  useEffect(() => {
    let disposed = false;
    let map: any = null;

    void loadMapLibreRuntime()
      .then((maplibregl) => {
        if (disposed || !containerRef.current) return;
        mapLibreRef.current = maplibregl;

        map = new maplibregl.Map({
          container: containerRef.current,
          style: styleUrl,
          center: [
            initialViewRef.current.center.longitude,
            initialViewRef.current.center.latitude,
          ],
          zoom: initialViewRef.current.zoom,
          pitch:
            initialViewRef.current.navigationActive &&
            initialViewRef.current.navigationBearing != null
              ? initialViewRef.current.navigationPitch
              : 0,
          bearing:
            initialViewRef.current.navigationActive &&
            initialViewRef.current.navigationBearing != null
              ? initialViewRef.current.navigationBearing
              : 0,
          attributionControl: true,
          antialias: true,
          cooperativeGestures: false,
        });
        mapRef.current = map;

        const controller: MapEngineController = {
          getZoom: () => map.getZoom(),
          setView: (point, targetZoom, options) => {
            map.easeTo({
              center: [point[1], point[0]],
              zoom: targetZoom ?? map.getZoom(),
              duration: options?.animate === false ? 0 : 450,
            });
          },
          flyTo: (point, targetZoom, options) => {
            map.flyTo({
              center: [point[1], point[0]],
              zoom: targetZoom ?? map.getZoom(),
              duration:
                options?.animate === false
                  ? 0
                  : Math.max(200, (options?.duration ?? 0.65) * 1000),
              essential: true,
            });
          },
          panTo: (point, options) => {
            map.easeTo({
              center: [point[1], point[0]],
              duration: options?.animate === false ? 0 : 350,
            });
          },
          fitBounds: (points, options) => {
            if (points.length < 2) return;
            const bounds = new maplibregl.LngLatBounds();
            for (const [lat, lng] of points) bounds.extend([lng, lat]);
            map.fitBounds(bounds, {
              padding: Math.max(
                options?.padding?.[0] ?? 48,
                options?.padding?.[1] ?? 48,
              ),
              duration: options?.animate === false ? 0 : 500,
            });
          },
          zoomIn: () => map.zoomIn({ duration: 220 }),
          zoomOut: () => map.zoomOut({ duration: 220 }),
          resize: () => map.resize(),
          setBearing: (bearing, options) => {
            map.easeTo({
              bearing,
              duration: options?.animate === false ? 0 : 320,
            });
          },
          setPitch: (pitch, options) => {
            map.easeTo({
              pitch,
              duration: options?.animate === false ? 0 : 320,
            });
          },
          getBearing: () => map.getBearing(),
          getPitch: () => map.getPitch(),
        };
        controllerRef.current = controller;

        map.on('load', () => {
          if (disposed) return;
          ensureRouteLayer(map);
          ensurePoiLayers(map);
          syncTrafficLayer(
            map,
            traffic,
            trafficEnabled,
            trafficStyle,
            trafficRevision,
          );
          if (buildings3d) add3dBuildings(map);
          setStyleRevision((value) => value + 1);
          publishViewport(map, false);
          onReady?.();
        });

        map.on('style.load', () => {
          if (disposed) return;
          ensureRouteLayer(map);
          ensurePoiLayers(map);
          syncTrafficLayer(
            map,
            traffic,
            trafficEnabled,
            trafficStyle,
            trafficRevision,
          );
          if (buildings3d) add3dBuildings(map);
          setStyleRevision((value) => value + 1);
        });

        map.on('dragstart', () => {
          callbacksRef.current.onManualPan?.();
        });

        map.on('moveend', () => publishViewport(map, true));
        map.on('zoomend', () => publishViewport(map, true));

        map.on('click', (event: any) => {
          const point = {
            latitude: event.lngLat.lat,
            longitude: event.lngLat.lng,
          };
          const currentZoom = map.getZoom();

          if (callbacksRef.current.pickMode) {
            void callbacksRef.current.onMapClick(point, currentZoom);
            return;
          }

          const renderedFeatures =
            map.queryRenderedFeatures?.(event.point) ?? [];

          const clusterFeature = renderedFeatures.find(
            (feature: any) =>
              feature?.layer?.id === POI_CLUSTER_LAYER_ID,
          );
          if (clusterFeature) {
            const source = map.getSource?.(POI_SOURCE_ID);
            const clusterId = Number(
              clusterFeature?.properties?.cluster_id,
            );
            if (
              source?.getClusterExpansionZoom &&
              Number.isFinite(clusterId)
            ) {
              Promise.resolve(
                source.getClusterExpansionZoom(clusterId),
              )
                .then((targetZoom: number) => {
                  map.easeTo({
                    center: event.lngLat,
                    zoom: Math.min(19, targetZoom),
                    duration: 380,
                  });
                })
                .catch(() => undefined);
            }
            return;
          }

          const poiFeature = renderedFeatures.find(
            (feature: any) =>
              feature?.layer?.id === POI_POINT_LAYER_ID,
          );
          if (poiFeature?.properties?.markerId) {
            callbacksRef.current.onMarkerClick?.(
              String(poiFeature.properties.markerId),
            );
            return;
          }

          const feature = chooseRenderedFeature(renderedFeatures);
          if (feature && callbacksRef.current.onFeatureClick) {
            const rendered: VectorRenderedFeature = {
              featureId: feature.id ?? null,
              source: feature.source ?? null,
              sourceLayer: feature.sourceLayer ?? null,
              layerId: feature.layer?.id ?? null,
              geometryType: feature.geometry?.type ?? null,
              latitude: point.latitude,
              longitude: point.longitude,
              name: featureName(feature),
              properties:
                feature.properties && typeof feature.properties === 'object'
                  ? feature.properties
                  : {},
              canonicalId: vectorFeatureCanonicalId({
                id: feature.id ?? null,
                source: feature.source ?? null,
                sourceLayer: feature.sourceLayer ?? null,
                properties:
                  feature.properties && typeof feature.properties === 'object'
                    ? feature.properties
                    : {},
              }),
            };
            void callbacksRef.current.onFeatureClick(rendered, currentZoom);
            return;
          }

          void callbacksRef.current.onMapClick(point, currentZoom);
        });
      })
      .catch((error) => {
        if (disposed) return;
        onError?.(
          error instanceof Error
            ? error
            : new Error('Vector map initialization failed'),
        );
      });

    return () => {
      disposed = true;
      markerRefs.current.forEach((marker) => marker.remove?.());
      markerRefs.current = [];
      if (controllerRef.current) controllerRef.current = null;
      if (map) map.remove?.();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [
    buildings3d,
    controllerRef,
    onError,
    onReady,
    publishViewport,
    styleUrl,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitTo?.length) return;
    map.easeTo({
      center: [center.longitude, center.latitude],
      zoom,
      duration: 360,
    });
  }, [center.latitude, center.longitude, zoom, fitTo]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = mapLibreRef.current;
    if (!map || !maplibregl || !fitTo || fitTo.length < 2) return;

    const bounds = new maplibregl.LngLatBounds();
    for (const [lat, lng] of fitTo) bounds.extend([lng, lat]);
    map.fitBounds(bounds, { padding: 48, duration: 500 });
  }, [fitTo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !navigationActive) return;

    if (navigationBearing != null && Number.isFinite(navigationBearing)) {
      map.easeTo({
        bearing: navigationBearing,
        pitch: navigationPitch,
        duration: 280,
      });
    }
  }, [navigationActive, navigationBearing, navigationPitch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return;

    ensureRouteLayer(map);
    const source = map.getSource?.(ROUTE_SOURCE_ID);
    source?.setData?.(linesGeoJson(lines));
  }, [lines, styleRevision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return;
    syncTrafficLayer(
      map,
      traffic,
      trafficEnabled,
      trafficStyle,
      trafficRevision,
    );
  }, [
    traffic?.configured,
    traffic?.provider,
    traffic?.attribution,
    traffic?.minZoom,
    traffic?.maxZoom,
    trafficEnabled,
    trafficStyle,
    trafficRevision,
    styleRevision,
  ]);

  const poiSignature = useMemo(
    () =>
      markers
        .filter((marker) => marker.kind === 'place')
        .map((marker) =>
          [
            marker.id,
            marker.latitude.toFixed(6),
            marker.longitude.toFixed(6),
            marker.color ?? '',
            marker.label ?? '',
          ].join(':'),
        )
        .join('|'),
    [markers],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return;

    ensurePoiLayers(map);
    const source = map.getSource?.(POI_SOURCE_ID);
    source?.setData?.(poiGeoJson(markers));
  }, [markers, poiSignature, styleRevision]);

  const markerSignature = useMemo(
    () =>
      markers
        .map((marker) =>
          [
            marker.id,
            marker.kind,
            marker.latitude.toFixed(6),
            marker.longitude.toFixed(6),
            marker.label ?? '',
            marker.color ?? '',
            marker.active ? '1' : '0',
            marker.count ?? '',
            marker.bearing ?? '',
          ].join(':'),
        )
        .join('|'),
    [markers],
  );

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = mapLibreRef.current;
    if (!map || !maplibregl) return;

    markerRefs.current.forEach((marker) => marker.remove?.());
    markerRefs.current = markers
      .filter(
        (marker) =>
          marker.kind !== 'place' && marker.kind !== 'cluster',
      )
      .map((marker) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'alsamos-vector-marker';
      element.style.cssText =
        'border:0;background:transparent;padding:0;margin:0;cursor:pointer;display:block;';
      element.innerHTML = markerHtml(marker);
      if (marker.label) {
        element.title = marker.label;
        element.setAttribute('aria-label', marker.label);
      } else {
        element.setAttribute('aria-label', 'Xarita belgisi');
      }

      element.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        callbacksRef.current.onMarkerClick?.(marker.id);
      });

      const instance = new maplibregl.Marker({
        element,
        anchor: markerAnchor(marker),
      })
        .setLngLat([marker.longitude, marker.latitude])
        .addTo(map);

      return instance;
    });

    return () => {
      markerRefs.current.forEach((marker) => marker.remove?.());
      markerRefs.current = [];
    };
    // markerSignature intentionally captures all visual marker changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerSignature, styleRevision]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-muted"
      data-map-engine="vector"
    />
  );
}

export default VectorMapSurface;
