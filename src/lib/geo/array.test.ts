import { describe, it, expect } from 'vitest';
import area from '@turf/area';
import bearing from '@turf/bearing';
import { point } from '@turf/helpers';
import {
  buildArray,
  footprintFt,
  layoutFor,
  arrayTrenchAnchor,
  panelGroundFt,
  rotateHandlePosition,
} from './array';
import {
  PANELS,
  RACKING,
  RACKING_PRESETS,
  INCHES_PER_FOOT,
  panelWidthFt,
  panelHeightFt,
} from '@/config/pricing';
import { degToRad, feetToMeters, METERS_PER_DEG_LAT, metersPerDegLng, type LngLat } from './units';

const FORT_WORTH: LngLat = [-97.3208, 32.7555];
const AMARILLO: LngLat = [-101.8313, 35.222];
const tier = 'standard' as const;

const sqFtToSqM = (sqFt: number) => sqFt / 3.280839895 ** 2;
const pctDiff = (actual: number, expected: number) => Math.abs(actual - expected) / expected;

/** Metres between two coordinates, planar. */
function distM(a: LngLat, b: LngLat) {
  const dx = (b[0] - a[0]) * metersPerDegLng((a[1] + b[1]) / 2);
  const dy = (b[1] - a[1]) * METERS_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

/**
 * Measure a hull's two axes independently, in feet.
 *
 * Area alone cannot catch a width/depth swap — 57x15 and 15x57 have identical
 * area. Ring order from rectPolygon is NW, NE, SE, SW, so edge 0->1 is the
 * across-table axis and edge 1->2 is the up-slope axis.
 */
function hullAxesFt(hull: GeoJSON.Feature<GeoJSON.Polygon>) {
  const ring = hull.geometry.coordinates[0] as LngLat[];
  const toFt = (m: number) => m * 3.280839895;
  return {
    widthFt: toFt(distM(ring[0], ring[1])),
    depthFt: toFt(distM(ring[1], ring[2])),
  };
}

describe('racking presets drive the footprint', () => {
  it('IronRidge is the default: landscape, 4 high, continuous table', () => {
    expect(RACKING.orientation).toBe('landscape');
    expect(RACKING.panelsHigh).toBe(4);
    expect(RACKING.panelGapIn).toBe(0.25);
  });

  it('40 panels on IronRidge is about 57 ft wide and 15 ft deep before tilt', () => {
    // The owner's sanity check. Numbers a tape measure can confirm on site.
    const fp = footprintFt(40, tier, RACKING_PRESETS.ironridge);
    expect(fp.cols).toBe(10);
    expect(fp.rows).toBe(4);
    expect(fp.widthFt).toBeGreaterThan(56);
    expect(fp.widthFt).toBeLessThan(58);
    expect(fp.slantDepthFt).toBeGreaterThan(14.5);
    expect(fp.slantDepthFt).toBeLessThan(15.5);
  });

  it('applies tilt to the ground depth but never to the width', () => {
    const r = RACKING_PRESETS.ironridge;
    const fp = footprintFt(40, tier, r);
    // Width is across the table and is unaffected by tilt.
    const across = panelWidthFt(PANELS[tier]); // short edge, up-slope in landscape
    expect(fp.depthFt).toBeLessThan(fp.slantDepthFt);
    expect(fp.depthFt / fp.slantDepthFt).toBeCloseTo(
      (4 * across * Math.cos(degToRad(r.tiltDeg)) + 3 * (r.panelGapIn / INCHES_PER_FOOT)) /
        (4 * across + 3 * (r.panelGapIn / INCHES_PER_FOOT)),
      3
    );
  });

  it('GFT is portrait and 2 high, giving a wider, shallower table', () => {
    const gft = footprintFt(40, tier, RACKING_PRESETS.gft);
    expect(gft.cols).toBe(20);
    expect(gft.rows).toBe(2);
    // Portrait puts the short edge across the table.
    expect(gft.widthFt).toBeGreaterThan(footprintFt(40, tier, RACKING_PRESETS.ironridge).widthFt);
  });

  it('picks the correct panel edge for each orientation', () => {
    const product = PANELS[tier];
    const landscape = panelGroundFt(tier, RACKING_PRESETS.ironridge);
    const portrait = panelGroundFt(tier, RACKING_PRESETS.gft);

    expect(landscape.acrossFt).toBeCloseTo(panelHeightFt(product), 6); // long edge
    expect(landscape.upSlopeFt).toBeCloseTo(panelWidthFt(product), 6); // short edge
    expect(portrait.acrossFt).toBeCloseTo(panelWidthFt(product), 6);
    expect(portrait.upSlopeFt).toBeCloseTo(panelHeightFt(product), 6);
  });
});

describe('hull dimensions per axis (an axis swap must fail here)', () => {
  for (const preset of ['ironridge', 'gft'] as const) {
    it(`hull width and depth match the config for ${preset}`, () => {
      const racking = RACKING_PRESETS[preset];
      const built = buildArray({ center: FORT_WORTH, azimuth: 180, panelCount: 40, tier }, racking);
      const axes = hullAxesFt(built.hull);

      expect(pctDiff(axes.widthFt, built.layout.widthFt)).toBeLessThan(0.01);
      expect(pctDiff(axes.depthFt, built.layout.depthFt)).toBeLessThan(0.01);
    });
  }

  it('IronRidge 40 panels measures ~57 ft across and ~13 ft deep on the ground', () => {
    const built = buildArray({ center: FORT_WORTH, azimuth: 180, panelCount: 40, tier });
    const axes = hullAxesFt(built.hull);

    expect(axes.widthFt).toBeGreaterThan(56);
    expect(axes.widthFt).toBeLessThan(58);
    // 14.96 ft of slant at the owner's 30 degree tilt is 12.96 ft of ground.
    expect(axes.depthFt).toBeGreaterThan(12.5);
    expect(axes.depthFt).toBeLessThan(13.2);
    // The table is much wider than it is deep; a swap would invert this.
    expect(axes.widthFt).toBeGreaterThan(axes.depthFt * 3);
  });

  it('keeps each axis on its own side after rotation', () => {
    const built = buildArray({ center: FORT_WORTH, azimuth: 95, panelCount: 40, tier });
    const axes = hullAxesFt(built.hull);
    expect(pctDiff(axes.widthFt, built.layout.widthFt)).toBeLessThan(0.01);
    expect(pctDiff(axes.depthFt, built.layout.depthFt)).toBeLessThan(0.01);
  });
});

describe('array footprint is to scale', () => {
  const { acrossFt, upSlopeGroundFt } = panelGroundFt(tier);
  const panelGroundAreaSqFt = acrossFt * upSlopeGroundFt;

  for (const panelCount of [24, 40, 7]) {
    it(`total panel area matches count x panel ground size - ${panelCount} panels`, () => {
      const built = buildArray({ center: FORT_WORTH, azimuth: 180, panelCount, tier });
      const totalSqM = built.panels.features.reduce((s, f) => s + area(f), 0);
      expect(built.panels.features).toHaveLength(panelCount);
      expect(pctDiff(totalSqM, sqFtToSqM(panelCount * panelGroundAreaSqFt))).toBeLessThan(0.01);
    });
  }

  it('hull area matches width x depth', () => {
    const built = buildArray({ center: FORT_WORTH, azimuth: 180, panelCount: 40, tier });
    const expected = sqFtToSqM(built.layout.widthFt * built.layout.depthFt);
    expect(pctDiff(area(built.hull), expected)).toBeLessThan(0.01);
  });
});

describe('scale is independent of map zoom', () => {
  it('produces identical geometry regardless of the zoom it is drawn at', () => {
    // Zoom is a display concern and is not an input to buildArray.
    const spec = { center: FORT_WORTH, azimuth: 180, panelCount: 24, tier };
    expect(buildArray(spec).hull.geometry).toEqual(buildArray(spec).hull.geometry);
  });

  it('holds its true ground area at a different latitude', () => {
    const spec = { azimuth: 180, panelCount: 24, tier };
    const south = buildArray({ ...spec, center: FORT_WORTH });
    const north = buildArray({ ...spec, center: AMARILLO });
    expect(pctDiff(area(north.hull), area(south.hull))).toBeLessThan(0.01);
  });
});

describe('rotation', () => {
  const spec = { center: FORT_WORTH, panelCount: 24, tier };

  it('preserves hull area at every azimuth', () => {
    const base = area(buildArray({ ...spec, azimuth: 180 }).hull);
    for (const azimuth of [0, 45, 90, 135, 180, 225, 270, 315, 359]) {
      expect(pctDiff(area(buildArray({ ...spec, azimuth }).hull), base)).toBeLessThan(0.01);
    }
  });

  it('actually moves the geometry rather than relabelling it', () => {
    expect(buildArray({ ...spec, azimuth: 90 }).hull.geometry).not.toEqual(
      buildArray({ ...spec, azimuth: 180 }).hull.geometry
    );
  });

  it('keeps the trench anchor on the array edge as it rotates', () => {
    const halfDepthM = feetToMeters(footprintFt(24, tier).depthFt) / 2;
    for (const azimuth of [0, 90, 180, 270]) {
      const anchor = arrayTrenchAnchor({ ...spec, azimuth });
      expect(pctDiff(distM(FORT_WORTH, anchor), halfDepthM)).toBeLessThan(0.01);
    }
  });
});

describe('layout', () => {
  it('grows sideways at a fixed height', () => {
    expect(layoutFor(40)).toEqual({ rows: 4, cols: 10 });
    expect(layoutFor(41)).toEqual({ rows: 4, cols: 11 });
    expect(layoutFor(3)).toEqual({ rows: 3, cols: 1 });
  });

  it('handles the empty array without dividing by zero', () => {
    expect(layoutFor(0)).toEqual({ rows: 0, cols: 0 });
    const fp = footprintFt(0, tier);
    expect(fp.widthFt).toBe(0);
    expect(fp.depthFt).toBe(0);
  });
});

describe('rotate handle bearing', () => {
  it('handle bearing from the centre equals the azimuth, with no offset', () => {
    // This is what lets the drag handler do setAzimuth(bearing(center, pointer))
    // directly. An offset here would rotate the array the wrong way.
    for (const azimuth of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const spec = { center: FORT_WORTH, azimuth, panelCount: 40, tier };
      const handle = rotateHandlePosition(spec);
      const measured = bearing(point(FORT_WORTH), point(handle));
      const normalized = ((measured % 360) + 360) % 360;
      expect(normalized).toBeCloseTo(azimuth, 1);
    }
  });

  it('sits beyond the array edge, not inside it', () => {
    const spec = { center: FORT_WORTH, azimuth: 180, panelCount: 40, tier };
    const handle = rotateHandlePosition(spec);
    const halfDepthM = feetToMeters(footprintFt(40, tier).depthFt) / 2;
    expect(distM(FORT_WORTH, handle)).toBeGreaterThan(halfDepthM);
  });

  it('a raw lng/lat angle would have been several degrees off in Texas', () => {
    // Documents why turf.bearing replaced atan2 on raw degree deltas.
    const spec = { center: FORT_WORTH, azimuth: 225, panelCount: 40, tier };
    const handle = rotateHandlePosition(spec);
    const naive =
      (Math.atan2(handle[0] - FORT_WORTH[0], handle[1] - FORT_WORTH[1]) * 180) / Math.PI;
    const naiveNorm = ((naive % 360) + 360) % 360;
    expect(Math.abs(naiveNorm - 225)).toBeGreaterThan(3);
  });
});
