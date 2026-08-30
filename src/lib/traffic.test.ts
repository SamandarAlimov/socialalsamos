import { describe, expect, it } from 'vitest';

import {
  trafficIncidentColor,
  trafficIncidentLabel,
  trafficTileTemplate,
} from './traffic';

describe('traffic provider client contract', () => {
  it('uses the Alsamos server gateway instead of exposing provider keys', () => {
    const url = trafficTileTemplate('light');
    expect(url).toContain('/api/traffic?action=tile');
    expect(url).toContain('style=light');
    expect(url).toContain('z={z}');
    expect(url).not.toMatch(/key=/i);
    expect(url).not.toContain('tomtom.com');
  });

  it('keeps dark traffic styling renderer-independent', () => {
    expect(trafficTileTemplate('dark')).toContain('style=dark');
  });

  it('keeps traffic incident labels and colors deterministic', () => {
    const incident = {
      id: 'incident-1',
      category: 'road_closed' as const,
      magnitude: 3,
      delayS: 180,
      lengthM: 700,
      roadNumbers: [],
      latitude: 41.3,
      longitude: 69.2,
    };

    expect(trafficIncidentLabel(incident)).toBe('Yo‘l yopilgan');
    expect(trafficIncidentColor(incident.category)).toBe('#DC2626');
  });
});
