'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type mapboxgl from 'mapbox-gl';
// Static CSS import only — it carries no JS, so mapbox-gl itself still loads lazily.
import '@/app/quote/mapboxStyle.css';
import { useQuoteStore } from '@/store/quoteStore';
import { mapRef, mapContainerRef } from '@/store/mapRefs';
import {
  installLayers,
  renderDesign,
  LAYER,
  installCompassIcon,
  currentHandlePosition,
  fitDesign,
  arrayOutOfView,
} from './layers';

import { getMapSlot, subscribeMapSlot } from './mapStage';
import bearing from '@turf/bearing';
import { point } from '@turf/helpers';
import { buildTrench } from '@/lib/geo/trench';
import { slopeAt } from '@/lib/slope';
import { refreshSiteIntel } from '@/lib/siteIntel';
import { captureMap } from '@/lib/screenshot';
import { applyAutoSize } from '@/lib/applyAutoSize';
import type { ArraySpec } from '@/lib/geo/array';
import type { LngLat } from '@/lib/geo/units';

/** Height of the sheet at its peek snap, plus breathing room. */
const SHEET_CLEARANCE_PX = 196;

/** Keep the fitted array clear of the bottom sheet on phone layouts. */
function fitPadding() {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 768;
  return { bottomPadding: narrow ? SHEET_CLEARANCE_PX : 56 };
}

/**
 * mapbox-gl is ~230 kB gzipped and the address step does not need it to render
 * the search box, so it is pulled in after first paint rather than being part of
 * the initial bundle. The CSS comes with it.
 */
async function loadMapbox() {
  const { default: mapboxgl } = await import('mapbox-gl');
  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
  return mapboxgl;
}

export type MapMode = 'address' | 'place-meter' | 'design' | 'hidden';

/** Debounce for the slope and site lookups after the array settles. */
const SLOPE_DEBOUNCE_MS = 600;

type GrabKind = 'array' | 'rotate' | 'pin' | 'meter';

interface Grab {
  kind: GrabKind;
  pointerId: number;
  /** Where the finger went down, and where the dragged thing was then. */
  startLngLat: LngLat;
  startCenter: LngLat;
  /** Camera position when the grab began; held there until the finger lifts. */
  cameraCenter: LngLat;
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
  currentMode.current = mode;

