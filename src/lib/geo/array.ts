import type { Feature, FeatureCollection, Polygon } from 'geojson';
import {
  PANELS,
  RACKING,
  panelWidthFt,
  panelHeightFt,
  type PanelTier,
  type RackingConfig,
} from '@/config/pricing';
import { feetToMeters, offsetMeters, rotateEastNorth, type LngLat } from './units';

export interface ArraySpec {
  /** Geographic centre of the array. */
  center: LngLat;
  /** Compass bearing the panels face. 180 = due south. */
  azimuth: number;
  panelCount: number;
  tier: PanelTier;
  /** Override the default panels-per-row. */
  panelsPerRow?: number;
}

export interface ArrayLayout {
  rows: number;
  cols: number;
  panelCount: number;
  /** Full array footprint including row gaps, in feet. */
  widthFt: number;
  heightFt: number;
}

/**
 * Rows and columns for a panel count. Panels fill each row left to right; the
 * last row may be short, which is what a real installer builds.
 */
export function layoutFor(panelCount: number, racking: RackingConfig = RACKING): {
  rows: number;
  cols: number;
} {
  if (panelCount <= 0) return { rows: 0, cols: 0 };
  const cols = Math.min(panelCount, Math.max(1, racking.panelsPerRow));
  const rows = Math.ceil(panelCount / cols);
  return { rows, cols };
}

/** Footprint of the array in feet, gaps included. */
export function footprintFt(
  panelCount: number,
  tier: PanelTier,
  racking: RackingConfig = RACKING
): ArrayLayout {
  const product = PANELS[tier];
  const { rows, cols } = layoutFor(panelCount, racking);
  const pw = panelWidthFt(product);
  const ph = panelHeightFt(product);

  const widthFt = cols > 0 ? cols * pw + (cols - 1) * racking.panelGapFt : 0;
  const heightFt = rows > 0 ? rows * ph + (rows - 1) * racking.rowGapFt : 0;

  return { rows, cols, panelCount, widthFt, heightFt };
}

interface PanelRect {
  /** Local east/north offset of the panel centre, in metres, before rotation. */
  east: number;
  north: number;
}

function panelCentres(
  layout: ArrayLayout,
  tier: PanelTier,
  racking: RackingConfig
): PanelRect[] {
  const product = PANELS[tier];
  const pw = feetToMeters(panelWidthFt(product));
  const ph = feetToMeters(panelHeightFt(product));
  const colPitch = pw + feetToMeters(racking.panelGapFt);
  const rowPitch = ph + feetToMeters(racking.rowGapFt);

  const totalW = feetToMeters(layout.widthFt);
  const totalH = feetToMeters(layout.heightFt);

  const out: PanelRect[] = [];
  let placed = 0;
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols && placed < layout.panelCount; c++, placed++) {
      out.push({
        east: -totalW / 2 + pw / 2 + c * colPitch,
        // Row 0 at the north edge so the trench leaves from the top.
        north: totalH / 2 - ph / 2 - r * rowPitch,
      });
    }
  }
  return out;
}

function rectPolygon(
  center: LngLat,
  east: number,
  north: number,
  widthM: number,
  heightM: number,
  azimuth: number,
  properties: Record<string, unknown> = {}
): Feature<Polygon> {
  const hw = widthM / 2;
  const hh = heightM / 2;
  const corners: Array<[number, number]> = [
    [east - hw, north + hh],
    [east + hw, north + hh],
    [east + hw, north - hh],
    [east - hw, north - hh],
  ];

  // Panels face `azimuth`; the array's local axes rotate with it. 180 (south)
  // is the neutral orientation, so rotate by the offset from south.
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
  /** One polygon per panel, for the grid look. */
  panels: FeatureCollection<Polygon>;
  /** Single polygon covering the whole array, for fill and hit-testing. */
  hull: Feature<Polygon>;
  layout: ArrayLayout;
}

/**
 * Build the array geometry.
 *
 * Everything is derived from real panel dimensions in feet and emitted as
 * geographic coordinates, so the footprint is correct at every zoom by
 * construction — there is no pixel scale factor to get wrong. Rotation is a
 * parameter here, not a CSS transform.
 */
export function buildArray(spec: ArraySpec, racking: RackingConfig = RACKING): BuiltArray {
  const effectiveRacking: RackingConfig = {
    ...racking,
    panelsPerRow: spec.panelsPerRow ?? racking.panelsPerRow,
  };
  const layout = footprintFt(spec.panelCount, spec.tier, effectiveRacking);
  const product = PANELS[spec.tier];
  const pw = feetToMeters(panelWidthFt(product));
  const ph = feetToMeters(panelHeightFt(product));

  const panels: Array<Feature<Polygon>> = panelCentres(layout, spec.tier, effectiveRacking).map(
    (p, i) =>
      rectPolygon(spec.center, p.east, p.north, pw, ph, spec.azimuth, { panelIndex: i })
  );

  const hull = rectPolygon(
    spec.center,
    0,
    0,
    feetToMeters(layout.widthFt),
    feetToMeters(layout.heightFt),
    spec.azimuth,
    { kind: 'array-hull' }
  );

  return {
    panels: { type: 'FeatureCollection', features: panels },
    hull,
    layout,
  };
}

/**
 * Midpoint of the array's north edge — where the trench leaves the array.
 * Rotates with the array so the run always starts from the same physical edge.
 */
export function arrayTrenchAnchor(spec: ArraySpec, racking: RackingConfig = RACKING): LngLat {
  const layout = footprintFt(spec.panelCount, spec.tier, {
    ...racking,
    panelsPerRow: spec.panelsPerRow ?? racking.panelsPerRow,
  });
  const north = feetToMeters(layout.heightFt) / 2;
  const [re, rn] = rotateEastNorth(0, north, spec.azimuth - 180);
  return offsetMeters(spec.center, re, rn);
}
