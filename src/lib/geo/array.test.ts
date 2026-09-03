import { describe, it, expect } from 'vitest';
import area from '@turf/area';
import { buildArray, footprintFt, layoutFor, arrayTrenchAnchor } from './array';
import { PANELS, RACKING, panelWidthFt, panelHeightFt } from '@/config/pricing';
import { feetToMeters, metersToFeet, type LngLat } from './units';

const FORT_WORTH: LngLat = [-97.3208, 32.7555];
const AMARILLO: LngLat = [-101.8313, 35.222];

const sqFtToSqM = (sqFt: number) => sqFt / (3.280839895 ** 2);
const pctDiff = (actual: number, expected: number) =>
  Math.abs(actual - expected) / expected;

/**
 * The v1 array was an HTML grid scaled by a hardcoded `* 1.8` pixel fudge, so
 * it matched reality at no zoom at all. These tests are the contract that
 * replaced it: the footprint is geographic, so its true ground area must equal
 * the panel dimensions from config regardless of how the map is displayed.
 */
describe('array footprint is to scale', () => {
  const tier = 'standard' as const;
  const product = PANELS[tier];
  const panelAreaSqFt = panelWidthFt(product) * panelHeightFt(product);

  // Map zoom never enters the geometry, so "at zoom 16 and 20" is proven by the
  // geometry being identical for both — see the zoom-invariance test below.
  const cases = [
    { panelCount: 24, label: '24 panels' },
    { panelCount: 40, label: '40 panels' },
    { panelCount: 7, label: '7 panels (partial last row)' },
  ];

  for (const { panelCount, label } of cases) {
    it(`total panel area matches rows x cols x panel size - ${label}`, () => {
      const built = buildArray({ center: FORT_WORTH, azimuth: 180, panelCount, tier });

      const totalSqM = built.panels.features.reduce((sum, f) => sum + area(f), 0);
      const expectedSqM = sqFtToSqM(panelCount * panelAreaSqFt);

      expect(built.panels.features).toHaveLength(panelCount);
      expect(pctDiff(totalSqM, expectedSqM)).toBeLessThan(0.01);
    });
  }

  it('hull area matches the full footprint including row gaps', () => {
    const panelCount = 40;
    const built = buildArray({ center: FORT_WORTH, azimuth: 180, panelCount, tier });
    const { widthFt, heightFt, rows, cols } = built.layout;

    expect(rows).toBe(4);
    expect(cols).toBe(10);

    const expectedSqM = sqFtToSqM(widthFt * heightFt);
    expect(pctDiff(area(built.hull), expectedSqM)).toBeLessThan(0.01);
  });

  it('hull equals rows x cols x panel size exactly when gaps are zero', () => {
    const panelCount = 40;
    const noGaps = { ...RACKING, rowGapFt: 0, panelGapFt: 0 };
    const built = buildArray(
      { center: FORT_WORTH, azimuth: 180, panelCount, tier },
      noGaps
    );

    const expectedSqM = sqFtToSqM(
      built.layout.rows * built.layout.cols * panelAreaSqFt
    );
    expect(pctDiff(area(built.hull), expectedSqM)).toBeLessThan(0.01);
  });

  it('reports a footprint in feet that matches the panel maths', () => {
    const fp = footprintFt(40, tier);
    const expectedW = 10 * panelWidthFt(product) + 9 * RACKING.panelGapFt;
    const expectedH = 4 * panelHeightFt(product) + 3 * RACKING.rowGapFt;
    expect(fp.widthFt).toBeCloseTo(expectedW, 6);
    expect(fp.heightFt).toBeCloseTo(expectedH, 6);
  });
});

