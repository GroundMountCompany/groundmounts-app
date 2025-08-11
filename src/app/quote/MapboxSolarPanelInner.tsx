'use client';

import { useQuoteContext } from '@/contexts/quoteContext';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { useEffect, useMemo, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import ElectricalMeter from './ElectricalMeter';
import * as turf from '@turf/turf';


function upsertMeterPanelLine(
  map: mapboxgl.Map,
  draw: MapboxDraw,
  lineFeatureIdRef: React.MutableRefObject<string | null>,
  meterPos: [number, number],
  panelPos: [number, number]
) {
  // Construct a simple LineString between meter and panels
  const lineGeoJSON = {
    type: 'Feature' as const,
    properties: { meta: 'feature' },
    geometry: {
      type: 'LineString' as const,
      coordinates: [meterPos, panelPos],
    },
  };

  // If a line exists, update it; otherwise add and remember its id
  if (lineFeatureIdRef.current) {
    try {
      draw.delete(lineFeatureIdRef.current);
    } catch {}
    lineFeatureIdRef.current = null;
  }
  const id = draw.add(lineGeoJSON);
  // MapboxDraw returns feature(s). Capture first id.
  const newId = Array.isArray(id) ? String(id[0]) : String(id);
  lineFeatureIdRef.current = newId;
}

interface Props {
  map: mapboxgl.Map | null;
  mapLoaded: boolean;
  mode?: "default" | "place-meter" | "preview" | "design";
  initialZoomPercent?: number;
  initialCenter?: [number, number];
  showMeterAtCenter?: boolean;
  disableInteractions?: boolean;
  /** When false, do NOT mount the ElectricalMeter placement UI (calculator step). */
  allowMeterPlacement?: boolean;
  // Design mode props
  designPanels?: number;
  designGrid?: { rows: number; cols: number };
  designPanelSize?: { w: number; h: number };
  meterPosition?: [number, number];
  arrayPosition?: [number, number] | null;
  onArrayMove?: (lngLat: { lng: number; lat: number }) => void;
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

// Zoom conversion helpers
function zoomFromPercent(p: number, min: number, max: number) {
  const clamped = Math.max(0, Math.min(100, p));
  return min + (max - min) * (clamped / 100);
}
function percentFromZoom(z: number, min: number, max: number) {
  if (max === min) return 0;
  const p = ((z - min) / (max - min)) * 100;
  return Math.round(Math.max(0, Math.min(100, p)));
}

const MapboxSolarPanelInner = ({ 
  map, 
  mapLoaded, 
  mode = "default",
  initialZoomPercent,
  initialCenter,
  // showMeterAtCenter,
  disableInteractions,
  allowMeterPlacement = true,
  // Design mode props
  // designPanels = 0,
  designGrid = { rows: 1, cols: 1 },
  designPanelSize = { w: 1.2, h: 2.1 },
  meterPosition,
  arrayPosition,
  onArrayMove
}: Props) => {
  const {
    mapZoomPercentage,
    setMapZoomPercentage,
    totalPanels,
    shouldDrawPanels,
    panelPosition,
    setPanelPosition,
    electricalMeterPosition,
    lineFeatureIdRef,
    drawRef,
    setElectricalMeter,
    setAdditionalCost,
    currentStepIndex
  } = useQuoteContext();

  const solarMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const raf = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const previewMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const arrayMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const arrayCenterRef = useRef<[number, number] | null>(null);


  // Calculate the actual number of panels (rounded up to multiple of 4)
  const actualPanels = useMemo(() => {
    return Math.ceil(totalPanels / ROWS) * ROWS;
  }, [totalPanels]);

  console.log('actualPanels', actualPanels)

  // Initialize map zoom and center
  useEffect(() => {
    if (!map || initializedRef.current) return;

    const min = map.getMinZoom();
    const max = map.getMaxZoom();

    const startPercent = typeof initialZoomPercent === "number" ? initialZoomPercent : 0;
    const clamped = Math.max(0, Math.min(100, startPercent));

    // Center first if provided (for preview mode)
    if (initialCenter && Array.isArray(initialCenter)) {
      map.jumpTo({ center: initialCenter, zoom: zoomFromPercent(clamped, min, max) });
    } else {
      map.jumpTo({ zoom: zoomFromPercent(clamped, min, max) });
    }

    const handleZoom = () => {
      const p = percentFromZoom(map.getZoom(), min, max);
      setMapZoomPercentage?.(p);
    };
    map.on("zoomend", handleZoom);
    map.on("moveend", handleZoom);

    // Disable interactions if requested (for preview mode)
    if (disableInteractions) {
      map.scrollZoom.disable();
      map.boxZoom.disable();
      map.dragRotate.disable();
      map.dragPan.disable();
      map.keyboard.disable();
      map.doubleClickZoom.disable();
      map.touchZoomRotate.disable();
    }

    initializedRef.current = true;
    return () => {
      try {
        map.off("zoomend", handleZoom);
        map.off("moveend", handleZoom);
      } catch {}
    };
  }, [map, setMapZoomPercentage, initialZoomPercent, initialCenter, disableInteractions]);
  const getMetersPerPixel = (latitude: number, zoom: number) => {
    const earthCircumference = 40075016.686; // in meters
    const latitudeRadians = latitude * (Math.PI / 180);
    return earthCircumference * Math.cos(latitudeRadians) / Math.pow(2, zoom + 8);
  };
  
  const scaleFactor = useMemo(() => {
    if (!map) return 1;
    const zoom = map.getZoom();
    const center = map.getCenter();
    const metersPerPixel = getMetersPerPixel(center.lat, zoom);
  
    // Your panel system real-world size
    const panelWidthFeet = 6; // 1 panel = 6 feet wide
    // const panelHeightFeet = 2.5; // assume height like 2.5 feet
    const systemRows = 4; // always 4 rows = height fixed
    const systemCols = Math.ceil(totalPanels / systemRows); // columns based on total panels
  
    const systemWidthFeet = systemCols * panelWidthFeet;
    // const systemHeightFeet = systemRows * panelHeightFeet;
  
    // Convert feet to meters
    const feetToMeters = 0.3048;
    const systemWidthMeters = systemWidthFeet * feetToMeters;
    // const systemHeightMeters = systemHeightFeet * feetToMeters;
  
    // Calculate desired pixel size based on meters
    const desiredWidthPixels = systemWidthMeters / metersPerPixel;
    const baseSvgWidthPixels = systemCols * 37; // 37 is your <svg width="37"> you set per panel
    const scale = desiredWidthPixels / baseSvgWidthPixels;
  
    return scale * 1.8;
  }, [map?.getZoom(), map?.getCenter(), totalPanels]);


  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

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
  }, [scaleFactor, map, actualPanels]);

  // Map move handler - stable with useCallback
  const onMove = useCallback(() => {
    // Handle map movement logic here if needed
  }, []);

  // Map drag handler - stable with useCallback  
  const onDrag = useCallback(() => {
    // Handle map drag logic here if needed
  }, []);

  // Preview marker for preview mode
  useEffect(() => {
    if (!map) return;
    if (mode !== "preview") return;
    if (!initialCenter) return;

    // Place or update fixed marker at center
    if (!previewMarkerRef.current) {
      previewMarkerRef.current = new mapboxgl.Marker({ color: "#f59e0b" })
        .setLngLat(initialCenter)
        .addTo(map);
    } else {
      previewMarkerRef.current.setLngLat(initialCenter);
    }

    return () => {
      // Keep marker visible across unmounts of preview; cleanup handled in component unmount
    };
  }, [map, mode, initialCenter]);

  // Mobile gesture defaults
  useEffect(() => {
    if (!map) return;
    if (mode === "preview" && disableInteractions) {
      // In preview mode with disabled interactions, don't enable any gestures
      return;
    }
    map.scrollZoom.disable();          // prevent accidental page scroll fights
    map.touchZoomRotate.enable();      // pinch/rotate on mobile
    map.doubleClickZoom.disable();     // avoid jumpy zooms
  }, [map, mode, disableInteractions]);

  // Design mode - interactive array placement
  useEffect(() => {
    if (!map || mode !== "design") return;

    // Helper: create polygon feature for array footprint
    const arrayPolygon = (center: [number, number], rows: number, cols: number, panelWm: number, panelHm: number) => {
      const halfW = (cols * panelWm) / 2;
      const halfH = (rows * panelHm) / 2;
      const p = turf.point(center);
      const nw = turf.destination(p, Math.hypot(halfW, halfH) / 1000, 315, "kilometers").geometry.coordinates as [number, number];
      const ne = turf.destination(p, Math.hypot(halfW, halfH) / 1000, 45,  "kilometers").geometry.coordinates as [number, number];
      const se = turf.destination(p, Math.hypot(halfW, halfH) / 1000, 135, "kilometers").geometry.coordinates as [number, number];
      const sw = turf.destination(p, Math.hypot(halfW, halfH) / 1000, 225, "kilometers").geometry.coordinates as [number, number];
      return turf.polygon([[nw, ne, se, sw, nw]]);
    };

    // Initialize array center
    const startCenter: [number, number] = arrayPosition?.length === 2 ? arrayPosition : map.getCenter().toArray() as [number, number];
    arrayCenterRef.current = startCenter;

    // Draggable marker at center
    arrayMarkerRef.current = new mapboxgl.Marker({ color: "#0ea5e9", draggable: true }) // cyan handle
      .setLngLat(startCenter)
      .addTo(map);

    const onDragEnd = () => {
      if (!arrayMarkerRef.current) return;
      const lngLat = arrayMarkerRef.current.getLngLat();
      arrayCenterRef.current = [lngLat.lng, lngLat.lat];
      onArrayMove?.({ lng: lngLat.lng, lat: lngLat.lat });
      renderDesignLayers(); // update footprint + distance
    };
    arrayMarkerRef.current.on("dragend", onDragEnd);

    // Also: move array to any click (easier on mobile)
    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (!arrayMarkerRef.current) return;
      const { lng, lat } = e.lngLat;
      arrayMarkerRef.current.setLngLat([lng, lat]);
      arrayCenterRef.current = [lng, lat];
      onArrayMove?.({ lng, lat });
      renderDesignLayers();
    };
    map.on("click", onClick);

    // Add sources/layers if missing
    if (!map.getSource("array-footprint")) {
      map.addSource("array-footprint", { type: "geojson", data: turf.featureCollection([]) });
      map.addLayer({ id: "array-fill", type: "fill", source: "array-footprint", paint: { "fill-color": "#0ea5e9", "fill-opacity": 0.25 } });
      map.addLayer({ id: "array-outline", type: "line", source: "array-footprint", paint: { "line-color": "#0284c7", "line-width": 2 } });
    }

    if (!map.getSource("trench-line")) {
      map.addSource("trench-line", { type: "geojson", data: turf.featureCollection([]) });
      map.addLayer({ id: "trench", type: "line", source: "trench-line", paint: { "line-color": "#f59e0b", "line-width": 3 } }); // amber
    }

    const renderDesignLayers = () => {
      if (!arrayCenterRef.current) return;
      const c = arrayCenterRef.current;
      const rows = designGrid.rows;
      const cols = designGrid.cols;
      const size = designPanelSize;

      const poly = arrayPolygon(c, rows, cols, size.w, size.h);
      (map.getSource("array-footprint") as mapboxgl.GeoJSONSource).setData(poly);

      if (meterPosition?.length === 2) {
        const line = turf.lineString([meterPosition, c]);
        (map.getSource("trench-line") as mapboxgl.GeoJSONSource).setData(line);
      }
    };

    renderDesignLayers();

    return () => {
      try { map.off("click", onClick); } catch {}
      try { arrayMarkerRef.current?.remove(); } catch {}
    };
  }, [map, mode, designGrid.rows, designGrid.cols, designPanelSize.w, designPanelSize.h, meterPosition, arrayPosition, onArrayMove]);

  // Attach & detach map listeners with cleanup
  useEffect(() => {
    if (!map) return;
    map.on("move", onMove);
    map.on("drag", onDrag);
    return () => {
      try {
        map.off("move", onMove);
        map.off("drag", onDrag);
      } catch {}
    };
  }, [map, onMove, onDrag]);

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
      // setShowDragNotice(true);
      
      // Line will be updated automatically by the effect when positions change
    } else {
      // setShowDragNotice(false);
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      lineFeatureIdRef.current && drawRef.current?.delete(lineFeatureIdRef.current);
      lineFeatureIdRef.current = null;
    }
  }, [actualPanels, map, mapLoaded, electricalMeterPosition, panelPosition, createPanelMarker, mode]);


  // Define callbacks outside useEffect to avoid Rules of Hooks violations
  const onDragPanel = useCallback(() => {
    if (!solarMarkerRef.current) return;
    const ll = solarMarkerRef.current.getLngLat();
    setPanelPosition([ll.lng, ll.lat]); // triggers effect automatically
  }, [setPanelPosition]);

  const onDragEndPanel = useCallback(() => {
    if (!solarMarkerRef.current) return;
    const ll = solarMarkerRef.current.getLngLat();
    setPanelPosition([ll.lng, ll.lat]); // triggers effect automatically
  }, [setPanelPosition]);

  // React to meter/panel changes - recompute distance + line
  useEffect(() => {
    if (!map || !mapLoaded || !drawRef.current) return;
    if (!electricalMeterPosition || !panelPosition) return;

    // Update / recreate dashed line
    upsertMeterPanelLine(
      map,
      drawRef.current,
      lineFeatureIdRef,
      electricalMeterPosition,
      panelPosition
    );

    // Compute distance (meters) and convert to feet
    const from = new mapboxgl.LngLat(electricalMeterPosition[0], electricalMeterPosition[1]);
    const to = new mapboxgl.LngLat(panelPosition[0], panelPosition[1]);
    const meters = from.distanceTo(to);
    const feet = meters * 3.28084;

    setElectricalMeter({
      coordinates: { latitude: electricalMeterPosition[1], longitude: electricalMeterPosition[0] },
      distanceInFeet: Math.round(feet),
    });

    setAdditionalCost(Math.round(feet) * 45);
  }, [
    map,
    mapLoaded,
    electricalMeterPosition?.[0],
    electricalMeterPosition?.[1],
    panelPosition?.[0],
    panelPosition?.[1]
  ]);

  // Add handler for solar panel marker movement - using rAF-safe updates
  useEffect(() => {
    if (!map || !mapLoaded || !shouldDrawPanels || !drawRef.current) return;

    if (solarMarkerRef.current) {
      solarMarkerRef.current.on('drag', onDragPanel);
      solarMarkerRef.current.on('dragend', onDragEndPanel);
    }

    return () => {
      if (solarMarkerRef.current) {
        try {
          solarMarkerRef.current?.off('drag', onDragPanel);
          solarMarkerRef.current?.off('dragend', onDragEndPanel);
        } catch (error) {
          console.error('Error cleaning up solar panel:', error);
        }
      }
    };
  }, [map, mapLoaded, shouldDrawPanels, electricalMeterPosition, panelPosition, actualPanels, onDragPanel, onDragEndPanel]);

  // Clean up when panels reset to 0
  useEffect(() => {
    if (totalPanels === 0) {
      // Remove marker
      if (solarMarkerRef.current) {
        solarMarkerRef.current.off('drag', () => {});
        solarMarkerRef.current.off('dragend', () => {});
        solarMarkerRef.current.remove();
        solarMarkerRef.current = null;
      }

      // Remove line
      if (lineFeatureIdRef.current && drawRef.current) {
        drawRef.current.delete(lineFeatureIdRef.current);
        lineFeatureIdRef.current = null;
      }

      setAdditionalCost(0);
      setElectricalMeter({ coordinates: { latitude: 0, longitude: 0 }, distanceInFeet: 0 });
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


  const systemSizeFeet = useMemo(() => {
    const panelWidthFeet = 6; // each panel 6 feet width
    const panelHeightFeet = 2.5; // height for 1 panel (estimate)
    const systemRows = 4; // fixed
    const systemCols = Math.ceil(totalPanels / systemRows);
  
    const widthFeet = systemCols * panelWidthFeet;
    const heightFeet = systemRows * panelHeightFeet;
  
    return { widthFeet, heightFeet };
  }, [totalPanels]);
  

  return (
    <>
      {!electricalMeterPosition && (currentStepIndex !== 0) && (
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
  <div className="absolute bottom-[30px] left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center gap-2">
    <div className="bg-white/70 backdrop-blur-md px-4 py-2 rounded-full shadow-lg text-sm font-medium text-gray-700">
      System Size: {systemSizeFeet.widthFeet} ft x {systemSizeFeet.heightFeet} ft
    </div>

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

      {/* Zoom HUD: bottom-right, stays above safe-area and clear of sticky CTA */}
      <div
        className="
          absolute z-30 right-3
          bottom-[calc(env(safe-area-inset-bottom)+84px)] md:bottom-3
          flex items-center gap-2 rounded-full bg-neutral-900/85 px-2 py-1
          text-[12px] text-white shadow-lg pointer-events-auto
        "
        role="group"
        aria-label="Zoom controls"
      >
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30"
          onClick={() => {
            if (!map) return;
            const min = map.getMinZoom();
            const max = map.getMaxZoom();
            // step by 10% for clarity
            const p = percentFromZoom(map.getZoom(), min, max);
            const next = Math.max(0, p - 10);
            map.easeTo({ zoom: zoomFromPercent(next, min, max), duration: 250 });
            try { setMapZoomPercentage?.(next); } catch {}
          }}
          aria-label="Zoom out"
        >
          –
        </button>

        <span className="px-2 font-semibold tabular-nums">
          Zoom: {mapZoomPercentage ?? 0}%
        </span>

        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30"
          onClick={() => {
            if (!map) return;
            const min = map.getMinZoom();
            const max = map.getMaxZoom();
            const p = percentFromZoom(map.getZoom(), min, max);
            const next = Math.min(100, p + 10);
            map.easeTo({ zoom: zoomFromPercent(next, min, max), duration: 250 });
            try { setMapZoomPercentage?.(next); } catch {}
          }}
          aria-label="Zoom in"
        >
          +
        </button>
      </div>

      {allowMeterPlacement && mode !== "place-meter" && <ElectricalMeter map={map} mapLoaded={mapLoaded} mode={mode} />}
    </>
  );
};

export default MapboxSolarPanelInner;