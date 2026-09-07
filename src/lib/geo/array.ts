import type { Feature, FeatureCollection, Polygon } from 'geojson';
import {
  PANELS,
  RACKING,
  INCHES_PER_FOOT,
  panelWidthFt,
  panelHeightFt,
  type PanelTier,
  type RackingConfig,
} from '@/config/pricing';
import {
  degToRad,
  feetToMeters,
  offsetMeters,
  rotateEastNorth,
  type LngLat,
} from './units';

export interface ArraySpec {
  /** Geographic centre of the array. */
  center: LngLat;
  /** Compass bearing the panels face. 180 = due south. */
  azimuth: number;
  panelCount: number;
  tier: PanelTier;
}

export interface ArrayLayout {
  /** Panels stacked up the slope. */
  rows: number;
  /** Panels across the table. */
  cols: number;
  panelCount: number;
  /** Across the table, feet. */
  widthFt: number;
  /** Up the slope, projected onto the ground (tilt applied), feet. */
  depthFt: number;
  /** Depth before tilt is applied — the slant length. */
  slantDepthFt: number;
}

/** Ground dimensions of a single panel for this racking. */
export function panelGroundFt(
  tier: PanelTier,
  racking: RackingConfig = RACKING
): { acrossFt: number; upSlopeFt: number; upSlopeGroundFt: number } {
  const product = PANELS[tier];
  const shortFt = panelWidthFt(product);
  const longFt = panelHeightFt(product);

  // Landscape lays the long edge across the table; portrait stands it up.
  const acrossFt = racking.orientation === 'landscape' ? longFt : shortFt;
  const upSlopeFt = racking.orientation === 'landscape' ? shortFt : longFt;

  return {
    acrossFt,
    upSlopeFt,
    upSlopeGroundFt: upSlopeFt * Math.cos(degToRad(racking.tiltDeg)),
  };
}

/**
 * Columns across and panels high.
 *
 * The table is `panelsHigh` panels deep and grows sideways, which is how a
 * ground mount is actually built — not a square-ish block.
 */
export function layoutFor(
  panelCount: number,
  racking: RackingConfig = RACKING
): { rows: number; cols: number } {
  if (panelCount <= 0) return { rows: 0, cols: 0 };
  const high = Math.max(1, racking.panelsHigh);
  return {
    cols: Math.ceil(panelCount / high),
    rows: Math.min(high, panelCount),
  };
}

/** Footprint of the array in feet. */
export function footprintFt(
  panelCount: number,
  tier: PanelTier,
  racking: RackingConfig = RACKING
): ArrayLayout {
  const { rows, cols } = layoutFor(panelCount, racking);
  const { acrossFt, upSlopeFt, upSlopeGroundFt } = panelGroundFt(tier, racking);
  const gapFt = racking.panelGapIn / INCHES_PER_FOOT;

  const widthFt = cols > 0 ? cols * acrossFt + (cols - 1) * gapFt : 0;
  const slantDepthFt = rows > 0 ? rows * upSlopeFt + (rows - 1) * gapFt : 0;
  const depthFt = rows > 0 ? rows * upSlopeGroundFt + (rows - 1) * gapFt : 0;

  return { rows, cols, panelCount, widthFt, depthFt, slantDepthFt };
}

function rectPolygon(
  center: LngLat,
  east: number,
  north: number,
  widthM: number,
  depthM: number,
  azimuth: number,
  properties: Record<string, unknown> = {}
): Feature<Polygon> {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const corners: Array<[number, number]> = [
    [east - hw, north + hd],
    [east + hw, north + hd],
    [east + hw, north - hd],
    [east - hw, north - hd],
  ];

  // 180 (due south) is the neutral orientation, so rotate by the offset from it.
  const spin = azimuth - 180;
  const ring = corners.map(([e, n]) => {
    const [re, rn] = rotateEastNorth(e, n, spin);
    return offsetMeters(center, re, rn);
  });
  ring.push(ring[0]);

  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties,
  };
}

export interface BuiltArray {
  panels: FeatureCollection<Polygon>;
  hull: Feature<Polygon>;
  layout: ArrayLayout;
}

/**
 * Build the array geometry.
 *
 * Derived from real panel dimensions and the racking preset, emitted as
 * geographic coordinates, so the footprint is correct at every zoom and
 * latitude by construction. Rotation is a parameter, not a CSS transform.
 */
