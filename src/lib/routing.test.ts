import { describe, expect, it } from 'vitest';
import { formatKm, formatMinutes, maneuverText } from './routing';

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
});
