import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Settings LocationPicker manual map selection', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/settings/LocationPicker.tsx'),
    'utf8',
  );

  it('offers map selection without requiring geolocation first', () => {
    expect(source).toContain("const [mapOpen, setMapOpen] = useState(false)");
    expect(source).toContain("Xaritadan tanlash");
    expect(source).toContain('const mapCenter = coords ?? WORLD_MAP_CENTER');
    expect(source).toContain('const mapZoom = coords ? 15 : 2');
  });

  it('lets any map click resolve and update the profile location', () => {
    expect(source).toContain('pickMode');
    expect(source).toContain('onMapClick={handleMapPick}');
    expect(source).toContain('setCoords(point)');
    expect(source).toContain('resolveMapClickPlace(point, zoom)');
    expect(source).toContain("Xaritadagi kerakli nuqtani bosing");
  });

  it('keeps manual picking available if geolocation is denied', () => {
    expect(source).toContain("Joylashuvga ruxsat berilmadi. Xaritadan qo‘lda tanlashingiz mumkin.");
    expect(source).toContain('setMapOpen(true)');
  });
});
