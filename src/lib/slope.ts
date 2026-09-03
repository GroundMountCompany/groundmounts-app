import type mapboxgl from 'mapbox-gl';
import { offsetMeters, feetToMeters, type LngLat } from './geo/units';
import { distanceMeters } from './geo/trench';

export type SlopeTier = 'Flat' | 'Rolling' | 'Steep' | 'Unknown';

export interface SlopeResult {
  percent: number | null;
  tier: SlopeTier;
  source: 'terrain' | 'tilequery' | 'unavailable';
}

/** Sample offsets (feet) around the array: centre plus four compass points. */
const SAMPLE_OFFSET_FT = 60;

export function tierFor(percent: number | null): SlopeTier {
  if (percent === null) return 'Unknown';
  if (percent < 5) return 'Flat';
  if (percent < 12) return 'Rolling';
  return 'Steep';
}

function samplePoints(center: LngLat): LngLat[] {
  const d = feetToMeters(SAMPLE_OFFSET_FT);
  return [
    center,
    offsetMeters(center, 0, d),
    offsetMeters(center, 0, -d),
    offsetMeters(center, d, 0),
    offsetMeters(center, -d, 0),
  ];
}

/**
 * Max grade across the sample points, as a percentage.
 *
 * Rise over the horizontal run between the extremes, which is what a site crew
 * cares about — an average would flatten a bank running through the array.
 */
export function gradeFrom(points: LngLat[], elevations: number[]): number | null {
  const valid = elevations
    .map((e, i) => ({ e, p: points[i] }))
    .filter((x) => typeof x.e === 'number' && Number.isFinite(x.e));
  if (valid.length < 2) return null;

  let worst = 0;
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const run = distanceMeters(valid[i].p, valid[j].p);
      if (run < 1) continue;
      worst = Math.max(worst, Math.abs(valid[i].e - valid[j].e) / run);
    }
  }
  return Math.round(worst * 1000) / 10;
}

/**
 * Slope at the array.
 *
 * Primary source is the map's own terrain DEM, which costs no network call and
 * no key. It returns null until terrain tiles have actually loaded, so the
 * Tilequery API is the fallback; if both fail the caller asks the user to pick
 * Flat / Rolling / Steep rather than blocking.
 */
export async function slopeAt(
  map: mapboxgl.Map | null,
  center: LngLat,
  token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
): Promise<SlopeResult> {
  const points = samplePoints(center);

  const terrain = points.map((p) => {
    try {
      return map?.queryTerrainElevation?.(p) ?? null;
    } catch {
      return null;
    }
  });

  if (terrain.every((e) => typeof e === 'number' && Number.isFinite(e))) {
    const percent = gradeFrom(points, terrain as number[]);
    if (percent !== null) return { percent, tier: tierFor(percent), source: 'terrain' };
  }

  const queried = await tilequeryElevations(points, token);
  if (queried) {
    const percent = gradeFrom(points, queried);
    if (percent !== null) return { percent, tier: tierFor(percent), source: 'tilequery' };
  }

  return { percent: null, tier: 'Unknown', source: 'unavailable' };
}

async function tilequeryElevations(
  points: LngLat[],
  token?: string
): Promise<number[] | null> {
  if (!token) return null;
  try {
    const results = await Promise.all(
      points.map(async ([lng, lat]) => {
        const url =
          `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/` +
          `${lng},${lat}.json?layers=contour&limit=50&access_token=${token}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) return null;
        const json = await res.json();
        const elevations: number[] = (json?.features ?? [])
          .map((f: { properties?: { ele?: number } }) => f?.properties?.ele)
          .filter((e: unknown): e is number => typeof e === 'number');
        return elevations.length ? Math.max(...elevations) : null;
      })
    );
    return results.every((e): e is number => typeof e === 'number') ? results : null;
  } catch {
    return null;
  }
}
