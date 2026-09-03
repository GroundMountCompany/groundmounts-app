import type mapboxgl from 'mapbox-gl';
import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson';
import { buildArray, footprintFt, type ArraySpec } from '@/lib/geo/array';
import { buildTrench } from '@/lib/geo/trench';
import { feetToMeters, offsetMeters, rotateEastNorth, type LngLat } from '@/lib/geo/units';

export const SRC = {
  panels: 'gm-array-panels',
  hull: 'gm-array-hull',
  trench: 'gm-trench',
  handle: 'gm-rotate-handle',
  meter: 'gm-meter',
} as const;

export const LAYER = {
  hullFill: 'gm-hull-fill',
  hullLine: 'gm-hull-line',
  panelLine: 'gm-panel-line',
  trenchLine: 'gm-trench-line',
  trenchLabel: 'gm-trench-label',
  handle: 'gm-handle-circle',
  meter: 'gm-meter-circle',
} as const;

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function ensureSource(map: mapboxgl.Map, id: string, data: object) {
  const existing = map.getSource(id) as mapboxgl.GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data as GeoJSON.GeoJSON);
  } else {
    map.addSource(id, { type: 'geojson', data: data as GeoJSON.GeoJSON });
  }
}

/**
 * Create the array/trench layers once. Everything the user must see in the
 * final screenshot lives here as a real Mapbox layer rather than a DOM overlay,
 * which is what makes `canvas.toDataURL()` sufficient and html2canvas
 * unnecessary.
 */
export function installLayers(map: mapboxgl.Map) {
  if (map.getLayer(LAYER.hullFill)) return;

  ensureSource(map, SRC.hull, EMPTY);
  ensureSource(map, SRC.panels, EMPTY);
  ensureSource(map, SRC.trench, EMPTY);
  ensureSource(map, SRC.handle, EMPTY);
  ensureSource(map, SRC.meter, EMPTY);

  map.addLayer({
    id: LAYER.hullFill,
    type: 'fill',
    source: SRC.hull,
    paint: { 'fill-color': '#1d4ed8', 'fill-opacity': 0.35 },
  });
  map.addLayer({
    id: LAYER.hullLine,
    type: 'line',
    source: SRC.hull,
    paint: { 'line-color': '#bfdbfe', 'line-width': 2 },
  });
  map.addLayer({
    id: LAYER.panelLine,
    type: 'line',
    source: SRC.panels,
    paint: { 'line-color': '#e5edff', 'line-width': 1, 'line-opacity': 0.9 },
  });

  map.addLayer({
    id: LAYER.trenchLine,
    type: 'line',
    source: SRC.trench,
    paint: {
      'line-color': '#f59e0b',
      'line-width': 3,
      'line-dasharray': [2, 1.5],
    },
  });
  map.addLayer({
    id: LAYER.trenchLabel,
    type: 'symbol',
    source: SRC.trench,
    layout: {
      'symbol-placement': 'line-center',
      'text-field': ['get', 'label'],
      'text-size': 14,
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#78350f',
      'text-halo-width': 2,
    },
  });

  map.addLayer({
    id: LAYER.meter,
    type: 'circle',
    source: SRC.meter,
    paint: {
      'circle-radius': 8,
      'circle-color': '#f59e0b',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });

  // Rotate grip: a compass with a red north needle and the word "Turn" under
  // it. A plain circle reads as decoration; this has to say "grab me" to a
  // 60-year-old on a phone with no instructions.
  map.addLayer({
    id: LAYER.handle,
    type: 'symbol',
    source: SRC.handle,
    layout: {
      'icon-image': COMPASS_ICON,
      'icon-size': 0.5,
      'icon-allow-overlap': true,
      'icon-rotate': ['get', 'azimuth'],
      'icon-rotation-alignment': 'map',
      'text-field': 'Turn',
      'text-offset': [0, 1.9],
      'text-size': 13,
      'text-allow-overlap': true,
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#1e3a8a',
      'text-halo-width': 2,
    },
  });
}

export const COMPASS_ICON = 'gm-compass';

/**
 * Draw the compass once and register it with the map.
 *
 * Rendered at 2x (88px for a 44px target) so it stays crisp on retina phones.
 * North is a red needle so the rotation has an obvious reference point.
 */
export function installCompassIcon(map: mapboxgl.Map) {
  if (map.hasImage(COMPASS_ICON)) return;

  const size = 88;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return;

  const mid = size / 2;

  ctx.beginPath();
  ctx.arc(mid, mid, mid - 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#1d4ed8';
  ctx.stroke();

  // North needle.
  ctx.beginPath();
  ctx.moveTo(mid, 14);
  ctx.lineTo(mid - 11, mid + 4);
  ctx.lineTo(mid + 11, mid + 4);
  ctx.closePath();
  ctx.fillStyle = '#dc2626';
  ctx.fill();

  // South tail.
  ctx.beginPath();
  ctx.moveTo(mid, size - 20);
  ctx.lineTo(mid - 9, mid + 6);
  ctx.lineTo(mid + 9, mid + 6);
  ctx.closePath();
  ctx.fillStyle = '#94a3b8';
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 17px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', mid, size - 6);

  const { data } = ctx.getImageData(0, 0, size, size);
  map.addImage(COMPASS_ICON, { width: size, height: size, data: new Uint8Array(data) });
}

export interface RenderInput {
  spec: ArraySpec | null;
  meter: LngLat | null;
}

export interface RenderOutput {
  trenchFeet: number | null;
  handleAt: LngLat | null;
}

/** Push current geometry into the sources. Cheap enough to call per drag frame. */
export function renderDesign(map: mapboxgl.Map, { spec, meter }: RenderInput): RenderOutput {
  if (!map.getLayer(LAYER.hullFill)) return { trenchFeet: null, handleAt: null };

  if (!spec || spec.panelCount <= 0) {
    ensureSource(map, SRC.hull, EMPTY);
    ensureSource(map, SRC.panels, EMPTY);
    ensureSource(map, SRC.trench, EMPTY);
    ensureSource(map, SRC.handle, EMPTY);
  }

  let trenchFeet: number | null = null;
  let handleAt: LngLat | null = null;

  if (spec && spec.panelCount > 0) {
    const built = buildArray(spec);
    ensureSource(map, SRC.hull, built.hull as Feature<Polygon>);
    ensureSource(map, SRC.panels, built.panels);

    handleAt = rotateHandlePosition(spec);
    ensureSource(map, SRC.handle, {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: handleAt },
      // The compass needle turns with the array so N always points north.
      properties: { azimuth: 180 - spec.azimuth },
    });

    if (meter) {
      const trench = buildTrench(spec, meter);
      ensureSource(map, SRC.trench, trench.line as Feature<LineString>);
      trenchFeet = trench.feet;
    } else {
      ensureSource(map, SRC.trench, EMPTY);
    }
  }

  ensureSource(
    map,
    SRC.meter,
    meter
      ? { type: 'Feature', geometry: { type: 'Point', coordinates: meter }, properties: {} }
      : EMPTY
  );

  return { trenchFeet, handleAt };
}

/** The rotate grip, held off the array's south edge. */
export function rotateHandlePosition(spec: ArraySpec): LngLat {
  const fp = footprintFt(spec.panelCount, spec.tier);
  const south = -(feetToMeters(fp.depthFt) / 2 + feetToMeters(18));
  const [e, n] = rotateEastNorth(0, south, spec.azimuth - 180);
  return offsetMeters(spec.center, e, n);
}
