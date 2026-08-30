import { describe, expect, it } from 'vitest';
import {
  buildTaxiOffersWithProviders,
  providerFromRow,
  TAXI_PROVIDERS,
} from './taxiProviders';

const from = { latitude: 40.1, longitude: 67.2, label: 'A' };
const to = { latitude: 40.2, longitude: 67.3, label: 'B' };

describe('Alsamos Taxi Hub', () => {
  it('never estimates below provider minimum fare', () => {
    const offers = buildTaxiOffersWithProviders(
      TAXI_PROVIDERS.slice(0, 3),
      from,
      to,
      0.5,
      2,
    );

    for (const offer of offers) {
      expect(offer.estimate).toBeGreaterThanOrEqual(offer.provider.minFare);
    }
  });

  it('keeps pickup and destination in provider handoff links', () => {
    const yandex = TAXI_PROVIDERS.find((provider) => provider.slug === 'yandex_go');
    expect(yandex).toBeTruthy();

    const url = yandex!.build(from, to);
    expect(url).toContain('start-lat=40.1');
    expect(url).toContain('start-lon=67.2');
    expect(url).toContain('end-lat=40.2');
    expect(url).toContain('end-lon=67.3');
  });

  it('fills dynamic provider templates with A and B coordinates', () => {
    const provider = providerFromRow({
      slug: 'partner',
      name: 'Partner Taxi',
      deep_link:
        'https://taxi.example/order?from={fromLat},{fromLng}&to={toLat},{toLng}',
      min_fare: 7000,
    });

    expect(provider.build(from, to)).toBe(
      'https://taxi.example/order?from=40.1,67.2&to=40.2,67.3',
    );
  });
});
