import type { PanelPosition } from '@/types';
import * as turf from '@turf/turf';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { Feature, Polygon } from 'geojson';

export const calculatePanelPositions = (
  polygonFeature: Feature<Polygon>
): PanelPosition[] => {
  const positions: PanelPosition[] = [];
  console.log('Calculating panel positions for polygon:', polygonFeature);

  // Calculate the rotation angle to align panels with the longest edge
  const coords = polygonFeature.geometry.coordinates[0];
  let maxDistance = 0;
  let bearing = 0;

  // Find the longest edge to determine orientation
  for (let i = 0; i < coords.length - 1; i++) {
    const distance = turf.distance(
      turf.point(coords[i]),
      turf.point(coords[i + 1])
    );
    if (distance > maxDistance) {
      maxDistance = distance;
      bearing = turf.bearing(
        turf.point(coords[i]),
        turf.point(coords[i + 1])
      );
    }
  }
  console.log('Calculated bearing:', bearing);

  // Get the polygon's bounding box
  const bbox = turf.bbox(polygonFeature);
   
  // Convert panel size from pixels to approximate degrees
  // At the equator, 1 degree is approximately 111,111 meters
  // We'll use this for a rough conversion
  const metersPerDegree = 111111;
  
  // Calculate panel dimensions for 100m² area
  // Using a square shape for simplicity: √100 ≈ 10 meters per side
  const panelSizeInMeters = 10; // 10m x 10m = 100m²
  const spacingInMeters = 1; // 1 meter spacing between panels
  
  const effectivePanelSizeInDegrees = panelSizeInMeters / metersPerDegree;
  const effectiveSpacingInDegrees = spacingInMeters / metersPerDegree;

  // Calculate the area dimensions in degrees
  const width = bbox[2] - bbox[0];
  const height = bbox[3] - bbox[1];
  console.log('Area dimensions in degrees:', { width, height });

  // Calculate how many panels can fit
  const effectiveSize = effectivePanelSizeInDegrees + effectiveSpacingInDegrees;
  const panelsWide = Math.max(1, Math.floor(width / effectiveSize));
  const panelsHigh = Math.max(1, Math.floor(height / effectiveSize));
  console.log('Panel grid:', { panelsWide, panelsHigh });

  // Start from the top-left of the bounding box
  const startX = bbox[0] + (width - panelsWide * effectiveSize) / 2;
  const startY = bbox[3] - (height - panelsHigh * effectiveSize) / 2;

  // Create panel grid from top to bottom, filling each row completely
  let currentRow = 0;
  let currentCol = 0;
  let panelsPlaced = 0;
  
  while (panelsPlaced < panelsWide * panelsHigh) {
    const x = startX + (currentCol * effectiveSize);
    const y = startY - (currentRow * effectiveSize);
    
    // Create a point for the panel center
    const centerCoords: [number, number] = [
      x + effectivePanelSizeInDegrees / 2,
      y - effectivePanelSizeInDegrees / 2
    ];
    const point = turf.point(centerCoords);
    
    // Check if the panel center is inside the drawn area
    if (booleanPointInPolygon(point, polygonFeature)) {
      positions.push({
        coords: centerCoords,
        bearing: bearing
      });
    }

    // Move to next position
    currentCol++;
    if (currentCol >= panelsWide) {
      currentCol = 0;
      currentRow++;
      if (currentRow >= panelsHigh) break;
    }
    panelsPlaced++;
  }

  console.log('Generated panel positions:', positions.length);
  return positions;
};

export const calculatePanelSize = (zoom: number): number => {
  // Base size is 40px at zoom level 18
  const baseSize = 80; // Increased base size to better represent 100m²
  const baseZoom = 18;
  // Calculate new size based on zoom difference
  const zoomDiff = zoom - baseZoom;
  const scale = Math.pow(2, zoomDiff);
  // Limit size between 40px and 200px for better visibility
  return Math.max(40, Math.min(200, baseSize * scale));
}; 
