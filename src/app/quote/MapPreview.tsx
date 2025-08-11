"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import 'mapbox-gl/dist/mapbox-gl.css';
import MapboxSolarPanelInner from "./MapboxSolarPanelInner";

// Initialize mapbox with token
if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
}

type Props = {
  /** [lng, lat] */
  center: [number, number];
  /** Optional zoom percent (0–100). Defaults to 50 to match meter screen. */
  zoomPercent?: number;
  /** Height classes, default sensible mobile & desktop sizes */
  className?: string;
};

/**
 * Read-only map preview with a fixed marker at `center`.
 * - No placement mode, no drawing.
 * - Clicks do nothing.
 * - Keeps Zoom HUD and standard controls.
 */
export default function MapPreview({ center, zoomPercent = 50, className = "h-[36vh] md:h-72 w-full rounded-xl overflow-hidden" }: Props) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const cleanupRef = useRef(false);

  // Initialize map only once
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    cleanupRef.current = false;

    // Initialize map
    const newMap = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-v9',
      center: center,
      zoom: 19.6, // Will be set by inner component based on zoomPercent (15% closer)
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
  }, [center]);

  // Guard against missing Mapbox token
  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    return (
      <div className={`${className} flex items-center justify-center bg-gray-100`}>
        <div className="text-center p-8">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Map Unavailable</h3>
          <p className="text-gray-500">Mapbox configuration is missing</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="relative w-full h-full overflow-hidden">
        <div 
          ref={mapContainer} 
          className="relative h-full w-full select-none" 
        />
        
        {mapLoaded && map.current && (
          <MapboxSolarPanelInner 
            map={map.current} 
            mapLoaded={mapLoaded}
            mode="preview"
            initialZoomPercent={zoomPercent}
            initialCenter={center}
            showMeterAtCenter
            disableInteractions={false} // allow pan/zoom for context, but marker is fixed
          />
        )}
      </div>
    </div>
  );
}