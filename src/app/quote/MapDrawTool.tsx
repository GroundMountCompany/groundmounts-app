'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import AddressInput from './AddressInput';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import './mapboxStyle.css';
import { useQuoteContext } from '@/contexts/quoteContext';
import MapboxSolarPanel from './MapboxSolarPanel';

// Initialize mapbox with token
if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
}

const START_ZOOM = 18.5; // Proper zoom level - not from space

// Zoom conversion helper
function percentFromZoom(z: number, min: number, max: number) {
  if (max === min) return 0;
  return Math.round(((z - min) / (max - min)) * 100);
}

// Removed unused zoomFromPercent function

interface MapDrawToolProps {
  mode?: "default" | "place-meter" | "preview" | "design";
  onPlace?: (lngLat: { lng: number; lat: number }) => void;
  initialZoomPercent?: number;
}

export const MapDrawTool = ({ mode = "default", onPlace }: MapDrawToolProps = {}) => {
  const { coordinates, currentStepIndex, isAutoLocationError, shouldDrawPanels, setMapZoomPercentage, address } = useQuoteContext();
  
  // All hooks must be called before any conditional returns
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [, setZoom] = useState(START_ZOOM); // Only used in setter
  const initializedRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [marker, setMarker] = useState<mapboxgl.Marker | null>(null);
  const [showLocationText, setShowLocationText] = useState(true);
  const [hasValidCoordinates, setHasValidCoordinates] = useState(false);
  const cleanupRef = useRef(false);
  const meterMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Track when coordinates are set from AddressInput or geolocation
  useEffect(() => {
    // Only set valid coordinates when we have an address or successful geolocation
    if (coordinates.longitude !== 0 && coordinates.latitude !== 0 && !isAutoLocationError && address.length > 0) {
      setHasValidCoordinates(true);
    } else {
      setHasValidCoordinates(false);
    }
  }, [coordinates, isAutoLocationError, address]);

  // Initialize map only once
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    cleanupRef.current = false;

    // Initialize map with sensible defaults when coordinates are not yet valid
    const hasCoords = coordinates.longitude !== 0 && coordinates.latitude !== 0;
    const initialCenter: [number, number] = hasCoords 
      ? [coordinates.longitude, coordinates.latitude]
      : [-98.5795, 39.8283]; // US center as default
    
    const newMap = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-v9',
      center: initialCenter,
      zoom: START_ZOOM,
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
    
    // Configure mobile gestures for buttery performance
    newMap.scrollZoom.disable();        // prevent accidental page scroll fights
    newMap.touchZoomRotate.enable();    // pinch/rotate on mobile
    newMap.doubleClickZoom.disable();   // avoid jumpy zooms
    map.current = newMap;

    // Wait for map to load before adding controls
    newMap.on('load', () => {
      if (cleanupRef.current) return;
      
      // Set initial zoom percentage based on START_ZOOM
      if (!initializedRef.current) {
        const min = newMap.getMinZoom();
        const max = newMap.getMaxZoom();
        const startPercent = percentFromZoom(START_ZOOM, min, max);
        setMapZoomPercentage(startPercent);
        initializedRef.current = true;
      }

      const nav = new mapboxgl.NavigationControl({
        showCompass: false,
        showZoom: true
      });
      newMap.addControl(nav, 'bottom-right');

      // Add zoom change handler
      let zoomTimeout: NodeJS.Timeout;
      newMap.on('zoom', () => {
        const currentZoom = newMap.getZoom();
        const percentage = percentFromZoom(currentZoom, 17, 20);
        setMapZoomPercentage(percentage);

        // Clear any pending timeout
        if (zoomTimeout) {
          clearTimeout(zoomTimeout);
        }

        // Ensure zoom stays within bounds immediately
        if (currentZoom < 17) {
          newMap.setZoom(17);
          setMapZoomPercentage(0);
        } else if (currentZoom > 20) {
          newMap.setZoom(20);
          setMapZoomPercentage(percentFromZoom(20, 17, 20));
        }

        // Debounce the state update
        zoomTimeout = setTimeout(() => {
          setZoom(currentZoom);
        }, 16); // ~1 frame at 60fps
      });

      // Force a resize to ensure the map fills the container
      newMap.resize();
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
  }, []); // Remove dependencies to prevent reinitializing

  // Handle center and zoom changes without reinitializing the map
  useEffect(() => {
    if (!map.current) return;

    // Always update center if we have valid coordinates
    if (hasValidCoordinates) {
      const currentCenter = map.current.getCenter();
      const hasLocationChanged =
        Math.abs(currentCenter.lng - coordinates.longitude) > 0.0001 ||
        Math.abs(currentCenter.lat - coordinates.latitude) > 0.0001;

      if (hasLocationChanged) {
        map.current.flyTo({
          center: [coordinates.longitude, coordinates.latitude],
          zoom: START_ZOOM,
          duration: 0 // Jump immediately so it never shows space
        });
      }
      map.current.resize();
    }

    // Handle marker visibility
    if (currentStepIndex === 0 && hasValidCoordinates) {
      // Show/update marker on first step with valid coordinates
      if (marker) {
        marker.setLngLat([coordinates.longitude, coordinates.latitude]);
      } else {
        let customMakerElement: HTMLDivElement | undefined = undefined;
        if (typeof document !== 'undefined') {
          customMakerElement = document.createElement('div');
          customMakerElement.className = 'flex items-center justify-center flex-col gap-2';
          const markerImage = document.createElement('img');
          markerImage.src = '/images/icons/marker.png';
          markerImage.className = 'w-[40px] h-[40px] rounded-full border-0';
          customMakerElement.appendChild(markerImage);

          if (showLocationText) {
            const locationDiv = document.createElement('div');
            locationDiv.className = 'font-medium shadow-lg rounded-full p-1 bg-white text-xs z-10 flex items-center location-text transition-opacity duration-300';
            locationDiv.innerHTML = `
              <div class="w-6 h-6 rounded-full bg-custom-black flex items-center justify-center mr-2">
                <img src="/images/icons/location.png" alt="location" />
              </div>
              Your Location
              <button class="ml-2">
                <img src="/images/icons/nav-2.png" alt="close" class="w-4 h-4 transform rotate-45" />
              </button>
            `;
            customMakerElement.appendChild(locationDiv);
          }
        }
        const options: mapboxgl.MarkerOptions = {};
        if (customMakerElement) {
          options.element = customMakerElement;
        }
        const newMarker = new mapboxgl.Marker(options)
          .setLngLat([coordinates.longitude, coordinates.latitude])
          .addTo(map.current);
        setMarker(newMarker);
      }
    } else {
      // Remove marker on any other step or when coordinates are invalid
      if (marker) {
        marker.remove();
        setMarker(null);
      }
    }
  }, [coordinates, marker, currentStepIndex, showLocationText, hasValidCoordinates, map]);

  // Hide location text when solar panels are generated
  useEffect(() => {
    if (shouldDrawPanels) {
      setShowLocationText(false);
    }
  }, [shouldDrawPanels]);

  // Click-to-place meter marker functionality
  useEffect(() => {
    if (!map.current) return;

    const onMapClick = (e: mapboxgl.MapMouseEvent) => {
      if (mode !== "place-meter") return;

      const { lng, lat } = e.lngLat;

      // Create or move one meter marker
      if (!meterMarkerRef.current) {
        meterMarkerRef.current = new mapboxgl.Marker({ color: "#f59e0b" }) // amber color
          .setLngLat([lng, lat])
          .addTo(map.current!);
      } else {
        meterMarkerRef.current.setLngLat([lng, lat]);
      }

      // Notify parent component so it can enable Continue button
      onPlace?.({ lng, lat });
    };

    map.current.on("click", onMapClick);

    return () => {
      try { 
        map.current?.off("click", onMapClick); 
      } catch {}
    };
  }, [mode, onPlace]);

  // Guard against missing Mapbox token - moved after all hooks
  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    return (
      <div className="w-full flex items-center justify-center bg-gray-100 rounded-lg" style={{ height: '600px' }}>
        <div className="text-center p-8">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Map Unavailable</h3>
          <p className="text-gray-500">Mapbox configuration is missing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <div className="relative w-full h-full overflow-hidden">
        <div 
          ref={mapContainer} 
          className="relative h-full w-full select-none touch-none pointer-events-auto" 
        />
        

        {currentStepIndex === 0 && (
          <div className="absolute left-2 right-2 top-2 lg:left-4 lg:right-4 lg:top-4 z-30">
            <Suspense fallback={
              <div className="bg-white p-2 rounded-lg shadow-lg animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-full"></div>
              </div>
            }>
              <AddressInput />
            </Suspense>
          </div>
        )}


        {isAutoLocationError && (
          <div className="absolute w-[214px] lg:w-auto top-4 lg:top-8 left-[11px] lg:left-[50%] lg:transform lg:-translate-x-1/2 shadow-lg rounded-[12px] lg:rounded-full p-[9.87px] filter backdrop-blur-md bg-white/70 text-xs z-30 flex flex-col lg:flex-row lg:items-center gap-2 text-[#111111]">
            <img src="/images/icons/warning.png" alt="warning" className="w-4 h-4" />
            Locating your address was too tricky! Please type and select your address.
          </div>
        )}

        {mapLoaded && map.current && (
          <MapboxSolarPanel 
            map={map.current} 
            mapLoaded={mapLoaded}
            mode={mode}
          />
        )}
      </div>
    </div>
  );
};

export default MapDrawTool;
