import { describe, it, expect } from 'vitest';
import booleanIntersects from '@turf/boolean-intersects';
import type { Feature, Polygon } from 'geojson';
import { autoPlaceArray } from './place';
import { buildArray, footprintFt } from './array';
import { distanceMeters, trenchFeet, buildTrench } from './trench';
import { metersToFeet, offsetMeters, type LngLat } from './units';

const METER: LngLat = [-97.3208, 32.7555];
const base = { panelCount: 24, tier: 'standard' as const, azimuth: 180 };

/** A building footprint centred `offsetM` north of the meter. */
function buildingNorthOf(meter: LngLat, northM: number, sizeM = 30): Feature<Polygon> {
  const c = offsetMeters(meter, 0, northM);
  const h = sizeM / 2;
  const ring = [
    offsetMeters(c, -h, h),
    offsetMeters(c, h, h),
    offsetMeters(c, h, -h),
    offsetMeters(c, -h, -h),
  ];
  ring.push(ring[0]);
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} };
}

describe('auto-placement', () => {
  it('never drops the array on top of the meter', () => {
    // The v1 tool spawned panels at the meter, giving a 0 ft trench.
    const { center } = autoPlaceArray({ meter: METER, ...base });
    const fp = footprintFt(base.panelCount, base.tier);
    const clearanceFt = metersToFeet(distanceMeters(center, METER));

    expect(clearanceFt).toBeGreaterThan(Math.max(fp.widthFt, fp.heightFt) / 2);
    expect(trenchFeet(center, METER)).toBeGreaterThan(0);
  });

  it('prefers a spot south of the meter', () => {
    const { center } = autoPlaceArray({ meter: METER, ...base });
    expect(center[1]).toBeLessThan(METER[1]);
    expect(Math.abs(center[0] - METER[0])).toBeLessThan(0.0005);
  });

  it('avoids a building that sits on the preferred spot', () => {
    // Put the house exactly where the array would otherwise go.
    const house = buildingNorthOf(METER, -25, 40);
    const placed = autoPlaceArray({ meter: METER, ...base, obstacles: [house] });
    const { hull } = buildArray({ center: placed.center, ...base });

    expect(booleanIntersects(hull, house)).toBe(false);
    expect(placed.compromised).toBe(false);
  });

  it('reports a compromise when every candidate is blocked', () => {
    // A slab covering everything within any candidate radius.
    const slab = buildingNorthOf(METER, 0, 400);
    const placed = autoPlaceArray({ meter: METER, ...base, obstacles: [slab] });
    expect(placed.compromised).toBe(true);
  });

  it('is deterministic', () => {
    const a = autoPlaceArray({ meter: METER, ...base });
    const b = autoPlaceArray({ meter: METER, ...base });
    expect(a.center).toEqual(b.center);
  });

  it('pushes a larger array further out so it still clears the meter', () => {
    const small = autoPlaceArray({ meter: METER, ...base, panelCount: 8 });
    const large = autoPlaceArray({ meter: METER, ...base, panelCount: 120 });
    expect(distanceMeters(large.center, METER)).toBeGreaterThan(
      distanceMeters(small.center, METER)
    );
  });
});

describe('trench', () => {
  it('measures from the array edge, not its centre', () => {
    const spec = { center: offsetMeters(METER, 0, -40), ...base };
    const { feet } = buildTrench(spec, METER);
    const centreFeet = trenchFeet(spec.center, METER);

    // The edge is closer to the meter than the centre is.
    expect(feet).toBeLessThan(centreFeet);
    expect(feet).toBeGreaterThan(0);
  });

  it('emits a two-point line ending at the meter, labelled in feet', () => {
    const spec = { center: offsetMeters(METER, 0, -40), ...base };
    const { line, feet } = buildTrench(spec, METER);
    const coords = line.geometry.coordinates;

    expect(coords).toHaveLength(2);
    expect(coords[1]).toEqual(METER);
    expect(line.properties?.label).toBe(`${feet} ft`);
  });

  it('grows as the array is dragged away', () => {
    const near = buildTrench({ center: offsetMeters(METER, 0, -30), ...base }, METER);
    const far = buildTrench({ center: offsetMeters(METER, 0, -90), ...base }, METER);
    expect(far.feet).toBeGreaterThan(near.feet);
  });
});
