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

export const MapDrawTool = () => {
  const { coordinates, currentStepIndex, isAutoLocationError, shouldDrawPanels, setMapZoomPercentage, mapZoomPercentage, address } = useQuoteContext();
  
  // Guard against missing Mapbox token
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
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [zoom, setZoom] = useState(18.5);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [marker, setMarker] = useState<mapboxgl.Marker | null>(null);
  const [showLocationText, setShowLocationText] = useState(true);
  const [hasValidCoordinates, setHasValidCoordinates] = useState(false);
  const cleanupRef = useRef(false);
  const [mapInteractive, setMapInteractive] = useState(false);

  // Track when coordinates are set from AddressInput or geolocation
  useEffect(() => {
    // Only set valid coordinates when we have an address or successful geolocation
    if (coordinates.longitude !== 0 && coordinates.latitude !== 0 && !isAutoLocationError && address.length > 0) {
      setHasValidCoordinates(true);
    } else {
      setHasValidCoordinates(false);
    }
  }, [coordinates, isAutoLocationError, address]);

  // Add effect to toggle interactive class on the map container
  useEffect(() => {
    if (!map.current) return;
    
    const mapCanvas = map.current.getCanvas();
    if (mapInteractive) {
      mapCanvas.parentElement?.classList.add('interactive');
      
      // When interactive, we no longer need to change the z-index of the map container
      // as we'll use pointer-events instead to allow interaction
      if (mapContainer.current) {
        mapContainer.current.style.pointerEvents = 'auto';
        
        // Enable touch events on mobile
        mapContainer.current.style.touchAction = 'auto';
      }
      
      // Ensure map is fully interactive
      map.current.boxZoom.enable();
      map.current.scrollZoom.enable();
      map.current.dragPan.enable();
      map.current.dragRotate.disable(); // Keep rotation disabled
      map.current.keyboard.enable();
      map.current.doubleClickZoom.enable();
      map.current.touchZoomRotate.enable();
    } else {
      mapCanvas.parentElement?.classList.remove('interactive');
      
      // Reset pointer-events when not interactive
      if (mapContainer.current) {
        mapContainer.current.style.pointerEvents = 'none';
        
        // Disable touch events on mobile when not interactive
        mapContainer.current.style.touchAction = 'none';
      }
      
      // Disable map interactions when not interactive
      if (map.current) {
        map.current.boxZoom.disable();
        map.current.scrollZoom.disable();
        map.current.dragPan.disable();
        map.current.dragRotate.disable();
        map.current.keyboard.disable();
        map.current.doubleClickZoom.disable();
        map.current.touchZoomRotate.disable();
      }
    }
  }, [mapInteractive]);

  // Initialize map only once
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    cleanupRef.current = false;

    // Initialize map
    const newMap = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-v9',
      center: [coordinates.longitude, coordinates.latitude],
      zoom: zoom,
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
    setMapZoomPercentage(Math.round(((zoom - 17) / 3) * 200));

    // Wait for map to load before adding controls
    newMap.on('load', () => {
      if (cleanupRef.current) return;

      const nav = new mapboxgl.NavigationControl({
        showCompass: false,
        showZoom: true
      });
      newMap.addControl(nav, 'bottom-right');

      // Add zoom change handler
      let zoomTimeout: NodeJS.Timeout;
      newMap.on('zoom', () => {
        const currentZoom = newMap.getZoom();
        setMapZoomPercentage(Math.round(((currentZoom - 17) / 3) * 200));

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
          setMapZoomPercentage(Math.round(((20 - 17) / 3) * 200));
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
        map.current.setCenter([coordinates.longitude, coordinates.latitude]);
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

  return (
    <div className="w-full" style={{ height: '600px' }}>
      <div className="relative w-full h-full rounded-lg overflow-hidden">
        <div 
          ref={mapContainer} 
          className="absolute inset-0 w-full h-full" 
          onTouchStart={mapInteractive ? undefined : (e) => e.stopPropagation()}
        />
        
        {!mapInteractive && (
          <div 
            className="absolute inset-0 z-20 bg-black/30 flex items-center justify-center touch-auto md:hidden"
            onClick={() => setMapInteractive(true)}
            onTouchEnd={(e) => {
              e.preventDefault();
              setMapInteractive(true);
            }}
          >
            <div className="bg-white px-4 py-2 rounded-full shadow-lg text-sm font-medium">
              Tap to interact with map
            </div>
          </div>
        )}
        
        {mapInteractive && (
          <button 
            className="absolute top-4 lg:top-8 left-4 lg:left-[30px] shadow-lg rounded-full px-4 py-2 filter backdrop-blur-md bg-white/70 text-xs lg:text-sm z-30 md:hidden"
            onClick={() => setMapInteractive(false)}
            onTouchEnd={(e) => {
              e.preventDefault();
              setMapInteractive(false);
            }}
          >
            Done
          </button>
        )}

        {currentStepIndex === 0 && (
          <div className="absolute left-4 right-4 bottom-[18px] lg:bottom-4 lg:left-[50%] lg:transform lg:-translate-x-1/2 rounded-md z-30">
            <Suspense fallback={
              <div className="bg-white p-4 rounded-lg shadow-lg animate-pulse">
                <div className="h-10 bg-gray-200 rounded w-full"></div>
              </div>
            }>
              <AddressInput />
            </Suspense>
          </div>
        )}

        <div className="absolute top-4 lg:top-8 right-4 lg:right-[30px] shadow-lg rounded-full px-4 py-2 filter backdrop-blur-md bg-white/70 text-xs lg:text-sm z-30">
          Zoom : {mapZoomPercentage}%
        </div>

        {isAutoLocationError && (
          <div className="absolute w-[214px] lg:w-auto top-4 lg:top-8 left-[11px] lg:left-[50%] lg:transform lg:-translate-x-1/2 shadow-lg rounded-[12px] lg:rounded-full p-[9.87px] filter backdrop-blur-md bg-white/70 text-xs z-30 flex flex-col lg:flex-row lg:items-center gap-2 text-[#111111]">
            <img src="/images/icons/warning.png" alt="warning" className="w-4 h-4" />
            Locating your address was too tricky! Please type and select your address.
          </div>
        )}

        {mapLoaded && map.current && (
          <MapboxSolarPanel map={map.current} mapLoaded={mapLoaded} />
        )}
      </div>
    </div>
  );
};

export default MapDrawTool;
