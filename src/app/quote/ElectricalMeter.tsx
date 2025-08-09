'use client';

import { useQuoteContext } from '@/contexts/quoteContext';
import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { updateSheet } from '@/lib/utils';

// Helper types for touch events
type TouchEvt = mapboxgl.MapLayerTouchEvent | mapboxgl.MapTouchEvent;

// Helper function to convert touch event to lngLat
function touchEventLngLat(map: mapboxgl.Map, e: TouchEvt): mapboxgl.LngLatLike | null {
  const te = (e.originalEvent as TouchEvent);
  if (!te || !te.changedTouches || te.changedTouches.length === 0) return null;
  const t = te.changedTouches[0];
  const rect = (map.getContainer() as HTMLElement).getBoundingClientRect();
  const point = new mapboxgl.Point(t.clientX - rect.left, t.clientY - rect.top);
  return map.unproject(point);
}

interface Props {
  map: mapboxgl.Map | null;
  mapLoaded: boolean;
}

const METER_HTML_ELEMENT = `
  <div class="w-[42px] h-[50px] relative meter">
    <div class="absolute top-[-5px] left-0 w-[42px] h-[42px] rounded-full animate-ping bg-yellow-500 z-0 meter-ripple"></div>
    <svg class="relative z-10" width="42" height="50" viewBox="0 0 42 50" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g filter="url(#filter0_dddd_1733_4594)">
        <rect class="meter-bg" x="5" width="32" height="32" rx="16" fill="#FF9F18"/>
        <g clip-path="url(#clip0_1733_4594)">
          <path class="meter-path" d="M26.1319 10.8643C26.132 9.88034 25.8493 8.91706 25.3174 8.08919C24.7856 7.26133 24.027 6.60377 23.132 6.19481C22.237 5.78586 21.2434 5.64275 20.2694 5.78253C19.2954 5.9223 18.3821 6.33907 17.6382 6.9832C16.8944 7.62733 16.3513 8.47168 16.0737 9.41571C15.7961 10.3597 15.7957 11.3636 16.0725 12.3079C16.3493 13.2521 16.8917 14.0969 17.635 14.7417C18.3784 15.3864 19.2913 15.8039 20.2652 15.9445V25.531C20.2652 25.7255 20.3425 25.912 20.48 26.0495C20.6175 26.1871 20.8041 26.2643 20.9986 26.2643C21.1931 26.2643 21.3796 26.1871 21.5171 26.0495C21.6546 25.912 21.7319 25.7255 21.7319 25.531V15.9445C22.9528 15.7665 24.0691 15.1555 24.8768 14.2228C25.6846 13.2902 26.1301 12.0981 26.1319 10.8643ZM20.9986 14.531C20.2734 14.531 19.5645 14.3159 18.9615 13.913C18.3585 13.5101 17.8885 12.9375 17.611 12.2675C17.3335 11.5975 17.2609 10.8603 17.4024 10.149C17.5438 9.43773 17.8931 8.78439 18.4058 8.2716C18.9186 7.7588 19.572 7.40959 20.2832 7.26811C20.9945 7.12663 21.7317 7.19924 22.4017 7.47676C23.0717 7.75428 23.6444 8.22425 24.0473 8.82723C24.4502 9.43021 24.6652 10.1391 24.6652 10.8643C24.6652 11.3458 24.5704 11.8226 24.3861 12.2675C24.2019 12.7124 23.9318 13.1166 23.5913 13.457C23.2508 13.7975 22.8466 14.0676 22.4017 14.2519C21.9569 14.4361 21.4801 14.531 20.9986 14.531Z" fill="white"/>
        </g>
      </g>
      <defs>
        <filter id="filter0_dddd_1733_4594" x="0.2" y="0" width="41.6" height="49.6" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feFlood flood-opacity="0" result="BackgroundImageFix"/>
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
          <feOffset dy="1.6"/>
          <feGaussianBlur stdDeviation="0.8"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.15 0"/>
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_1733_4594"/>
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
          <feOffset dy="3.2"/>
          <feGaussianBlur stdDeviation="1.6"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.13 0"/>
          <feBlend mode="normal" in2="effect1_dropShadow_1733_4594" result="effect2_dropShadow_1733_4594"/>
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
          <feOffset dy="8"/>
          <feGaussianBlur stdDeviation="2.4"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0"/>
          <feBlend mode="normal" in2="effect2_dropShadow_1733_4594" result="effect3_dropShadow_1733_4594"/>
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
          <feOffset dy="12.8"/>
          <feGaussianBlur stdDeviation="2.4"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.02 0"/>
          <feBlend mode="normal" in2="effect3_dropShadow_1733_4594" result="effect4_dropShadow_1733_4594"/>
          <feBlend mode="normal" in="SourceGraphic" in2="effect4_dropShadow_1733_4594" result="shape"/>
        </filter>
        <clipPath id="clip0_1733_4594">
          <rect width="21.3333" height="21.3333" fill="white" transform="translate(10.333 5.33398)"/>
        </clipPath>
      </defs>
    </svg>
  </div>
`
const ElectricalMeter = ({ map, mapLoaded }: Props) => {
  const {
    shouldDrawPanels,
    electricalMeter,
    // mapZoomPercentage, // unused
    setElectricalMeterPosition,
    panelPosition,
    drawRef,
    electricalMeterPosition,
    currentStepIndex
  } = useQuoteContext();

  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const lineFeatureIdRef = useRef<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const scaleFactor = useMemo(() => {
    if (!map) return 1;
    const zoom = map.getZoom(); // this gives live map zoom
    // For example, at zoom 17 => small, zoom 20 => bigger
    return Math.pow(2, zoom - 18); 
  }, [map?.getZoom()]);

  // Modifikasi fungsi createCustomMarker untuk menerapkan scaleFactor
  const createCustomMarker = useCallback((coordinates: [number, number]) => {
    if (!map) return;

    // Remove existing marker if it exists
    if (markerRef.current) {
      try {
        markerRef.current.remove();
      } catch (error) {
        console.error('Error removing existing marker:', error);
      }
      markerRef.current = null;
    }

    // Create marker element with proper styling
    const markerElement = document.createElement('div');
    markerElement.className = 'custom-marker';
    
    // Use the current isDragging state to determine the colors
    const bgColor = isDragging ? '#FFFFFF' : '#FF9F18';
    const pathColor = isDragging ? '#002868' : '#FFFFFF';
    
    // Create the HTML with the correct colors
    let meterHTML = METER_HTML_ELEMENT
      .replace('fill="#FF9F18"', `fill="${bgColor}"`)
      .replace('fill="white"', `fill="${pathColor}"`);
    
    // Also update the ripple color
    if (isDragging) {
      meterHTML = meterHTML.replace('bg-yellow-500', 'bg-white');
    }
    
    markerElement.innerHTML = meterHTML;
    
    // Apply scale to the meter element
    const childElement = markerElement.querySelector('.meter');
    if (childElement) {
      (childElement as HTMLElement).style.transform = `scale(${scaleFactor})`;
      (childElement as HTMLElement).style.transformOrigin = 'center center';
    }

    // Create and add the marker to the map
    const marker = new mapboxgl.Marker({
      element: markerElement,
      draggable: true,
      anchor: 'center'
    })
      .setLngLat(coordinates)
      .addTo(map);

    // Add mobile-friendly styles
    markerElement.style.touchAction = 'none';
    markerElement.style.cursor = 'move';
    
    // Increase hit area for mobile
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      markerElement.style.padding = '12px';
      markerElement.style.margin = '-12px';
    }

    // Store reference and update position
    markerRef.current = marker;
    setElectricalMeterPosition(coordinates);
    
    return marker;
  }, [map, scaleFactor, setElectricalMeterPosition, isDragging]);

  useEffect(() => {
    if (!markerRef.current) return;
    const element = markerRef.current.getElement();
    const meterElement = element.querySelector('.meter');
    if (meterElement) {
      (meterElement as HTMLElement).style.transform = `scale(${scaleFactor})`;
      (meterElement as HTMLElement).style.transformOrigin = 'center center';
    }

    // Apply the correct colors based on the isDragging state
    const bgElement = element.querySelector('.meter-bg');
    const pathElement = element.querySelector('.meter-path');
    const rippleElement = element.querySelector('.meter-ripple');
    
    if (bgElement) {
      (bgElement as SVGElement).setAttribute('fill', isDragging ? '#FFFFFF' : '#FF9F18');
    }
    
    if (pathElement) {
      (pathElement as SVGElement).setAttribute('fill', isDragging ? '#002868' : '#FFFFFF');
    }
    
    if (rippleElement) {
      if (isDragging) {
        (rippleElement as HTMLElement).classList.remove('bg-yellow-500');
        (rippleElement as HTMLElement).classList.add('bg-white');
      } else {
        (rippleElement as HTMLElement).classList.remove('bg-white');
        (rippleElement as HTMLElement).classList.add('bg-yellow-500');
      }
    }

    if (!panelPosition) return;
    const markerLngLat = markerRef.current.getLngLat();
    const newCoords: [number, number] = [markerLngLat.lng, markerLngLat.lat];
    setElectricalMeterPosition(newCoords);
  }, [scaleFactor, isDragging]);

  useEffect(() => {
    if (!map || !mapLoaded || !drawRef.current || (currentStepIndex === 0)) return;

    // Unified handler for placing meter on click or touch
    const handleMapPlacement = (lngLat: mapboxgl.LngLatLike) => {
      if (!markerRef.current) {
        try {
          const coords = lngLat as mapboxgl.LngLat;
          const meterCoords: [number, number] = [coords.lng, coords.lat];
          setElectricalMeterPosition(meterCoords);
          createCustomMarker(meterCoords);
        } catch (error) {
          console.error('Error handling map placement:', error);
        }
      }
    };

    const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
      if (e.lngLat) handleMapPlacement(e.lngLat);
    };

    const handleMapTouch = (e: TouchEvt) => {
      const ll = touchEventLngLat(map, e);
      if (ll) handleMapPlacement(ll);
    };

    const onDrag = () => {
      if (!markerRef.current) return;
      
      // Set dragging state to true
      setIsDragging(true);
      
      // Change colors when dragging
      const element = markerRef.current.getElement();
      const bgElement = element.querySelector('.meter-bg');
      const pathElement = element.querySelector('.meter-path');
      const rippleElement = element.querySelector('.meter-ripple');
      
      if (bgElement) {
        (bgElement as SVGElement).setAttribute('fill', '#FFFFFF');
      }
      
      if (pathElement) {
        (pathElement as SVGElement).setAttribute('fill', '#002868');
      }
      
      if (rippleElement) {
        (rippleElement as HTMLElement).classList.remove('bg-yellow-500');
        (rippleElement as HTMLElement).classList.add('bg-white');
      }
      
      const markerLngLat = markerRef.current.getLngLat();
      const newCoords: [number, number] = [markerLngLat.lng, markerLngLat.lat];
      setElectricalMeterPosition(newCoords);
    };

    const onDragEnd = () => {
      if (!markerRef.current) return;
      
      // Set dragging state to false
      setIsDragging(false);
      
      // Restore original colors
      const element = markerRef.current.getElement();
      const bgElement = element.querySelector('.meter-bg');
      const pathElement = element.querySelector('.meter-path');
      const rippleElement = element.querySelector('.meter-ripple');
      
      if (bgElement) {
        (bgElement as SVGElement).setAttribute('fill', '#FF9F18');
      }
      
      if (pathElement) {
        (pathElement as SVGElement).setAttribute('fill', '#FFFFFF');
      }
      
      if (rippleElement) {
        (rippleElement as HTMLElement).classList.remove('bg-white');
        (rippleElement as HTMLElement).classList.add('bg-yellow-500');
      }
      
      const markerLngLat = markerRef.current.getLngLat();
      const newCoords: [number, number] = [markerLngLat.lng, markerLngLat.lat];
      setElectricalMeterPosition(newCoords);
    };

    // Use requestAnimationFrame for smoother updates
    const onDragThrottled = () => {
      requestAnimationFrame(onDrag);
    };

    const onDragStart = () => {
      if (!markerRef.current) return;
      
      // Set dragging state to true
      setIsDragging(true);
      
      // Change colors when dragging starts
      const element = markerRef.current.getElement();
      const bgElement = element.querySelector('.meter-bg');
      const pathElement = element.querySelector('.meter-path');
      const rippleElement = element.querySelector('.meter-ripple');
      
      if (bgElement) {
        (bgElement as SVGElement).setAttribute('fill', '#FFFFFF');
      }
      
      if (pathElement) {
        (pathElement as SVGElement).setAttribute('fill', '#002868');
      }
      
      if (rippleElement) {
        (rippleElement as HTMLElement).classList.remove('bg-yellow-500');
        (rippleElement as HTMLElement).classList.add('bg-white');
      }
    };

    if (markerRef.current) {
      markerRef.current.on('dragstart', onDragStart);
      markerRef.current.on('drag', onDragThrottled);
      markerRef.current.on('dragend', onDragEnd);
    }

    // Add both click and touchend event handlers
    map.on('click', handleMapClick);
    map.on('touchend', handleMapTouch);
    console.log("electricalMeterPosition", electricalMeterPosition)
    if (!electricalMeterPosition) return;

    const timeout = setTimeout(() => {
      const [lng, lat] = electricalMeterPosition;

      // Call async function safely
      (async () => {
        try {
          await updateSheet('F', `Long: ${lng}, Lat: ${lat}`);
        } catch (err) {
          console.error('Failed to update sheet:', err);
        }
      })();
    }, 500);
    return () => {
      clearTimeout(timeout)
      if (map && map.loaded()) {
        try {
          map.off('click', handleMapClick);
          map.off('touchend', handleMapTouch);
        } catch (error) {
          console.error('Error cleaning up ElectricalMeter:', error);
        }
      }

      if (markerRef.current) {
        try {
          markerRef.current.off('dragstart', onDragStart);
          markerRef.current.off('drag', onDragThrottled);
          markerRef.current.off('dragend', onDragEnd);
        } catch (error) {
          console.error('Error cleaning up ElectricalMeter:', error);
        }
      }
    };
  }, [map, mapLoaded, shouldDrawPanels, drawRef, createCustomMarker, panelPosition, electricalMeterPosition, currentStepIndex]);

  useEffect(() => {
    if (!electricalMeter || !shouldDrawPanels) {
      if (markerRef.current) {
        try {
          // Remove event listeners
          markerRef.current.off('drag', () => {});
          markerRef.current.off('dragend', () => {});
          
          // Remove the marker from the map
          markerRef.current.remove();
          markerRef.current = null;
        } catch (error) {
          console.error('Error cleaning up marker:', error);
        }
      }

      if (lineFeatureIdRef.current && drawRef.current) {
        try {
          drawRef.current.delete(lineFeatureIdRef.current);
          lineFeatureIdRef.current = null;
        } catch (error) {
          console.error('Error cleaning up line:', error);
        }
      }
    }
  }, [drawRef, electricalMeter, shouldDrawPanels]);

  return (<></>);
};

export default ElectricalMeter;
