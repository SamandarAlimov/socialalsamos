import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchRoutesThrough,
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
                { steps: [] },
                { steps: [] },
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
  });
});
