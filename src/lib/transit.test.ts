import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchStopRoutes } from './transit';

describe('transit arrival integrity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never turns OSM interval metadata into fake ETA values', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          elements: [
            {
              id: 123,
              type: 'relation',
              tags: {
                type: 'route',
                route: 'bus',
                ref: '12',
                name: '12-avtobus',
                interval: '00:10:00',
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const routes = await fetchStopRoutes('node/999');
    expect(routes).toHaveLength(1);
    expect(routes[0].intervalMin).toBe(10);
    expect(routes[0].nextArrivalsMin).toEqual([]);
    expect(routes[0].realtime).toBe(false);
  });
});
