import type { PanelLayout } from '@/types';

// Standard solar panel dimensions in meters
export const PANEL_WIDTH = 1.7; // meters
export const PANEL_HEIGHT = 1.0; // meters
export const PANEL_SPACING = 0.1; // meters between panels
export const ROW_SPACING = 0.5; // meters between rows

export function calculatePanelLayout(areaInSquareMeters: number): PanelLayout {
  // Calculate effective panel dimensions including spacing
  const effectivePanelWidth = PANEL_WIDTH + PANEL_SPACING;
  const effectiveRowHeight = PANEL_HEIGHT + ROW_SPACING;

  // Estimate the area dimensions (assuming roughly square shape)
  const areaWidth = Math.sqrt(areaInSquareMeters);
  const areaHeight = areaWidth;

  // Calculate how many panels can fit in each direction
  const maxPanelsWide = Math.floor(areaWidth / effectivePanelWidth);
  const maxPanelsHigh = Math.floor(areaHeight / effectiveRowHeight);

  // Calculate total panels
  const totalPanels = maxPanelsWide * maxPanelsHigh;

  // Calculate total power (assuming 400W per panel)
  const totalPowerKW = (totalPanels * 400) / 1000;

  return {
    totalPanels,
    rows: maxPanelsHigh,
    panelsPerRow: maxPanelsWide,
    totalArea: areaInSquareMeters,
    totalPowerKW,
  };
}

export function calculateAnnualProduction(powerKW: number): number {
  // Assuming average 4 peak sun hours per day
  const dailyKWh = powerKW * 4;
  // Assuming 80% efficiency due to weather, dust, etc.
  const annualKWh = dailyKWh * 365 * 0.8;
  return Math.round(annualKWh);
}

export function calculateCostSavings(
  annualKWh: number,
  electricityRate: number // dollars per kWh
): number {
  return annualKWh * electricityRate;
} 
