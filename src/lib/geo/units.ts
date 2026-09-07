export type LngLat = [number, number];

export const FEET_PER_METER = 3.280839895;
export const METERS_PER_DEG_LAT = 111_320;

export function feetToMeters(ft: number): number {
  return ft / FEET_PER_METER;
}

export function metersToFeet(m: number): number {
  return m * FEET_PER_METER;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Metres per degree of longitude at a given latitude. Longitude degrees shrink
 * toward the poles, which is the whole reason a fixed pixel scale factor (the
 * v1 `* 1.8` fudge) could never be correct at more than one place and zoom.
 */
export function metersPerDegLng(latitude: number): number {
  return METERS_PER_DEG_LAT * Math.cos(degToRad(latitude));
}

/**
 * Offset a coordinate by a local east/north vector in metres.
 *
 * Equirectangular approximation: exact enough over the ~30 m span of a solar
 * array (sub-millimetre), and it costs one cosine for the whole array rather
 * than a geodesic call per corner.
 */
export function offsetMeters(origin: LngLat, eastM: number, northM: number): LngLat {
  const [lng, lat] = origin;
  return [
    lng + eastM / metersPerDegLng(lat),
    lat + northM / METERS_PER_DEG_LAT,
  ];
}

/** Rotate a local east/north vector clockwise by `bearingDeg` (0 = north). */
export function rotateEastNorth(
  eastM: number,
  northM: number,
  bearingDeg: number
): [number, number] {
  const r = degToRad(bearingDeg);
  const sin = Math.sin(r);
  const cos = Math.cos(r);
  // Clockwise rotation in the east/north plane.
  return [eastM * cos + northM * sin, -eastM * sin + northM * cos];
}
