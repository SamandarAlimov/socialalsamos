import { describe, expect, it } from 'vitest';

import { trafficTileTemplate } from './traffic';

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
});
