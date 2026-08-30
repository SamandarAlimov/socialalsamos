import { describe, expect, it } from 'vitest';
import { canonicalPlaceId, type MapPlace } from './mapPlaces';

describe('canonical map place identity', () => {
  it('prefers provider-independent OSM identity', () => {
    const place = {
      id: 'photon/12345',
      source: 'photon',
      canonicalId: 'osm:node:12345',
      name: 'Test place',
      latitude: 41.31,
      longitude: 69.24,
    } as MapPlace;

    expect(canonicalPlaceId(place)).toBe('osm:node:12345');
  });

  it('extracts OSM identity from overpass-style ids', () => {
    const place = {
      id: 'way/998877',
      source: 'overpass',
      name: 'Bir joy',
      latitude: 40.1,
      longitude: 67.2,
    } as MapPlace;

    expect(canonicalPlaceId(place)).toBe('osm:way:998877');
  });

  it('uses a stable geo fingerprint when provider has no OSM id', () => {
    const place = {
      id: 'photon/local',
      source: 'photon',
      name: 'Rahimjon Ota Masjidi',
      latitude: 40.123456,
      longitude: 67.654321,
    } as MapPlace;

    expect(canonicalPlaceId(place)).toBe(
      'geo:40.12346,67.65432:rahimjon-ota-masjidi',
    );
  });
});
