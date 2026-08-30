import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchRoutesThrough,
  optimizeRouteWaypoints,
  formatKm,
  formatMinutes,
  maneuverText,
} from './routing';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('map routing presentation', () => {
  it('keeps common maneuver directions stable', () => {
    expect(
      maneuverText({ maneuver: 'turn', modifier: 'right', name: 'Navoiy ko‘chasi' }),
    ).toContain('O‘ngga buriling');
    expect(
      maneuverText({ maneuver: 'turn', modifier: 'left', name: 'Amir Temur ko‘chasi' }),
    ).toContain('Chapga buriling');
    expect(
      maneuverText({ maneuver: 'turn', modifier: 'uturn', name: '' }),
    ).toContain('Teskari buriling');
  });

  it('formats route distance without misleading precision', () => {
    expect(formatKm(240)).toBe('240 m');
    expect(formatKm(1250)).toBe('1.3 km');
    expect(formatKm(12800)).toBe('13 km');
  });

  it('formats route duration for short and long trips', () => {
    expect(formatMinutes(5 * 60)).toBe('5 daq');
    expect(formatMinutes(65 * 60)).toBe('1 soat 5 daq');
  });

  it('sends From-To-To checkpoints to OSRM in order', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          routes: [
            {
              distance: 3000,
              duration: 420,
              geometry: {
                coordinates: [
                  [69, 41],
                  [69.1, 41.1],
                  [69.2, 41.2],
                ],
              },
              legs: [
                { distance: 1200, duration: 180, steps: [] },
                { distance: 1800, duration: 240, steps: [] },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const routes = await fetchRoutesThrough('car', [
      { latitude: 41, longitude: 69 },
      { latitude: 41.1, longitude: 69.1 },
      { latitude: 41.2, longitude: 69.2 },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '69,41;69.1,41.1;69.2,41.2',
    );
    expect(routes[0].checkpointIndices).toHaveLength(3);
    expect(routes[0].legs).toEqual([
      { fromIndex: 0, toIndex: 1, distanceM: 1200, durationS: 180 },
      { fromIndex: 1, toIndex: 2, distanceM: 1800, durationS: 240 },
    ]);
  });

  it('keeps origin/final fixed while optimizing intermediate stops', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          waypoints: [
            { waypoint_index: 0 },
            { waypoint_index: 2 },
            { waypoint_index: 1 },
            { waypoint_index: 3 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const a = { latitude: 41, longitude: 69, name: 'A' };
    const first = { latitude: 41.1, longitude: 69.1, name: 'First' };
    const second = { latitude: 41.2, longitude: 69.2, name: 'Second' };
    const b = { latitude: 41.3, longitude: 69.3, name: 'B' };

    const optimized = await optimizeRouteWaypoints(
      'car',
      a,
      [first, second],
      b,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(optimized.map((item) => item.name)).toEqual(['Second', 'First']);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'roundtrip=false&source=first&destination=last',
    );
  });
});
