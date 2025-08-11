'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import { useQuoteContext } from '@/contexts/quoteContext';
import MapboxSolarPanelInner from './MapboxSolarPanelInner';

// Initialize mapbox with token
if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
}

export default function CalculatorMap() {
  const { coordinates, electricalMeterPosition } = useQuoteContext();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const center = useMemo<[number, number]>(() => {
    // Prefer the user's meter coordinate to keep context consistent
    if (Array.isArray(electricalMeterPosition) && electricalMeterPosition.length === 2) {
      return [electricalMeterPosition[0], electricalMeterPosition[1]];
    }
    // Use coordinates if they're valid (not 0,0)
    if (coordinates.longitude !== 0 && coordinates.latitude !== 0) {
      return [coordinates.longitude, coordinates.latitude];
    }
    // Default to US center if no valid coordinates
    return [-98.5795, 39.8283]; // US center
  }, [coordinates.longitude, coordinates.latitude, electricalMeterPosition]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!mapboxgl.accessToken) {
      // Avoid hard crash; still render form
      console.warn('[CalculatorMap] Missing NEXT_PUBLIC_MAPBOX_TOKEN');
      return;
    }

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center,
      zoom: 20.7, // Calculator view default (15% closer)
      pitch: 0,
      attributionControl: false,
      cooperativeGestures: true,
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    const handleLoad = () => {
      setMapLoaded(true);
      // Lock scroll-zoom for mobile; pinch/rotate still works.
      mapRef.current?.scrollZoom.disable();
      mapRef.current?.doubleClickZoom.disable();
    };

    mapRef.current.on('load', handleLoad);

    return () => {
      try {
        mapRef.current?.remove();
      } catch {}
      mapRef.current = null;
    };
  }, []); // Remove center dependency to prevent re-creating map

  // Update map center when coordinates change
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    
    mapRef.current.flyTo({
      center,
      zoom: 20.7,
      duration: 0 // Immediate jump
    });
  }, [center, mapLoaded]);

  // Draw a FIXED meter marker here (not draggable)
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    // Clear old temp meter markers
    const existing = document.querySelector('.calc-meter-marker');
    existing?.parentElement?.removeChild(existing);

    if (Array.isArray(electricalMeterPosition) && electricalMeterPosition.length === 2) {
      const el = document.createElement('div');
      el.className =
        'calc-meter-marker w-4 h-4 rounded-full border-2 border-white bg-amber-400 shadow-[0_0_0_2px_rgba(0,0,0,0.25)]';
      new mapboxgl.Marker({ element: el, draggable: false })
        .setLngLat([electricalMeterPosition[0], electricalMeterPosition[1]])
        .addTo(mapRef.current);
    }
  }, [mapLoaded, electricalMeterPosition]);

  // Responsive height: full width, ~55vh on mobile, 420px min
  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden"
        style={{ height: 'min(60vh, 460px)' }}
      />
      {/* Panels & distance logic render on top of the same map */}
      {mapRef.current && (
        <MapboxSolarPanelInner
          map={mapRef.current}
          mapLoaded={mapLoaded}
          allowMeterPlacement={false} // <-- important: lock meter on this step
        />
      )}
    </div>
  );
}