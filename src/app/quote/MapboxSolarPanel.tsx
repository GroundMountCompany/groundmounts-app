'use client';

import { useQuoteContext } from '@/contexts/quoteContext';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import ElectricalMeter from './ElectricalMeter';

interface Props {
  map: mapboxgl.Map | null;
  mapLoaded: boolean;
}

const ROWS = 4; // Fixed number of rows
const SOLAR_SINGLE_ELEMENT = `
  <div class="block border-2 border-white rounded-xs">
    <svg width="37" height="19" viewBox="0 0 37 19" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 0H37V19H0V0Z" fill="#201d64"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M0 0.00390625V18.6039H36.6V0.00390625H0ZM35 12.0039C35.5523 12.0039 36 11.5562 36 11.0039V7.60391C36 7.05162 35.5523 6.60391 35 6.60391L31.6 6.60391C31.0477 6.60391 30.6 7.05162 30.6 7.60391V11.0039C30.6 11.5562 31.0477 12.0039 31.6 12.0039H35ZM29 12.0039C29.5523 12.0039 30 11.5562 30 11.0039V7.60391C30 7.05162 29.5523 6.60391 29 6.60391L25.6 6.60391C25.0477 6.60391 24.6 7.05162 24.6 7.60391V11.0039C24.6 11.5562 25.0477 12.0039 25.6 12.0039H29ZM36 13.6039C36 13.0516 35.5523 12.6039 35 12.6039H31.6C31.0477 12.6039 30.6 13.0516 30.6 13.6039V17.0039C30.6 17.5562 31.0477 18.0039 31.6 18.0039H36V13.6039ZM29 18.0039C29.5523 18.0039 30 17.5562 30 17.0039V13.6039C30 13.0516 29.5523 12.6039 29 12.6039H25.6C25.0477 12.6039 24.6 13.0516 24.6 13.6039V17.0039C24.6 17.5562 25.0477 18.0039 25.6 18.0039H29ZM36 5.00391C36 5.55619 35.5523 6.00391 35 6.00391H31.6C31.0477 6.00391 30.6 5.55619 30.6 5.00391V1.60391C30.6 1.05162 31.0477 0.603906 31.6 0.603906H36V5.00391ZM24.6 5.00391C24.6 5.55619 25.0477 6.00391 25.6 6.00391H29C29.5523 6.00391 30 5.55619 30 5.00391V1.60391C30 1.05162 29.5523 0.603906 29 0.603906H25.6C25.0477 0.603906 24.6 1.05162 24.6 1.60391V5.00391ZM23 12.6039C23.5523 12.6039 24 13.0516 24 13.6039V17.0039C24 17.5562 23.5523 18.0039 23 18.0039H19.6C19.0477 18.0039 18.6 17.5562 18.6 17.0039V13.6039C18.6 13.0516 19.0477 12.6039 19.6 12.6039H23ZM23 6.60391C23.5523 6.60391 24 7.05162 24 7.60391V11.0039C24 11.5562 23.5523 12.0039 23 12.0039H19.6C19.0477 12.0039 18.6 11.5562 18.6 11.0039V7.60391C18.6 7.05162 19.0477 6.60391 19.6 6.60391L23 6.60391ZM23 6.00391C23.5523 6.00391 24 5.55619 24 5.00391V1.60391C24 1.05162 23.5523 0.603906 23 0.603906H19.6C19.0477 0.603906 18.6 1.05162 18.6 1.60391V5.00391C18.6 5.55619 19.0477 6.00391 19.6 6.00391H23ZM17 12.0039C17.5523 12.0039 18 11.5562 18 11.0039V7.60391C18 7.05162 17.5523 6.60391 17 6.60391L13.6 6.60391C13.0477 6.60391 12.6 7.05162 12.6 7.60391V11.0039C12.6 11.5562 13.0477 12.0039 13.6 12.0039H17ZM17 18.0039C17.5523 18.0039 18 17.5562 18 17.0039V13.6039C18 13.0516 17.5523 12.6039 17 12.6039H13.6C13.0477 12.6039 12.6 13.0516 12.6 13.6039V17.0039C12.6 17.5562 13.0477 18.0039 13.6 18.0039H17ZM12.6 5.00391C12.6 5.55619 13.0477 6.00391 13.6 6.00391H17C17.5523 6.00391 18 5.55619 18 5.00391V1.60391C18 1.05162 17.5523 0.603906 17 0.603906H13.6C13.0477 0.603906 12.6 1.05162 12.6 1.60391V5.00391ZM11 12.6039C11.5523 12.6039 12 13.0516 12 13.6039V17.0039C12 17.5562 11.5523 18.0039 11 18.0039H7.6C7.04772 18.0039 6.6 17.5562 6.6 17.0039L6.6 13.6039C6.6 13.0516 7.04772 12.6039 7.6 12.6039H11ZM11 6.60391C11.5523 6.60391 12 7.05162 12 7.60391V11.0039C12 11.5562 11.5523 12.0039 11 12.0039H7.6C7.04772 12.0039 6.6 11.5562 6.6 11.0039V7.60391C6.6 7.05162 7.04772 6.60391 7.6 6.60391L11 6.60391ZM11 6.00391C11.5523 6.00391 12 5.55619 12 5.00391V1.60391C12 1.05162 11.5523 0.603906 11 0.603906H7.6C7.04772 0.603906 6.6 1.05162 6.6 1.60391L6.6 5.00391C6.6 5.55619 7.04772 6.00391 7.6 6.00391H11ZM5 12.0039C5.55228 12.0039 6 11.5562 6 11.0039V7.60391C6 7.05162 5.55228 6.60391 5 6.60391H1.6C1.04772 6.60391 0.6 7.05162 0.6 7.60391V11.0039C0.6 11.5562 1.04772 12.0039 1.6 12.0039H5ZM5 18.0039C5.55228 18.0039 6 17.5562 6 17.0039V13.6039C6 13.0516 5.55228 12.6039 5 12.6039H1.6C1.04772 12.6039 0.6 13.0516 0.6 13.6039V18.0039H5ZM0.6 5.00391C0.6 5.55619 1.04772 6.00391 1.6 6.00391H5C5.55228 6.00391 6 5.55619 6 5.00391V1.60391C6 1.05162 5.55228 0.603906 5 0.603906H0.6V5.00391Z" fill="#423E9B"/>
    </svg>
  </div>
`
const SOLAR_WRAP_ELEMENT = `<div class="grid grid-flow-col grid-rows-4 p-[6px] bg-[#201d64] transform">`

