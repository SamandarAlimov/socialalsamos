export type MapEngineId = 'raster' | 'vector';

export type MapLatLng = [number, number];

export interface MapViewport {
  south: number;
  west: number;
  north: number;
  east: number;
  zoom: number;
}

export interface MapCameraOptions {
  animate?: boolean;
  duration?: number;
}

export interface MapFitOptions {
  padding?: [number, number];
  animate?: boolean;
}

export interface MapEngineController {
  getZoom(): number;
  setView(
    point: MapLatLng,
    zoom?: number,
    options?: MapCameraOptions,
  ): void;
  flyTo(
    point: MapLatLng,
    zoom?: number,
    options?: MapCameraOptions,
  ): void;
  panTo(point: MapLatLng, options?: MapCameraOptions): void;
  fitBounds(points: MapLatLng[], options?: MapFitOptions): void;
  zoomIn(): void;
  zoomOut(): void;
  resize(): void;
  setBearing?(bearing: number, options?: MapCameraOptions): void;
  setPitch?(pitch: number, options?: MapCameraOptions): void;
  getBearing?(): number;
  getPitch?(): number;
}

export type MapSceneMarkerKind =
  | 'me'
  | 'navigation'
  | 'place'
  | 'selected'
  | 'cluster'
  | 'route-origin'
  | 'route-stop'
  | 'route-destination'
  | 'stop'
  | 'vehicle'
  | 'incident';

export interface MapSceneMarker {
  id: string;
  kind: MapSceneMarkerKind;
  latitude: number;
  longitude: number;
  label?: string | null;
  color?: string | null;
  active?: boolean;
  count?: number;
  bearing?: number | null;
}

export interface MapSceneLine {
  id: string;
  coordinates: MapLatLng[];
  color: string;
  width: number;
  opacity?: number;
}

export interface VectorRenderedFeature {
  featureId: string | number | null;
  source: string | null;
  sourceLayer: string | null;
  layerId: string | null;
  geometryType: string | null;
  latitude: number;
  longitude: number;
  name: string | null;
  properties: Record<string, unknown>;
  canonicalId: string | null;
}

const STORAGE_KEY = 'alsamos.map.engine';

function validEngine(value: unknown): value is MapEngineId {
  return value === 'raster' || value === 'vector';
}

export function readPreferredMapEngine(
  searchParams?: URLSearchParams | null,
): MapEngineId {
  const queryValue = searchParams?.get('mapEngine');
  if (validEngine(queryValue)) return queryValue;

  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (validEngine(stored)) return stored;
    } catch {
      // Storage optional.
    }
  }

  const envValue = String(import.meta.env.VITE_MAP_ENGINE ?? '').toLowerCase();
  return validEngine(envValue) ? envValue : 'raster';
}

export function writePreferredMapEngine(engine: MapEngineId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, engine);
  } catch {
    // Storage optional.
  }
}

export function vectorStyleUrl(dark = false): string {
  const explicit = String(import.meta.env.VITE_VECTOR_MAP_STYLE_URL ?? '').trim();
  if (explicit) return explicit;
  return dark
    ? 'https://tiles.openfreemap.org/styles/dark'
    : 'https://tiles.openfreemap.org/styles/liberty';
}

export function vectorFeatureCanonicalId(feature: {
  id?: string | number | null;
  source?: string | null;
  sourceLayer?: string | null;
  properties?: Record<string, unknown> | null;
}): string | null {
  const properties = feature.properties ?? {};
  const osmId =
    properties.osm_id ??
    properties.osmId ??
    properties['osm:id'] ??
    null;
  const rawType =
    properties.osm_type ??
    properties.osmType ??
    properties['osm:type'] ??
    null;

  const normalizedId = String(osmId ?? '').trim();
  const normalizedType = String(rawType ?? '').toLowerCase();
  if (/^\d+$/.test(normalizedId)) {
    const type =
      normalizedType === 'node' || normalizedType === 'n'
        ? 'node'
        : normalizedType === 'way' || normalizedType === 'w'
          ? 'way'
          : normalizedType === 'relation' || normalizedType === 'r'
            ? 'relation'
            : null;
    if (type) return 'osm:' + type + ':' + normalizedId;
  }

  // Vector provider feature ID remains useful for a single style/source, but
  // it is deliberately not promoted to an OSM canonical ID.
  return null;
}
