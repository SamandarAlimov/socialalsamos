import { describe, expect, it } from 'vitest';
import {
  vectorFeatureCanonicalId,
  type VectorRenderedFeature,
} from './mapEngine';

describe('map engine identity bridge', () => {
  it('promotes explicit OSM vector properties to canonical identity', () => {
    expect(
      vectorFeatureCanonicalId({
        id: 42,
        source: 'openmaptiles',
        sourceLayer: 'poi',
        properties: {
          osm_type: 'node',
          osm_id: 123456,
        },
      }),
    ).toBe('osm:node:123456');
  });

  it('does not pretend provider-local vector ids are OSM canonical ids', () => {
    const feature: VectorRenderedFeature = {
      featureId: 777,
      source: 'openmaptiles',
      sourceLayer: 'building',
      layerId: 'building',
      geometryType: 'Polygon',
      latitude: 40.1,
      longitude: 67.2,
      name: 'Bino',
      properties: {},
      canonicalId: null,
    };

    expect(
      vectorFeatureCanonicalId({
        id: feature.featureId,
        source: feature.source,
        sourceLayer: feature.sourceLayer,
        properties: feature.properties,
      }),
    ).toBeNull();
  });
});