  const grab = useRef<Grab | null>(null);
  const slopeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // --- create the map exactly once -----------------------------------------
  // Depends on `mounted` because the host div lives in a portal that does not
  // exist on the first effect pass.
  useEffect(() => {
    if (!mounted || !host.current || mapRef.current) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void loadMapbox().then((mapboxgl) => {
      if (disposed || !host.current || mapRef.current) return;
      cleanup = createMap(mapboxgl);
    });

    return () => {
      disposed = true;
      cleanup?.();
    };

    function createMap(mapboxgl: typeof import('mapbox-gl').default) {
    const { coordinates } = useQuoteStore.getState();
    const map = new mapboxgl.Map({
      container: host.current!,
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
      useQuoteStore.getState().setMapReady(true);
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

    /** What, if anything, this point grabs — respecting the current step. */
    const hitTest = (pt: [number, number]): GrabKind | null => {
      const hits = (layer: string) => {
        try {
          return map.queryRenderedFeatures(pt, { layers: [layer] }).length > 0;
        } catch {
          return false; // layer not installed yet
        }
      };

      // The padded layers, not the drawn markers: a 16px dot is not a target.
      if (modeRef.current === 'address') {
        return hits(LAYER.pinHit) ? 'pin' : null;
      }
      if (modeRef.current === 'place-meter') {
        return hits(LAYER.meterHit) ? 'meter' : null;
      }
      if (modeRef.current !== 'design') return null;

      if (hits(LAYER.handle)) return 'rotate';
      // The padded hit area, not the drawn hull: the visible table is only a
      // few pixels deep on screen.
      return hits(LAYER.hitPad) ? 'array' : null;
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
      if (!e.isPrimary) return;

      const pt = pointFor(e);
      const kind = hitTest(pt);
      if (!kind) return;

      const st = useQuoteStore.getState();
      // Whatever is being dragged, remember where it started so the move is a
      // delta from the grab point rather than a jump to the finger.
      const anchor: LngLat | null =
        kind === 'pin'
          ? [st.coordinates.longitude, st.coordinates.latitude]
          : kind === 'meter'
            ? st.electricalMeterPosition
            : st.arrayCenter;
      if (!anchor) return;

      const ll = map.unproject(pt);
      const cam = map.getCenter();
      grab.current = {
        kind,
        pointerId: e.pointerId,
        startLngLat: [ll.lng, ll.lat],
        startCenter: anchor,
        cameraCenter: [cam.lng, cam.lat],
      };
      map.dragPan.disable();
    };

    const onPointerMove = (e: PointerEvent) => {
      const g = grab.current;
      if (!g || e.pointerId !== g.pointerId) return;
      e.preventDefault();

      const ll = map.unproject(pointFor(e));
      if (process.env.NEXT_PUBLIC_E2E_HOOKS === '1') {
        (window as unknown as Record<string, unknown>).__gmLastPointer = [ll.lng, ll.lat];
      }
      const store = useQuoteStore.getState();

      // Delta from the grab point, so whatever is dragged keeps its offset under
      // the finger instead of snapping its centre there.
      const moved: LngLat = [
        g.startCenter[0] + (ll.lng - g.startLngLat[0]),
        g.startCenter[1] + (ll.lat - g.startLngLat[1]),
      ];

      if (g.kind === 'array') {
        store.setArrayCenter(moved);
      } else if (g.kind === 'pin') {
        store.setCoordinates({ longitude: moved[0], latitude: moved[1] });
      } else if (g.kind === 'meter') {
        store.setElectricalMeterPosition(moved);
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
      const kind = g.kind;
      releaseGrab();

      // The turn is over, so the count can settle. Nothing resized while the
      // grip was under the finger — see applyAutoSize.
      if (kind === 'rotate') applyAutoSize();

      // Only the array's own moves change the ground under it or need the view
      // re-framed. Dragging the pin or the meter used to trigger a slope lookup
      // for an array that had not moved, and a re-fit on a step with no array.
      if (kind !== 'array' && kind !== 'rotate') return;

      scheduleSiteRefresh();

      // If the array has been dragged half out of the window, bring it back
      // rather than leaving the customer to hunt for it.
      const spec = currentSpec();
      if (spec && arrayOutOfView(map, spec)) {
        fitDesign(map, spec, useQuoteStore.getState().electricalMeterPosition, fitPadding());
      }
    };

    /**
     * Stop Mapbox seeing a touch that belongs to our geometry.
     *
     * Disabling dragPan inside pointerdown is not enough: Mapbox binds its pan
     * handler to the canvas *container*, and by the time our handler runs the
     * gesture has already been claimed, so the map slid ~16px under the finger
     * during an array drag. Capturing on the canvas lets us stop propagation
     * before the container's listener ever sees it. No preventDefault, which
     * would cancel the pointer stream we rely on.
     */
    const onTouchStartCapture = (e: TouchEvent) => {
      if (modeRef.current !== 'design') return;
      if (e.touches.length !== 1) return; // two fingers always belong to the map
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const pt: [number, number] = [t.clientX - rect.left, t.clientY - rect.top];
      if (hitTest(pt)) {
        e.stopPropagation();
        // And prevent the default, so Mapbox's pan never starts at all rather
        // than starting and being corrected a frame later. Pointer events are
        // generated independently of the touch default action, so the stream
        // this component drags with is unaffected — verified by the drag,
        // pinch and compass tests, which all run on synthetic touch.
        if (e.cancelable) e.preventDefault();
        // Pin from here, not from pointerdown.
        //
        // touchstart fires first, and the pin used to start one event later —
        // so anything Mapbox did in between was corrected only after the fact,
        // a frame at a time. Under load that reactive snap-back was visible:
        // one run in five drifted 17px where the others drifted two or three.
        // Recording the camera now means the correction has something to
        // correct *to* from the first move event onwards.
        pendingCamera = [map.getCenter().lng, map.getCenter().lat];
      }
    };
    canvas.addEventListener('touchstart', onTouchStartCapture, { capture: true });

    /**
     * Hold the camera still for the duration of an array or compass drag.
     *
     * Disabling dragPan and stopping propagation both leave a residual pan of
     * ~16px, because Mapbox has already claimed the gesture by the time our
     * handler runs. Rather than keep guessing at its event plumbing, the camera
     * is simply pinned: whatever tries to move it while a finger is down gets
     * put back. The map is free again the instant the finger lifts.
     */
    let pinning = false;
    /** Where the camera was when a touch landed on our geometry. */
    let pendingCamera: LngLat | null = null;

    const onMapMove = () => {
      // Whichever we have: the grab's centre once the pointer handler has run,
      // and the one recorded at touchstart in the moments before that.
      const target = grab.current?.cameraCenter ?? pendingCamera;
      if (!target || pinning) return;
      const c = map.getCenter();
      if (Math.abs(c.lng - target[0]) < 1e-12 && Math.abs(c.lat - target[1]) < 1e-12) {
        return;
      }
      pinning = true;
      map.setCenter(target);
      pinning = false;
    };
    map.on('move', onMapMove);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    // The pin is released with the finger, not with the grab: a touch that
    // never became a grab must not leave the camera held.
    const releasePending = () => {
      pendingCamera = null;
    };
    canvas.addEventListener('touchend', releasePending);
    canvas.addEventListener('touchcancel', releasePending);

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (modeRef.current !== 'place-meter') return;
      useQuoteStore.getState().setElectricalMeterPosition([e.lngLat.lng, e.lngLat.lat]);
      syncFromStore();
    };
    map.on('click', onClick);

    // The grip's ground offset is derived from the current zoom, so it has to be
    // rebuilt whenever the zoom changes or it drifts toward or into the array.
    const onZoomEnd = () => syncFromStore();
    map.on('zoomend', onZoomEnd);

    // A pan or a zoom moves the grip on screen without touching the store, so
    // anything anchored to it has to follow the camera as well as the design.
    map.on('move', publishHandleScreen);

    const unsubscribeStore = useQuoteStore.subscribe(syncFromStore);

    // Frame the design on every entry to the step, not once per map lifetime.
    // The map outlives the funnel now, so a customer who steps back and returns
    // used to arrive at whatever camera they left behind.
    let framed = false;
    framedResetRef.current = () => {
      framed = false;
    };
    const maybeFit = () => {
      // Never re-frame while a finger is down: the drag writes to the store on
      // every frame, and moving the camera underneath the gesture is exactly
      // the "map fights you" behaviour this whole phase is meant to remove.
      if (framed || grab.current || modeRef.current !== 'design') return;
      const spec = currentSpec();
      if (!spec || !map.isStyleLoaded()) return;
      framed = true;
      fitDesign(map, spec, useQuoteStore.getState().electricalMeterPosition, fitPadding());
    };
    const unsubscribeFit = useQuoteStore.subscribe(maybeFit);
    map.on('idle', maybeFit);

    fitRef.current = () => {
      const spec = currentSpec();
      if (spec) {
        fitDesign(map, spec, useQuoteStore.getState().electricalMeterPosition, fitPadding());
      }
    };

    // Test hook. Interaction tests need the live map's camera and the rendered
    // feature counts, neither of which is observable from the DOM.
    //
    // Gated on an explicit flag rather than on NODE_ENV, because the e2e suite
    // now runs against a production build — `next dev` was compiling routes on
    // demand while four workers hydrated against them, which is what the
    // flaky navigation and hydration timeouts were. The flag is set only by
    // playwright.config.ts, so a real deploy still has no hook: the comparison
    // inlines to `false` at build time and the branch is dropped.
    // `npm run verify:hooks` proves that against the built output.
    if (process.env.NEXT_PUBLIC_E2E_HOOKS === '1') {
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
        handleLngLat: (): LngLat | null => {
          const st = useQuoteStore.getState();
          if (!st.arrayCenter || st.totalPanels <= 0) return null;
          return currentHandlePosition(map, {
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
        /** Jump to a zoom with the array centred, so it stays in the viewport. */
        viewArrayAt: (z: number) => {
          const c = useQuoteStore.getState().arrayCenter;
          map.jumpTo(c ? { center: c, zoom: z } : { zoom: z });
        },
        /**
         * The grip and array as Mapbox actually has them rendered, in screen
         * pixels. Read back from the map rather than recomputed, so a test
         * using this fails if the geometry stops being pushed to the source.
         */
        renderedGeom: () => {
          const handleFeature = map.queryRenderedFeatures({ layers: [LAYER.handle] })[0];
          const hullFeature = map.queryRenderedFeatures({ layers: [LAYER.hullFill] })[0];
          if (!handleFeature || !hullFeature) return null;
          if (handleFeature.geometry.type !== 'Point') return null;
          if (hullFeature.geometry.type !== 'Polygon') return null;

          const h = map.project(handleFeature.geometry.coordinates as [number, number]);
          const ring = hullFeature.geometry.coordinates[0] as Array<[number, number]>;
          return {
            handlePx: [h.x, h.y] as [number, number],
            hullPx: ring.map((c) => {
              const p = map.project(c);
              return [p.x, p.y] as [number, number];
            }),
          };
        },
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
        hitAt: (pt: [number, number]) => {
          const count = (layer: string) => {
            try {
              return map.queryRenderedFeatures(pt, { layers: [layer] }).length;
            } catch {
              return 0;
            }
          };
          return {
            handle: count(LAYER.handle),
            hull: count(LAYER.hitPad),
            pin: count(LAYER.pinHit),
            meter: count(LAYER.meterHit),
          };
        },
      };
    }

    return () => {
      unsubscribeStore();
      unsubscribeFit();
      map.off('idle', maybeFit);
      fitRef.current = null;
      framedResetRef.current = null;
      if (slopeTimer.current) clearTimeout(slopeTimer.current);
      canvas.removeEventListener('touchstart', onTouchStartCapture, { capture: true });
      canvas.removeEventListener('touchend', releasePending);
      canvas.removeEventListener('touchcancel', releasePending);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      map.off('click', onClick);
      map.off('zoomend', onZoomEnd);
      map.off('move', publishHandleScreen);
      map.off('move', onMapMove);
      // Only on funnel unmount — never between steps.
      map.remove();
      mapRef.current = null;
      mapContainerRef.current = null;
      useQuoteStore.getState().setMapReady(false);
    };
    }
  }, [mounted]);

  /**
   * Re-read the ground once the array has settled.
   *
   * Slope and site intel share one timer: both describe the same patch of
   * ground and both are triggered by the same gesture, so firing them
   * separately would mean two debounces racing over one drag.
   */
  function scheduleSiteRefresh() {
    if (slopeTimer.current) clearTimeout(slopeTimer.current);
    slopeTimer.current = setTimeout(async () => {
      const { arrayCenter, setSlope } = useQuoteStore.getState();
      if (!arrayCenter) return;
      // Fire the network lookup first; it is skipped unless the array left its
      // ~100 m cell, so an adjustment of a few feet costs nothing.
      void refreshSiteIntel(arrayCenter);
      const r = await slopeAt(mapRef.current, arrayCenter);
      setSlope(r.percent, r.tier, r.source);
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
        // Never chase the pin while the customer is dragging it.
        if (!map || grab.current) return;
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

/** Current array spec from the store, or null when there is nothing to draw. */
function currentSpec(): ArraySpec | null {
  const s = useQuoteStore.getState();
  if (!s.arrayCenter || s.totalPanels <= 0) return null;
  return {
    center: s.arrayCenter,
    azimuth: s.azimuth,
    panelCount: s.totalPanels,
    tier: s.panelTier,
  };
}

/**
 * The mode the map is showing, at module scope so syncFromStore can read it.
 * It runs from a store subscription, outside React, and needs to know whether
 * the address pin should be drawn.
 */
const currentMode: { current: MapMode } = { current: 'hidden' };

/** Set by the live map; called by the "Find my panels" button. */
const fitRef: { current: (() => void) | null } = { current: null };

/** Lets the shell re-arm framing when the design step is entered again. */
const framedResetRef: { current: (() => void) | null } = { current: null };

/**
 * Re-arm the one-shot framing and fit right away.
 *
 * Re-arming alone left the camera wherever the customer had wandered until the
 * map happened to go idle again — which, on a settled map, is never.
 */
export function rearmDesignFraming() {
  framedResetRef.current?.();
  fitRef.current?.();
}

/** Re-frame the array and meter. Safe to call when no map exists. */
export function fitDesignView() {
  fitRef.current?.();
}

/**
 * Where the compass grip currently is, in viewport pixels.
 *
 * Published rather than put in the store: this changes on every frame of a
 * drag, a rotate and a pan, and a store write per frame would re-render the
 * whole funnel. Subscribers get the coordinate and nothing else re-renders.
 */
export type ScreenPoint = { x: number; y: number };

const handleScreenListeners = new Set<(p: ScreenPoint | null) => void>();
let lastHandleScreen: ScreenPoint | null = null;

export function subscribeHandleScreen(fn: (p: ScreenPoint | null) => void): () => void {
  handleScreenListeners.add(fn);
  fn(lastHandleScreen);
  return () => {
    handleScreenListeners.delete(fn);
  };
}

/** Recompute the grip's screen position and tell anybody who cares. */
function publishHandleScreen() {
  const map = mapRef.current;
  const s = useQuoteStore.getState();
  let next: ScreenPoint | null = null;

  if (map && currentMode.current === 'design' && s.arrayCenter && s.totalPanels > 0) {
    const ll = currentHandlePosition(map, {
      center: s.arrayCenter,
      azimuth: s.azimuth,
      panelCount: s.totalPanels,
      tier: s.panelTier,
    });
    if (ll) {
      const rect = map.getCanvas().getBoundingClientRect();
      const p = map.project(ll);
      next = { x: rect.left + p.x, y: rect.top + p.y };
    }
  }

  // Sub-pixel churn is not worth a React render.
  const same =
    (next === null && lastHandleScreen === null) ||
    (next !== null &&
      lastHandleScreen !== null &&
      Math.abs(next.x - lastHandleScreen.x) < 0.5 &&
      Math.abs(next.y - lastHandleScreen.y) < 0.5);
  if (same) return;

  lastHandleScreen = next;
  for (const fn of handleScreenListeners) fn(next);
}

/** Redraw from store state and write back the trench length. */
function syncFromStore() {
  const map = mapRef.current;
  // Gate on the layers existing, NOT on isStyleLoaded(): that is still false
  // when 'load' fires, so an array placed before the style settled was computed
  // and then never drawn, because nothing changed the store again afterwards.
  if (!map || !map.getLayer(LAYER.hullFill)) return;

  const s = useQuoteStore.getState();
  const spec = currentSpec();

  renderDesign(map, {
    spec,
    meter: s.electricalMeterPosition,
    pin:
      currentMode.current === 'address'
        ? [s.coordinates.longitude, s.coordinates.latitude]
        : null,
  });

  if (spec && s.electricalMeterPosition && spec.panelCount > 0) {
    const feet = buildTrench(spec, s.electricalMeterPosition).feet;
    if (feet !== s.trenchFeet) s.setTrenchFeet(feet);
  }

  publishHandleScreen();
}
