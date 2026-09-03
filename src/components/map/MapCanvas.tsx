'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useQuoteStore } from '@/store/quoteStore';
import { mapRef, mapContainerRef } from '@/store/mapRefs';
import { installLayers, renderDesign, LAYER, installCompassIcon } from './layers';
import { rotateHandlePosition } from '@/lib/geo/array';
import { getMapSlot, subscribeMapSlot } from './mapStage';
import bearing from '@turf/bearing';
import { point } from '@turf/helpers';
import { buildTrench } from '@/lib/geo/trench';
import { slopeAt } from '@/lib/slope';
import { captureMap } from '@/lib/screenshot';
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // --- create the map exactly once -----------------------------------------
  // Depends on `mounted` because the host div lives in a portal that does not
  // exist on the first effect pass.
  useEffect(() => {
    if (!mounted || !host.current || mapRef.current) return;

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
      // The compass is cosmetic; never let it stop the layers being installed.
      try {
        installCompassIcon(map);
      } catch (error) {
        console.error('[MAP] compass icon failed', error);
      }
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

    // mapbox-gl.css sets `touch-action: pan-x pan-y` on its own canvas
    // container, which overrides the host's `touch-action: none`. The page then
    // scrolls underneath a map gesture — the brief forbids that, and it also
    // shifted the canvas mid-drag so the grab landed several pixels off.
    map.getCanvasContainer().style.touchAction = 'none';
    canvas.style.touchAction = 'none';

    const pointFor = (e: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };

    const hitTest = (pt: [number, number]): Grab['kind'] | null => {
      if (map.queryRenderedFeatures(pt, { layers: [LAYER.handle] }).length) return 'rotate';
      // The padded hit area, not the drawn hull: the visible table is only a
      // few pixels deep on screen.
      if (map.queryRenderedFeatures(pt, { layers: [LAYER.hitPad] }).length) return 'array';
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
      if (process.env.NODE_ENV !== 'production') {
        (window as unknown as Record<string, unknown>).__gmLastPointer = [ll.lng, ll.lat];
      }
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
          // Raw lng/lat deltas are not a bearing: a degree of longitude is only
          // ~0.84 of a degree of latitude at Texas latitudes, which skewed the
          // angle by about 5 degrees. turf.bearing does it on the sphere.
          //
          // No offset is applied: the grip rides due south in the array's own
          // frame, so its bearing from the centre IS the azimuth.
          store.setAzimuth(bearing(point(c), point([ll.lng, ll.lat])));
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

    // Test hook. Interaction tests need the live map's camera and the rendered
    // feature counts, neither of which is observable from the DOM. Dev-only:
    // `next build` strips this branch from production output.
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as Record<string, unknown>).__gmTest = {
        state: () => useQuoteStore.getState(),
        mapCenter: (): [number, number] => [map.getCenter().lng, map.getCenter().lat],
        mapZoom: () => map.getZoom(),
        project: (ll: LngLat) => {
          const p = map.project(ll);
          return [p.x, p.y];
        },
        renderedHulls: () => map.queryRenderedFeatures({ layers: [LAYER.hullFill] }).length,
        renderedHitPads: () => map.queryRenderedFeatures({ layers: [LAYER.hitPad] }).length,
        /** Where the compass grip currently sits, in lng/lat. */
        handleLngLat: (): LngLat | null => {
          const st = useQuoteStore.getState();
          if (!st.arrayCenter || st.totalPanels <= 0) return null;
          return rotateHandlePosition({
            center: st.arrayCenter,
            azimuth: st.azimuth,
            panelCount: st.totalPanels,
            tier: st.panelTier,
          });
        },
        /** Bearing from the array centre to an arbitrary point. */
        bearingFromCenter: (ll: LngLat): number | null => {
          const st = useQuoteStore.getState();
          if (!st.arrayCenter) return null;
          return bearing(point(st.arrayCenter), point(ll));
        },
        setZoom: (z: number) => map.setZoom(z),
        isMoving: () => map.isMoving() || map.isZooming() || map.isEasing(),
        /** The pointer position the drag handler last acted on, in lng/lat. */
        lastPointer: (): LngLat | null =>
          ((window as unknown as Record<string, unknown>).__gmLastPointer as LngLat) ?? null,
        unproject: (pt: [number, number]): LngLat => {
          const ll = map.unproject(pt);
          return [ll.lng, ll.lat];
        },
        renderedHandles: () => map.queryRenderedFeatures({ layers: [LAYER.handle] }).length,
        capture: () => captureMap(map),
        styleLoaded: () => map.isStyleLoaded(),
        /** Rect of the actual WebGL canvas — the space project() returns. */
        canvasRect: () => {
          const r = map.getCanvas().getBoundingClientRect();
          return { left: r.left, top: r.top, width: r.width, height: r.height };
        },
        hitAt: (pt: [number, number]) => ({
          handle: map.queryRenderedFeatures(pt, { layers: [LAYER.handle] }).length,
          hull: map.queryRenderedFeatures(pt, { layers: [LAYER.hitPad] }).length,
        }),
      };
    }

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
  }, [mounted]);

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

  // Portal to <body>. A `position: fixed` element is positioned against the
  // nearest ancestor with a transform/filter/contain, not the viewport, and the
  // funnel has one: the canvas tracked the page scroll instead of the slot and
  // ended up hundreds of pixels off-screen, unreachable by touch.
  if (!mounted) return null;

  return createPortal(
    <div
      ref={host}
      data-testid="map-canvas"
      // z-10 puts the canvas above the transparent <MapSlot /> placeholder that
      // reserves its space. At z-0 the slot painted on top and swallowed every
      // touch, leaving the map completely non-interactive. Sticky UI is z-40 and
      // still wins, and the canvas only ever covers the slot's rectangle.
      className="overflow-hidden rounded-xl"
      style={{
        // Positioning MUST be inline. Mapbox adds its own `mapboxgl-map` class
        // and mapbox-gl.css sets `position: relative` on it, which loads after
        // Tailwind and beats the `fixed` utility — the canvas then laid out in
        // normal flow at the bottom of <body> and drifted with page scroll.
        position: 'fixed',
        left: 0,
        top: 0,
        // Below step chrome. The address search (z-10) and sticky CTA (z-40)
        // must stay tappable; the <MapSlot /> placeholder is pointer-events:none
        // so it cannot swallow touches meant for the canvas.
        zIndex: 0,
        // The map owns its gestures; the page never scrolls underneath it.
        touchAction: 'none',
        visibility: 'hidden',
      }}
    />,
    document.body
  );
}

/** Redraw from store state and write back the trench length. */
function syncFromStore() {
  const map = mapRef.current;
  // Gate on the layers existing, NOT on isStyleLoaded(): that is still false
  // when 'load' fires, so an array placed before the style settled was computed
  // and then never drawn, because nothing changed the store again afterwards.
  if (!map || !map.getLayer(LAYER.hullFill)) return;

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
