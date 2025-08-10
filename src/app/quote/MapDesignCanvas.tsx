"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import dynamic from "next/dynamic";
import { lineString } from "@turf/turf";
import { length } from "@turf/length";
import { useQuoteContext } from "@/contexts/quoteContext";
import { layoutForPanels } from "@/lib/solar";

// Lazy-load inner map
const MapboxInner = dynamic(() => import("./MapboxSolarPanelInner"), { ssr: false });

// Initialize mapbox with token
if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
}

type Props = {
  panels: number;            // total panel count to render
  panelSize?: { w: number; h: number }; // meters per module (default 1.1 x 2.0-ish)
  onDistance?: (feet: number) => void;  // callback when trench length updates
};

// Default module footprint (rough): 1.1m x 2.0m, add gaps for racking
const DEFAULT_SIZE = { w: 1.2, h: 2.1 };

export default function MapDesignCanvas({ panels, panelSize = DEFAULT_SIZE, onDistance }: Props) {
  const {
    electricalMeterPosition,         // [lng, lat]
    panelPosition,                   // [lng, lat] center of array
    setPanelPosition,                // (pos) => void
    setAdditionalCost,               // (num) => void
    coordinates,                     // user's property coordinates
  } = useQuoteContext();

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const cleanupRef = useRef(false);

  // derive grid for the panels
  const grid = useMemo(() => layoutForPanels(panels), [panels]);

  // the inner map will call this when user drags/moves the array
  const handleDragArray = (lngLat: { lng: number; lat: number }) => {
    setPanelPosition([lngLat.lng, lngLat.lat]);
  };

  // compute distance whenever positions change
  useEffect(() => {
    if (
      Array.isArray(electricalMeterPosition) && electricalMeterPosition.length === 2 &&
      Array.isArray(panelPosition) && panelPosition.length === 2
    ) {
      const line = lineString([electricalMeterPosition, panelPosition]);
      const meters = length(line, { units: "kilometers" }) * 1000;
      const feet = meters * 3.28084;
      onDistance?.(feet);
      // If your pricing uses context.setAdditionalCost, keep calling it here:
      try { setAdditionalCost(Math.round(feet * 45)); } catch {} // $45/ft
    }
  }, [electricalMeterPosition?.[0], electricalMeterPosition?.[1], panelPosition?.[0], panelPosition?.[1], onDistance, setAdditionalCost]);

  // Initialize map only once
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    cleanupRef.current = false;

    // Use property coordinates as center, fallback to default
    const center: [number, number] = coordinates.longitude && coordinates.latitude 
      ? [coordinates.longitude, coordinates.latitude] 
      : [-96.9478987, 32.9007121]; // Dallas fallback

    // Initialize map
    const newMap = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-v9',
      center,
      zoom: 17,
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      touchZoomRotate: true,
      attributionControl: true,
      minZoom: 17,
      maxZoom: 20,
      interactive: true,
      touchPitch: false
    });
    
    map.current = newMap;

    // Wait for map to load
    newMap.on('load', () => {
      if (cleanupRef.current) return;
      setMapLoaded(true);
    });

    // Cleanup
    return () => {
      cleanupRef.current = true;
      if (map.current) {
        try {
          map.current.remove();
        } catch {
          // Ignore cleanup errors
        }
      }
      if (mapContainer.current) {
        mapContainer.current.remove();
      }
      mapContainer.current = null;
      map.current = null;
      setMapLoaded(false);
    };
  }, [coordinates.longitude, coordinates.latitude]);

  // Guard against missing Mapbox token
  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    return (
      <div className="h-[42vh] md:h-[420px] w-full overflow-hidden rounded-xl border border-neutral-200 flex items-center justify-center bg-gray-100">
        <div className="text-center p-8">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Map Unavailable</h3>
          <p className="text-gray-500">Mapbox configuration is missing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[42vh] md:h-[420px] w-full overflow-hidden rounded-xl border border-neutral-200">
      <div className="relative w-full h-full">
        <div 
          ref={mapContainer} 
          className="relative h-full w-full select-none" 
        />
        
        {mapLoaded && map.current && (
          <MapboxInner
            map={map.current}
            mapLoaded={mapLoaded}
            mode="design"                   // NEW mode
            designPanels={panels}           // count
            designGrid={grid}               // {rows, cols}
            designPanelSize={panelSize}     // meters
            meterPosition={Array.isArray(electricalMeterPosition) ? electricalMeterPosition : undefined}
            arrayPosition={panelPosition}   // can be null; inner should create a default near center
            onArrayMove={handleDragArray}
            // Keep HUD and controls as we already implemented
          />
        )}
      </div>
    </div>
  );
}