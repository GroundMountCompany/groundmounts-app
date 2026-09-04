/**
 * Upstream hosts, in one place.
 *
 * These move. PVWatts was served from developer.nrel.gov until the lab's
 * rename, and that hostname now fails to resolve at all — a hardcoded URL in a
 * route file meant every quote silently fell back to the generic Texas curve
 * with nothing in the logs but a DNS error. Keeping the host here means the
 * change is one line and the tests can assert it.
 */

export const PVWATTS = {
  /** api.data.gov gateway for the National Laboratory of the Rockies. */
  host: 'developer.nlr.gov',
  path: '/api/pvwatts/v8.json',
} as const;

export function pvwattsUrl(params: Record<string, string | number>): string {
  const url = new URL(`https://${PVWATTS.host}${PVWATTS.path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export const SSURGO = {
  host: 'sdmdataaccess.sc.egov.usda.gov',
  path: '/Tabular/post.rest',
} as const;

export const SSURGO_URL = `https://${SSURGO.host}${SSURGO.path}`;

export const MAPBOX = {
  host: 'api.mapbox.com',
  /** Terrain contours, used to sample elevation without loading a map. */
  tilequeryPath: '/v4/mapbox.mapbox-terrain-v2/tilequery',
} as const;

export function tilequeryUrl(lng: number, lat: number, token: string): string {
  return (
    `https://${MAPBOX.host}${MAPBOX.tilequeryPath}/${lng},${lat}.json` +
    `?layers=contour&limit=50&access_token=${token}`
  );
}