export function buildArray(spec: ArraySpec, racking: RackingConfig = RACKING): BuiltArray {
  const layout = footprintFt(spec.panelCount, spec.tier, racking);
  const { acrossFt, upSlopeGroundFt } = panelGroundFt(spec.tier, racking);
  const gapFt = racking.panelGapIn / INCHES_PER_FOOT;

  const pw = feetToMeters(acrossFt);
  const pd = feetToMeters(upSlopeGroundFt);
  const colPitch = pw + feetToMeters(gapFt);
  const rowPitch = pd + feetToMeters(gapFt);

  const totalW = feetToMeters(layout.widthFt);
  const totalD = feetToMeters(layout.depthFt);

  const panels: Array<Feature<Polygon>> = [];
  let placed = 0;
  for (let c = 0; c < layout.cols; c++) {
    for (let r = 0; r < layout.rows && placed < layout.panelCount; r++, placed++) {
      panels.push(
        rectPolygon(
          spec.center,
          -totalW / 2 + pw / 2 + c * colPitch,
          // Row 0 at the north edge, so the trench leaves from the top.
          totalD / 2 - pd / 2 - r * rowPitch,
          pw,
          pd,
          spec.azimuth,
          { panelIndex: placed }
        )
      );
    }
  }

  const hull = rectPolygon(spec.center, 0, 0, totalW, totalD, spec.azimuth, {
    kind: 'array-hull',
  });

  return { panels: { type: 'FeatureCollection', features: panels }, hull, layout };
}

/**
 * Padding around the array used purely for touch hit-testing.
 *
 * An IronRidge table is ~13.6 ft deep, which at zoom 18 is about 8px on screen.
 * Nobody can reliably land a fingertip on that, so the grabbable region is
 * inflated well beyond the drawn footprint.
 */
export const ARRAY_HIT_PAD_FT = 25;

/** The array footprint inflated by ARRAY_HIT_PAD_FT, for drag hit-testing. */
export function buildArrayHitArea(
  spec: ArraySpec,
  racking: RackingConfig = RACKING
): Feature<Polygon> {
  const layout = footprintFt(spec.panelCount, spec.tier, racking);
  return rectPolygon(
    spec.center,
    0,
    0,
    feetToMeters(layout.widthFt + 2 * ARRAY_HIT_PAD_FT),
    feetToMeters(layout.depthFt + 2 * ARRAY_HIT_PAD_FT),
    spec.azimuth,
    { kind: 'array-hit' }
  );
}

/**
 * Fallback grip offset, in feet, used when no map is available to derive one.
 *
 * A fixed ground distance is wrong at the extremes — 60 ft is about 5px at zoom
 * 15 and 290px at zoom 21 — so callers with a map should pass an offset derived
 * from a constant screen radius instead. See handleOffsetFt() in the map layer.
 */
export const ROTATE_HANDLE_OFFSET_FT = 60;

/**
 * The rotate grip, held off the array's south edge.
 *
 * Because it rides due south in the array's own frame, its compass bearing from
 * the centre is exactly the array azimuth — which is what lets the drag handler
 * set azimuth directly from `turf.bearing(center, pointer)` with no offset.
 */
export function rotateHandlePosition(
  spec: ArraySpec,
  racking: RackingConfig = RACKING,
  offsetFt: number = ROTATE_HANDLE_OFFSET_FT
): LngLat {
  const layout = footprintFt(spec.panelCount, spec.tier, racking);
  const south = -(feetToMeters(layout.depthFt) / 2 + feetToMeters(offsetFt));
  const [re, rn] = rotateEastNorth(0, south, spec.azimuth - 180);
  return offsetMeters(spec.center, re, rn);
}

/**
 * Midpoint of the array's north edge — where conduit leaves the racking.
 * Rotates with the array so the run always starts from the same physical edge.
 */
export function arrayTrenchAnchor(
  spec: ArraySpec,
  racking: RackingConfig = RACKING
): LngLat {
  const layout = footprintFt(spec.panelCount, spec.tier, racking);
  const [re, rn] = rotateEastNorth(0, feetToMeters(layout.depthFt) / 2, spec.azimuth - 180);
  return offsetMeters(spec.center, re, rn);
}