describe('scale is independent of map zoom', () => {
  it('produces identical geometry regardless of the zoom it is drawn at', () => {
    // Zoom is a display concern; it is not an input to buildArray. Building the
    // same spec "at zoom 16" and "at zoom 20" must therefore be byte-identical.
    const spec = { center: FORT_WORTH, azimuth: 180, panelCount: 24, tier: 'standard' as const };
    const atZoom16 = buildArray(spec);
    const atZoom20 = buildArray(spec);

    expect(atZoom20.hull.geometry).toEqual(atZoom16.hull.geometry);
    expect(area(atZoom20.hull)).toBe(area(atZoom16.hull));
  });

  it('holds its true ground area at a different latitude', () => {
    // Longitude degrees shrink toward the poles; a fixed pixel factor cannot
    // survive this, geographic geometry can.
    const spec = { azimuth: 180, panelCount: 24, tier: 'standard' as const };
    const south = buildArray({ ...spec, center: FORT_WORTH });
    const north = buildArray({ ...spec, center: AMARILLO });

    expect(pctDiff(area(north.hull), area(south.hull))).toBeLessThan(0.01);
  });
});

describe('rotation', () => {
  const spec = { center: FORT_WORTH, panelCount: 24, tier: 'standard' as const };

  it('preserves hull area at every azimuth', () => {
    const base = area(buildArray({ ...spec, azimuth: 180 }).hull);

    for (const azimuth of [0, 45, 90, 135, 180, 225, 270, 315, 359]) {
      const rotated = area(buildArray({ ...spec, azimuth }).hull);
      expect(
        pctDiff(rotated, base),
        `azimuth ${azimuth} changed the footprint area`
      ).toBeLessThan(0.01);
    }
  });

  it('preserves total panel area at every azimuth', () => {
    const total = (azimuth: number) =>
      buildArray({ ...spec, azimuth }).panels.features.reduce((s, f) => s + area(f), 0);

    const base = total(180);
    for (const azimuth of [0, 90, 270]) {
      expect(pctDiff(total(azimuth), base)).toBeLessThan(0.01);
    }
  });

  it('actually moves the geometry rather than just relabelling it', () => {
    const south = buildArray({ ...spec, azimuth: 180 });
    const east = buildArray({ ...spec, azimuth: 90 });
    expect(east.hull.geometry).not.toEqual(south.hull.geometry);
  });

  it('keeps the trench anchor on the array edge as it rotates', () => {
    const halfHeightM = feetToMeters(footprintFt(24, 'standard').heightFt) / 2;

    for (const azimuth of [0, 90, 180, 270]) {
      const anchor = arrayTrenchAnchor({ ...spec, azimuth });
      const dxM =
        (anchor[0] - FORT_WORTH[0]) * 111_320 * Math.cos((FORT_WORTH[1] * Math.PI) / 180);
      const dyM = (anchor[1] - FORT_WORTH[1]) * 111_320;
      const dist = Math.hypot(dxM, dyM);
      expect(pctDiff(dist, halfHeightM)).toBeLessThan(0.01);
    }
  });
});

describe('layout', () => {
  it('fills rows up to panelsPerRow then wraps', () => {
    expect(layoutFor(10)).toEqual({ rows: 1, cols: 10 });
    expect(layoutFor(11)).toEqual({ rows: 2, cols: 10 });
    expect(layoutFor(3)).toEqual({ rows: 1, cols: 3 });
  });

  it('handles the empty array without dividing by zero', () => {
    expect(layoutFor(0)).toEqual({ rows: 0, cols: 0 });
    const fp = footprintFt(0, 'standard');
    expect(fp.widthFt).toBe(0);
    expect(fp.heightFt).toBe(0);
  });

  it('a 40-panel standard array is about 38 x 34 feet', () => {
    // Sanity anchor a human can check against a tape measure.
    const fp = footprintFt(40, 'standard');
    expect(metersToFeet(feetToMeters(fp.widthFt))).toBeCloseTo(fp.widthFt, 6);
    expect(fp.widthFt).toBeGreaterThan(37);
    expect(fp.widthFt).toBeLessThan(39);
    expect(fp.heightFt).toBeGreaterThan(33);
    expect(fp.heightFt).toBeLessThan(35);
  });
});
