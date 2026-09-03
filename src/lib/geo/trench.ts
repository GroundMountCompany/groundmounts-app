import type { Feature, LineString } from 'geojson';
import { METERS_PER_DEG_LAT, metersPerDegLng, metersToFeet, type LngLat } from './units';
import { arrayTrenchAnchor, type ArraySpec } from './array';

/** Planar distance in metres. Exact enough at trench scale and allocation-free. */
export function distanceMeters(a: LngLat, b: LngLat): number {
  const midLat = (a[1] + b[1]) / 2;
  const dx = (b[0] - a[0]) * metersPerDegLng(midLat);
  const dy = (b[1] - a[1]) * METERS_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

/** Trench run in whole feet, array edge to meter. */
export function trenchFeet(arrayAnchor: LngLat, meter: LngLat): number {
  return Math.round(metersToFeet(distanceMeters(arrayAnchor, meter)));
}

export interface TrenchResult {
  line: Feature<LineString>;
  feet: number;
}

/**
 * Trench from the array's north edge to the meter.
 *
 * Measured from the array edge rather than its centre, because that is where
 * conduit actually leaves the racking — the v1 code measured centre-to-meter
 * and over-reported every run by half the array depth.
 */
export function buildTrench(spec: ArraySpec, meter: LngLat): TrenchResult {
  const anchor = arrayTrenchAnchor(spec);
  const feet = trenchFeet(anchor, meter);
  return {
    feet,
    line: {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [anchor, meter] },
      properties: { feet, label: `${feet} ft` },
    },
  };
}
