import booleanIntersects from '@turf/boolean-intersects';
import type { Feature, Polygon } from 'geojson';
import { buildArray, footprintFt, type ArraySpec } from './array';
import { feetToMeters, offsetMeters, type LngLat } from './units';
import { distanceMeters } from './trench';

/** Radii (feet) from the meter to try, nearest first. */
const RADII_FT = [40, 70, 100, 140];
/** 24 bearings, 15 degrees apart. */
const BEARINGS = Array.from({ length: 24 }, (_, i) => i * 15);
/** Keep the array off the meter and whatever it is bolted to. */
const METER_CLEARANCE_FT = 25;

export interface PlacementInput {
  meter: LngLat;
  panelCount: number;
  tier: ArraySpec['tier'];
  azimuth: number;
  /** Building footprints from the basemap, used to avoid the house. */
  obstacles?: Array<Feature<Polygon>>;
}

export interface PlacementResult {
  center: LngLat;
  /** True when every candidate overlapped something and we took the least bad. */
  compromised: boolean;
}

/**
 * Pick a spot for the array.
 *
 * Candidates are scored on: overlapping a building (disqualifying if avoidable),
 * crowding the meter, and trench length. Prefers bearings south of the meter so
 * the run leaves the array's north edge and the panels are not shaded by the
 * house. Deterministic, so it is testable against fixture geometry.
 */
export function autoPlaceArray(input: PlacementInput): PlacementResult {
  const { meter, panelCount, tier, azimuth, obstacles = [] } = input;
  const fp = footprintFt(panelCount, tier);
  // Enough room that the array body never sits on the meter.
  const minRadiusFt = METER_CLEARANCE_FT + Math.max(fp.widthFt, fp.heightFt) / 2;

  let best: { center: LngLat; score: number; hits: boolean } | null = null;

  for (const radiusFt of RADII_FT) {
    const effectiveFt = Math.max(radiusFt, minRadiusFt);
    for (const bearing of BEARINGS) {
      const rad = (bearing * Math.PI) / 180;
      const center = offsetMeters(
        meter,
        feetToMeters(effectiveFt) * Math.sin(rad),
        feetToMeters(effectiveFt) * Math.cos(rad)
      );

      const { hull } = buildArray({ center, azimuth, panelCount, tier });
      const hits = obstacles.some((o) => booleanIntersects(hull, o));

      // Due south of the meter is bearing 180; penalise deviation from it.
      const southness = Math.abs(((bearing - 180 + 540) % 360) - 180) / 180;
      const trenchM = distanceMeters(center, meter);

      const score =
        (hits ? 1000 : 0) + southness * 40 + trenchM * 0.5;

      if (!best || score < best.score) best = { center, score, hits };
    }
  }

  // BEARINGS x RADII is non-empty, so `best` is always assigned.
  return { center: best!.center, compromised: best!.hits };
}
