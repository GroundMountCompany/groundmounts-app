import type MapboxDraw from '@mapbox/mapbox-gl-draw';
import type mapboxgl from 'mapbox-gl';

/**
 * Imperative handles to the live Mapbox objects.
 *
 * These are deliberately NOT in the Zustand store and NOT React refs: they hold
 * non-serializable instances that must never be persisted, never trigger a
 * re-render, and must keep a stable identity for the lifetime of the tab. Plain
 * module-level mutable boxes give exactly those semantics, and they can be read
 * from inside Mapbox event handlers without going through React at all.
 *
 * Phase 2 replaces all of this with a single owned map instance.
 */
export interface MutableBox<T> {
  current: T | null;
}

function box<T>(): MutableBox<T> {
  return { current: null };
}

export const mapRef = box<mapboxgl.Map>();
export const mapContainerRef = box<HTMLDivElement>();
export const drawRef = box<MapboxDraw>();
export const lineFeatureIdRef = box<string>();

/** Drop every handle. Called when the funnel resets. */
export function resetMapRefs(): void {
  mapRef.current = null;
  mapContainerRef.current = null;
  drawRef.current = null;
  lineFeatureIdRef.current = null;
}
