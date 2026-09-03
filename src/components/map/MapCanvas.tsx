'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useQuoteStore } from '@/store/quoteStore';
import { mapRef, mapContainerRef } from '@/store/mapRefs';
import { installLayers, renderDesign, LAYER, installCompassIcon } from './layers';
import { getMapSlot, subscribeMapSlot } from './mapStage';
import { buildTrench } from '@/lib/geo/trench';
import { slopeAt } from '@/lib/slope';
import type { ArraySpec } from '@/lib/geo/array';
import type { LngLat } from '@/lib/geo/units';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

export type MapMode = 'address' | 'place-meter' | 'design' | 'hidden';

/** Debounce for the slope lookup after the array settles. */
const SLOPE_DEBOUNCE_MS = 600;

interface Grab {
  kind: 'array' | 'rotate';
  pointerId: number;
  /** Where the finger went down, and where the array was at that moment. */
  startLngLat: LngLat;
  startCenter: LngLat;
}

/**
 * The one Mapbox instance for the whole funnel.
 *
 * Mounted once above the step router and never removed until the funnel
 * unmounts, so the camera, layers and WebGL context survive step changes. Steps
 * render a <MapSlot />; this positions the canvas over it.
 */
export default function MapStage({ mode }: { mode: MapMode }) {
  const host = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const grab = useRef<Grab | null>(null);
  const slopeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- create the map exactly once -----------------------------------------
  useEffect(() => {
    if (!host.current || mapRef.current) return;

    const { coordinates } = useQuoteStore.getState();
    const map = new mapboxgl.Map({
      container: host.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [coordinates.longitude, coordinates.latitude],
      zoom: 18,
      minZoom: 15,
      maxZoom: 21,
      preserveDrawingBuffer: true, // required for canvas.toDataURL() at submit
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
    });

    mapRef.current = map;
    mapContainerRef.current = host.current;

    map.on('load', () => {
      installCompassIcon(map);
      installLayers(map);
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

    const canvas = map.getCanvas();

    const pointFor = (e: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };

    const hitTest = (pt: [number, number]): Grab['kind'] | null => {
      if (map.queryRenderedFeatures(pt, { layers: [LAYER.handle] }).length) return 'rotate';
      if (map.queryRenderedFeatures(pt, { layers: [LAYER.hullFill] }).length) return 'array';
      return null;
    };

    const releaseGrab = () => {
      grab.current = null;
      map.dragPan.enable();
    };

    const onPointerDown = (e: PointerEvent) => {
      // A second finger always belongs to the map: cancel any drag in progress
      // and hand the gesture straight back so pinch-zoom is never blocked.
      if (grab.current && e.pointerId !== grab.current.pointerId) {
        releaseGrab();
        return;
      }
      if (modeRef.current !== 'design' || !e.isPrimary) return;

      const pt = pointFor(e);
      const kind = hitTest(pt);
      if (!kind) return;

      const { arrayCenter } = useQuoteStore.getState();
      if (!arrayCenter) return;

      const ll = map.unproject(pt);
      grab.current = {
        kind,
        pointerId: e.pointerId,
        startLngLat: [ll.lng, ll.lat],
        startCenter: arrayCenter,
      };
      map.dragPan.disable();
    };

    const onPointerMove = (e: PointerEvent) => {
      const g = grab.current;
      if (!g || e.pointerId !== g.pointerId) return;
      e.preventDefault();

      const ll = map.unproject(pointFor(e));
      const store = useQuoteStore.getState();

      if (g.kind === 'array') {
        // Move by the pointer's delta from the grab point, so the array keeps
        // its offset under the finger instead of snapping its centre there.
        store.setArrayCenter([
          g.startCenter[0] + (ll.lng - g.startLngLat[0]),
          g.startCenter[1] + (ll.lat - g.startLngLat[1]),
        ]);
      } else {
        const c = store.arrayCenter;
        if (c) {
          const bearing = (Math.atan2(ll.lng - c[0], ll.lat - c[1]) * 180) / Math.PI;
          // The grip rides the south edge, so the array faces the other way.
          store.setAzimuth(bearing + 180);
        }
      }
      syncFromStore();
    };

    const onPointerUp = (e: PointerEvent) => {
      const g = grab.current;
      if (!g || e.pointerId !== g.pointerId) return;
      releaseGrab();
      scheduleSlope();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (modeRef.current !== 'place-meter') return;
      useQuoteStore.getState().setElectricalMeterPosition([e.lngLat.lng, e.lngLat.lat]);
      syncFromStore();
    };
    map.on('click', onClick);

    const unsubscribeStore = useQuoteStore.subscribe(syncFromStore);

    return () => {
      unsubscribeStore();
      if (slopeTimer.current) clearTimeout(slopeTimer.current);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      map.off('click', onClick);
      // Only on funnel unmount — never between steps.
      map.remove();
      mapRef.current = null;
      mapContainerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Re-run the slope lookup once the array has settled. */
  function scheduleSlope() {
    if (slopeTimer.current) clearTimeout(slopeTimer.current);
    slopeTimer.current = setTimeout(async () => {
      const { arrayCenter, setSlope } = useQuoteStore.getState();
      if (!arrayCenter) return;
      const r = await slopeAt(mapRef.current, arrayCenter);
      setSlope(r.percent, r.tier);
    }, SLOPE_DEBOUNCE_MS);
  }

  // --- keep the canvas over the active slot --------------------------------
  useEffect(() => {
    let frame = 0;
    let last = '';

    const place = () => {
      const el = host.current;
      const slot = getMapSlot();
      if (el) {
        if (!slot || modeRef.current === 'hidden') {
          el.style.visibility = 'hidden';
          el.style.pointerEvents = 'none';
        } else {
          const r = slot.getBoundingClientRect();
          const key = `${r.top}|${r.left}|${r.width}|${r.height}`;
          el.style.visibility = 'visible';
          el.style.pointerEvents = 'auto';
          if (key !== last) {
            last = key;
            el.style.transform = `translate(${r.left}px, ${r.top}px)`;
            el.style.width = `${r.width}px`;
            el.style.height = `${r.height}px`;
            mapRef.current?.resize();
          }
        }
      }
      frame = requestAnimationFrame(place);
    };

    frame = requestAnimationFrame(place);
    const unsubscribe = subscribeMapSlot(() => {
      last = '';
    });
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, []);

  // Re-aim the camera when the address pin moves.
  useEffect(
    () =>
      useQuoteStore.subscribe((s, prev) => {
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
      }),
    []
  );

  return (
    <div
      ref={host}
      data-testid="map-canvas"
      className="fixed left-0 top-0 z-0 overflow-hidden rounded-xl"
      // The map owns its gestures; the page never scrolls underneath it.
      style={{ touchAction: 'none', visibility: 'hidden' }}
    />
  );
}

/** Redraw from store state and write back the trench length. */
function syncFromStore() {
  const map = mapRef.current;
  if (!map || !map.isStyleLoaded()) return;

  const s = useQuoteStore.getState();
  const spec: ArraySpec | null = s.arrayCenter
    ? { center: s.arrayCenter, azimuth: s.azimuth, panelCount: s.totalPanels, tier: s.panelTier }
    : null;

  renderDesign(map, { spec, meter: s.electricalMeterPosition });

  if (spec && s.electricalMeterPosition && spec.panelCount > 0) {
    const feet = buildTrench(spec, s.electricalMeterPosition).feet;
    if (feet !== s.trenchFeet) s.setTrenchFeet(feet);
  }
}
