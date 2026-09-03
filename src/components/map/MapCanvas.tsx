'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useQuoteStore } from '@/store/quoteStore';
import { mapRef, mapContainerRef } from '@/store/mapRefs';
import { installLayers, renderDesign, LAYER, rotateHandlePosition } from './layers';
import { buildTrench } from '@/lib/geo/trench';
import type { ArraySpec } from '@/lib/geo/array';
import type { LngLat } from '@/lib/geo/units';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

export type MapMode = 'address' | 'place-meter' | 'design';

interface Props {
  mode: MapMode;
  className?: string;
}

/**
 * The one Mapbox instance.
 *
 * v1 created three (MapDrawTool, CalculatorMap, and the marker layer inside
 * MapboxSolarPanelInner), which is why state and gestures fought each other
 * across steps. This one is created once and re-aimed as the funnel advances.
 */
export default function MapCanvas({ mode, className }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Which pointer, if any, currently owns a drag on our geometry.
  const grab = useRef<{ kind: 'array' | 'rotate'; pointerId: number } | null>(null);

  useEffect(() => {
    if (!container.current || mapRef.current) return;

    const { coordinates } = useQuoteStore.getState();
    const map = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [coordinates.longitude, coordinates.latitude],
      zoom: 18,
      minZoom: 15,
      maxZoom: 21,
      // Required for canvas.toDataURL() at submit time.
      preserveDrawingBuffer: true,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
    });

    mapRef.current = map;
    mapContainerRef.current = container.current;

    map.on('load', () => {
      installLayers(map);
      // Terrain DEM powers queryTerrainElevation for the slope lookup. Added
      // as a source only - no exaggeration, so the view stays flat.
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });
      }
      syncFromStore();
    });

    // --- gesture arbitration -------------------------------------------------
    // Only a single-pointer press that lands on our own geometry is claimed.
    // Anything else (two fingers, or a press on bare map) belongs to Mapbox, so
    // pinch-zoom and panning keep working normally.
    const canvas = map.getCanvas();

    const hitTest = (e: PointerEvent): 'array' | 'rotate' | null => {
      const rect = canvas.getBoundingClientRect();
      const pt: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
      const onHandle = map.queryRenderedFeatures(pt, { layers: [LAYER.handle] });
      if (onHandle.length) return 'rotate';
      const onArray = map.queryRenderedFeatures(pt, { layers: [LAYER.hullFill] });
      return onArray.length ? 'array' : null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (modeRef.current !== 'design') return;
      if (!e.isPrimary) return; // second finger => let Mapbox pinch
      const kind = hitTest(e);
      if (!kind) return;

      grab.current = { kind, pointerId: e.pointerId };
      map.dragPan.disable();
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      const g = grab.current;
      if (!g || e.pointerId !== g.pointerId) return;
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const lngLat = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
      const store = useQuoteStore.getState();

      if (g.kind === 'array') {
        store.setArrayCenter([lngLat.lng, lngLat.lat]);
      } else {
        const c = store.arrayCenter;
        if (c) {
          // Bearing from array centre to the grip, which sits on the south edge.
          const dx = lngLat.lng - c[0];
          const dy = lngLat.lat - c[1];
          const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
          store.setAzimuth(bearing + 180);
        }
      }
      syncFromStore();
    };

    const endGrab = (e: PointerEvent) => {
      const g = grab.current;
      if (!g || e.pointerId !== g.pointerId) return;
      grab.current = null;
      map.dragPan.enable();
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* capture already gone */
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endGrab);
    canvas.addEventListener('pointercancel', endGrab);

    // Tap to drop the meter.
    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (modeRef.current !== 'place-meter') return;
      useQuoteStore.getState().setElectricalMeterPosition([e.lngLat.lng, e.lngLat.lat]);
      syncFromStore();
    };
    map.on('click', onClick);

    // Keep geometry in step with the store, whatever changed it.
    const unsubscribe = useQuoteStore.subscribe(syncFromStore);

    return () => {
      unsubscribe();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endGrab);
      canvas.removeEventListener('pointercancel', endGrab);
      map.off('click', onClick);
      map.remove();
      mapRef.current = null;
      mapContainerRef.current = null;
    };
    // Created once for the lifetime of the funnel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-aim the camera when the pin moves.
  useEffect(() => {
    const unsub = useQuoteStore.subscribe((s, prev) => {
      const map = mapRef.current;
      if (!map) return;
      if (
        s.coordinates.latitude !== prev.coordinates.latitude ||
        s.coordinates.longitude !== prev.coordinates.longitude
      ) {
        map.easeTo({
          center: [s.coordinates.longitude, s.coordinates.latitude],
          zoom: Math.max(map.getZoom(), 18),
          duration: 600,
        });
      }
    });
    return unsub;
  }, []);

  return (
    <div
      ref={container}
      data-testid="map-canvas"
      className={className ?? 'absolute inset-0'}
      // The map owns its gestures; never let the page scroll underneath it.
      style={{ touchAction: 'none' }}
    />
  );
}

/** Redraw array/trench/meter from current store state and write back trench feet. */
function syncFromStore() {
  const map = mapRef.current;
  if (!map || !map.isStyleLoaded()) return;

  const s = useQuoteStore.getState();
  const spec: ArraySpec | null = s.arrayCenter
    ? {
        center: s.arrayCenter,
        azimuth: s.azimuth,
        panelCount: s.totalPanels,
        tier: s.panelTier,
      }
    : null;
  const meter: LngLat | null = s.electricalMeterPosition;

  renderDesign(map, { spec, meter });

  if (spec && meter && spec.panelCount > 0) {
    const feet = buildTrench(spec, meter).feet;
    if (feet !== s.trenchFeet) s.setTrenchFeet(feet);
  }
}

export { rotateHandlePosition };