const MapboxSolarPanel = ({ map, mapLoaded }: Props) => {
  const {
    mapZoomPercentage,
    totalPanels,
    shouldDrawPanels,
    panelPosition,
    setPanelPosition,
    electricalMeterPosition,
    lineFeatureIdRef,
    drawRef,
    setElectricalMeter,
    setAdditionalCost,
    setElectricalMeterPosition
  } = useQuoteContext();

  const solarMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [showDragNotice, setShowDragNotice] = useState(false);

  // Calculate the actual number of panels (rounded up to multiple of 4)
  const actualPanels = useMemo(() => {
    return Math.ceil(totalPanels / ROWS) * ROWS;
  }, [totalPanels]);

  console.log('actualPanels', actualPanels)
  const scaleFactor = useMemo(() => {
    if (mapZoomPercentage < 50) {
      return 0.4;
    } else if (mapZoomPercentage < 100) {
      return 0.6;
    } else if (mapZoomPercentage < 150) {
      return 1;
    } else {
      return 1.2;
    }
  }, [mapZoomPercentage]);

  // Create panel marker
  const createPanelMarker = useCallback((coordinates: [number, number]) => {
    if (!map) return;

    if (solarMarkerRef.current) {
      solarMarkerRef.current.remove();
      solarMarkerRef.current = null;
    }

    const solarMarkerElement = document.createElement('div');
    solarMarkerElement.className = 'solar-marker';

    const elements: string[] = [];
    elements.push(SOLAR_WRAP_ELEMENT);
    for (let i = 0; i < actualPanels; i++) {
      elements.push(SOLAR_SINGLE_ELEMENT);
    }
    elements.push('</div>');
    solarMarkerElement.innerHTML = elements.join('');

    const childElement = solarMarkerElement.querySelector('.grid');
    if (childElement) {
      (childElement as HTMLElement).style.transform = `scale(${scaleFactor})`;
      (childElement as HTMLElement).style.transformOrigin = 'center center';
    }

    const marker = new mapboxgl.Marker({
      element: solarMarkerElement,
      draggable: true
    })
      .setLngLat(coordinates)
      .addTo(map);

    solarMarkerRef.current = marker;
  }, [scaleFactor, map, actualPanels, solarMarkerRef.current]);

  // Initialize MapboxDraw
  useEffect(() => {
    if (!map || !mapLoaded) return;

    if (!drawRef.current) {
      drawRef.current = new MapboxDraw({
        displayControlsDefault: false,
        defaultMode: 'simple_select',
        styles: [
          // Add shadow layer first so it appears behind the panels
          {
            'id': 'solar-panels-shadow',
            'type': 'fill',
            'filter': ['all',
              ['==', '$type', 'Polygon'],
              ['==', 'meta', 'feature']
            ],
            'paint': {
              'fill-color': '#000000',
              'fill-opacity': 0.3,
              'fill-translate': [3, 3]
            }
          },
          {
            'id': 'solar-panels-fill',
            'type': 'fill',
            'filter': ['all',
              ['==', '$type', 'Polygon'],
              ['==', 'meta', 'feature'],
              ['==', 'active', 'false']
            ],
            'paint': {
              'fill-color': '#080440',
              'fill-opacity': 0.8,
              'fill-outline-color': '#ffffff'
            }
          },
          {
            'id': 'solar-panels-fill-active',
            'type': 'fill',
            'filter': ['all',
              ['==', '$type', 'Polygon'],
              ['==', 'meta', 'feature'],
              ['==', 'active', 'true']
            ],
            'paint': {
              'fill-color': '#080440',
              'fill-opacity': 0.9,
              'fill-outline-color': '#ffffff'
            }
          },
          // Add outline layer for thicker borders
          {
            'id': 'solar-panels-outline',
            'type': 'line',
            'filter': ['all',
              ['==', '$type', 'Polygon'],
              ['==', 'meta', 'feature']
            ],
            'paint': {
              'line-color': '#ffffff',
              'line-width': 2
            }
          },
          // Meter point style
          {
            'id': 'electrical-meter-point',
            'type': 'circle',
            'filter': ['all',
              ['==', '$type', 'Point'],
              ['==', 'meta', 'feature']
            ],
            'paint': {
              'circle-radius': 8,
              'circle-color': '#fbbf24',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff'
            }
          },
          // Line style
          {
            'id': 'meter-to-panel-line',
            'type': 'line',
            'filter': ['all',
              ['==', '$type', 'LineString'],
              ['==', 'meta', 'feature']
            ],
            'paint': {
              'line-color': '#fbbf26',
              'line-width': 2,
              'line-dasharray': [2, 2]
            }
          }
        ]
      });
      map.addControl(drawRef.current);
    }

    return () => {
      if (map && map.loaded() && drawRef.current) {
        try {
          map.removeControl(drawRef.current);
        } catch (error) {
          console.warn('Error cleaning up MapboxDraw:', error);
        }
        drawRef.current = null;
      }
    };
  }, [map, mapLoaded]);

  // create solar marker and remove solar marker if actuall panels is 0
  useEffect(() => {
    if (!map || !mapLoaded) return;

    const center = map.getCenter();
    if (!panelPosition) setPanelPosition([center.lng, center.lat]);
    
    if (actualPanels > 0) {
      // drawRef.current?.delete(solarMarkerRef.current);

      solarMarkerRef.current?.remove();
      solarMarkerRef.current = null;
      if (panelPosition) {
        createPanelMarker(panelPosition);
      } else {
        createPanelMarker([center.lng, center.lat]);
      }
      setShowDragNotice(true);
    } else {
      setShowDragNotice(false);
      drawRef.current?.delete(lineFeatureIdRef.current);
      lineFeatureIdRef.current = null;
    }
  }, [actualPanels, map, mapLoaded]);

  // Add handler for solar panel marker movement
  useEffect(() => {
    if (!map || !mapLoaded || !shouldDrawPanels || !drawRef.current) return;

    const onDrag = () => {
      if (!solarMarkerRef.current) return;
      const solarMarkerLngLat = solarMarkerRef.current.getLngLat();
      const newCoords: [number, number] = [solarMarkerLngLat.lng, solarMarkerLngLat.lat];
      console.log('newCoords1', newCoords)
      setPanelPosition(newCoords);
    };

    const onDragEnd = () => {
      if (!solarMarkerRef.current) return;
      const solarMarkerLngLat = solarMarkerRef.current.getLngLat();
      const newCoords = [solarMarkerLngLat.lng, solarMarkerLngLat.lat];
      console.log('newCoords2', newCoords)
      setPanelPosition(newCoords);
    };

    // Use requestAnimationFrame for smoother updates
    const onDragThrottled = () => {
      requestAnimationFrame(onDrag);
    };

    if (solarMarkerRef.current) {
      solarMarkerRef.current.on('drag', onDragThrottled);
      solarMarkerRef.current.on('dragend', onDragEnd);
    }

    return () => {
      if (solarMarkerRef.current) {
        try {
          solarMarkerRef.current?.off('drag', onDragThrottled);
          solarMarkerRef.current?.off('dragend', onDragEnd);
        } catch (error) {
          console.error('Error cleaning up solar panel:', error);
        }
      }
    };
  }, [map, mapLoaded, shouldDrawPanels, drawRef.current, electricalMeterPosition, panelPosition, actualPanels]);

  // REMOVE ALL ELEMENTS WHEN TOTAL PANELS IS 0
  useEffect(() => {
    if (totalPanels === 0) {
      // Hapus marker
      if (solarMarkerRef.current) {
        solarMarkerRef.current.off('drag', () => {});
        solarMarkerRef.current.off('dragend', () => {});
        solarMarkerRef.current.remove();
        solarMarkerRef.current = null;
      }

      // Hapus garis
      if (lineFeatureIdRef.current && drawRef.current) {
        drawRef.current.delete(lineFeatureIdRef.current);
        lineFeatureIdRef.current = null;
      }

      setElectricalMeter({
        coordinates: {
          latitude: 0,
          longitude: 0
        },
        distanceInFeet: 0
      });
      setAdditionalCost(0);
      setElectricalMeterPosition(null);
      setPanelPosition(null);
    }
  }, [totalPanels]);

  useEffect(() => {
    if (!solarMarkerRef.current) return;
    const element = solarMarkerRef.current.getElement();
    const meterElement = element.querySelector('.grid');
    if (meterElement) {
      (meterElement as HTMLElement).style.transform = `scale(${scaleFactor})`;
      (meterElement as HTMLElement).style.transformOrigin = 'center center';
    }
  }, [scaleFactor])

  const focusOnPanels = useCallback(() => {
    if (!map || !panelPosition) return;

    map.flyTo({
      center: [panelPosition[0], panelPosition[1]],
      zoom: 19,
      duration: 1500,
      essential: true
    });
  }, [map, panelPosition]);

  return (
    <>
      {!electricalMeterPosition && (
        <div className="absolute top-[30px] left-1/2 transform -translate-x-1/2 z-10">
          <div className="bg-white/70 backdrop-blur-md px-4 py-2 rounded-full shadow-lg text-sm text-gray-700 flex items-center gap-2 transition-opacity duration-300">
          <svg width="12" height="13" viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g filter="url(#filter0_d_1811_38540)">
                <path d="M7.33301 4.4974H10.6663V7.16406H7.33301V10.4974H4.66634V7.16406H1.33301V4.4974H4.66634V1.16406H7.33301V4.4974Z" fill="black"/>
                <path d="M6.66667 5.16536H10V6.4987H6.66667V9.83203H5.33333V6.4987H2V5.16536H5.33333V1.83203H6.66667V5.16536Z" fill="white"/>
              </g>
              <defs>
              <filter id="filter0_d_1811_38540" x="0.133008" y="0.630729" width="11.733" height="11.732" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                <feOffset dy="0.666667"/>
                <feGaussianBlur stdDeviation="0.6"/>
                <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.65 0"/>
                <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_1811_38540"/>
                <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_1811_38540" result="shape"/>
              </filter>
              </defs>
            </svg>
            Click/pin the location where the meter is placed.
          </div>
        </div>
      )}
      { actualPanels > 0 && (
        <div className="absolute bottom-[30px] left-1/2 transform -translate-x-1/2 z-10">
          <button
            onClick={focusOnPanels}
            onTouchEnd={(e) => {
              e.preventDefault();
              focusOnPanels();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white/70 backdrop-blur-md rounded-full shadow-lg text-sm font-medium text-gray-700 hover:bg-white/90 transition-all duration-200"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
              <path d="M19 19l-1.5-1.5M19 5l-1.5 1.5M5 19l1.5-1.5M5 5l1.5 1.5" strokeLinecap="round" />
            </svg>
            Focus on Panels
          </button>
        </div>
      )}
      <ElectricalMeter map={map} mapLoaded={mapLoaded} />
    </>
  );
};

export default MapboxSolarPanel;
