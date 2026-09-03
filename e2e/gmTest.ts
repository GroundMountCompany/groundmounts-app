/**
 * The dev-only test hook exposed by MapCanvas.
 *
 * Declared once, here, because two specs both need it and duplicate `declare
 * global` blocks conflict.
 */
export type Pt = [number, number];

export interface GmTestState {
  arrayCenter: Pt | null;
  azimuth: number;
  trenchFeet: number;
  totalPanels: number;
  mapReady: boolean;
  currentStepIndex: number;
  mapScreenshot: string | null;
  coordinates: { latitude: number; longitude: number };
  electricalMeterPosition: Pt | null;
  setCurrentStepIndex: (v: number) => void;
  setTotalPanels: (v: number) => void;
  setArrayCenter: (v: Pt | null) => void;
  setElectricalMeterPosition: (v: Pt | null) => void;
}

export interface GmTest {
  state: () => GmTestState;
  mapCenter: () => Pt;
  mapZoom: () => number;
  project: (ll: Pt) => Pt;
  unproject: (pt: Pt) => Pt;
  renderedHulls: () => number;
  renderedHandles: () => number;
  canvasRect: () => { left: number; top: number; width: number; height: number };
  hitAt: (pt: Pt) => { handle: number; hull: number; pin: number; meter: number };
  hitTargetSizes: () => Record<string, number>;
  renderedGeom: () => { handlePx: Pt; hullPx: Pt[] } | null;
  handleLngLat: () => Pt | null;
  bearingFromCenter: (ll: Pt) => number | null;
  styleLoaded: () => boolean;
  isMoving: () => boolean;
  lastPointer: () => Pt | null;
  setZoom: (z: number) => void;
  viewArrayAt: (z: number) => void;
  capture: () => Promise<{ dataUrl: string | null; reason?: string }>;
}

declare global {
  interface Window {
    /** Present in dev builds only; `next build` strips it. */
    __gmTest: GmTest;
  }
}
