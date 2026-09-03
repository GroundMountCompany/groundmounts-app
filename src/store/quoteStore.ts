'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as turf from '@turf/turf';
import type { Feature, LineString } from 'geojson';
import type MapboxDraw from '@mapbox/mapbox-gl-draw';
import { v4 as uuid } from 'uuid';
import { TRENCHING_COST_PER_FT } from '@/lib/solar';
import { drawRef, lineFeatureIdRef } from './mapRefs';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface ElectricalMeter {
  coordinates: Coordinates;
  distanceInFeet: number;
}

export type PaymentMethod = 'unselected' | 'cash' | 'finance';
export type LngLat = [number, number];

/** Dallas, TX — where the map opens before we know anything about the user. */
export const DEFAULT_COORDINATES: Coordinates = {
  latitude: 32.9007121,
  longitude: -96.9478987,
};

export const STORAGE_KEY = 'gmq:v3';

interface QuoteState {
  hydrated: boolean;
  currentStepIndex: number;
  address: string;
  coordinates: Coordinates;
  mapZoomPercentage: number;
  isAutoLocationError: boolean;
  quotation: number;
  totalPanels: number;
  avgValue: number;
  highestValue: number;
  percentage: number;
  paymentMethod: PaymentMethod;
  quoteId: string;
  leadId: string;
  startedAt: number;
  electricalMeter: ElectricalMeter | null;
  additionalCost: number;
  panelPosition: LngLat | null;
  electricalMeterPosition: LngLat | null;
  mapScreenshot: string | null;
}

interface QuoteActions {
  setCurrentStepIndex: (v: number) => void;
  setAddress: (v: string) => void;
  setCoordinates: (v: Coordinates) => void;
  setMapZoomPercentage: (v: number) => void;
  setIsAutoLocationError: (v: boolean) => void;
  setQuotation: (v: number) => void;
  setTotalPanels: (v: number) => void;
  setAvgValue: (v: number) => void;
  setHighestValue: (v: number) => void;
  setPercentage: (v: number) => void;
  setPaymentMethod: (v: PaymentMethod) => void;
  setQuoteId: (v: string) => void;
  setElectricalMeter: (v: ElectricalMeter | null) => void;
  setAdditionalCost: (v: number) => void;
  setPanelPosition: (v: LngLat | null) => void;
  setElectricalMeterPosition: (v: LngLat | null) => void;
  setMapScreenshot: (v: string | null) => void;
  updateDistanceAndCost: (meter: LngLat, panel: LngLat) => void;
  createOrUpdateLine: (meter: LngLat, panel: LngLat, draw: MapboxDraw) => void;
  ensureMeterFromStorage: () => void;
  resetQuote: () => void;
}

export type QuoteStore = QuoteState & QuoteActions;

const initialState: QuoteState = {
  hydrated: false,
  currentStepIndex: 0,
  address: '',
  coordinates: DEFAULT_COORDINATES,
  mapZoomPercentage: 0,
  isAutoLocationError: false,
  quotation: 0,
  totalPanels: 0,
  avgValue: 0,
  highestValue: 0,
  percentage: 50,
  paymentMethod: 'unselected',
  quoteId: '',
  leadId: '',
  startedAt: Date.now(),
  electricalMeter: null,
  additionalCost: 0,
  panelPosition: null,
  electricalMeterPosition: null,
  mapScreenshot: null,
};

/** Straight-line meter→array distance in whole feet. */
export function distanceInFeet(a: LngLat, b: LngLat): number {
  try {
    return Math.round(turf.distance(turf.point(a), turf.point(b)) * 3280.84);
  } catch (error) {
    console.error('[QUOTE] distance failed', error);
    return 0;
  }
}

function safeDrawDelete(draw: MapboxDraw | null, featureId: string | null): boolean {
  if (!draw || !featureId) return false;
  try {
    if (typeof draw.delete !== 'function' || typeof draw.getAll !== 'function') return false;
    draw.getAll();
    draw.delete(featureId);
    return true;
  } catch (error) {
    console.warn('[DRAW] safe delete failed', error);
    return false;
  }
}

export const useQuoteStore = create<QuoteStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setCurrentStepIndex: (currentStepIndex) => set({ currentStepIndex }),
      setAddress: (address) => set({ address }),
      setCoordinates: (coordinates) => set({ coordinates }),
      setMapZoomPercentage: (mapZoomPercentage) => set({ mapZoomPercentage }),
      setIsAutoLocationError: (isAutoLocationError) => set({ isAutoLocationError }),
      setQuotation: (quotation) => set({ quotation }),
      setTotalPanels: (totalPanels) => set({ totalPanels }),
      setAvgValue: (avgValue) => set({ avgValue }),
      setHighestValue: (highestValue) => set({ highestValue }),
      setPercentage: (percentage) => set({ percentage }),
      setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
      setQuoteId: (quoteId) => set({ quoteId }),
      setElectricalMeter: (electricalMeter) => set({ electricalMeter }),
      setAdditionalCost: (additionalCost) => set({ additionalCost }),
      setMapScreenshot: (mapScreenshot) => set({ mapScreenshot }),

      setPanelPosition: (panelPosition) => {
        set({ panelPosition });
        const { electricalMeterPosition } = get();
        if (panelPosition && electricalMeterPosition) {
          get().updateDistanceAndCost(electricalMeterPosition, panelPosition);
          if (drawRef.current) {
            get().createOrUpdateLine(electricalMeterPosition, panelPosition, drawRef.current);
          }
        }
      },

      setElectricalMeterPosition: (electricalMeterPosition) => {
        set({ electricalMeterPosition });
        const { panelPosition } = get();
        if (panelPosition && electricalMeterPosition) {
          get().updateDistanceAndCost(electricalMeterPosition, panelPosition);
          if (drawRef.current) {
            get().createOrUpdateLine(electricalMeterPosition, panelPosition, drawRef.current);
          }
        }
      },

      /**
       * Single source of truth for trench length and its cost. The old provider
       * wrote additionalCost from three different places with three copies of the
       * $45/ft literal; this is the only writer now.
       */
      updateDistanceAndCost: (meter, panel) => {
        if (!meter || !panel) return;
        const feet = distanceInFeet(meter, panel);
        set({
          electricalMeter: {
            coordinates: { latitude: meter[1], longitude: meter[0] },
            distanceInFeet: feet,
          },
          additionalCost: Math.max(0, feet * TRENCHING_COST_PER_FT),
        });
      },

      createOrUpdateLine: (meter, panel, draw) => {
        try {
          const lineFeature: Feature<LineString> = {
            type: 'Feature',
            id: 'meter-to-panel-line',
            geometry: { type: 'LineString', coordinates: [meter, panel] },
            properties: {},
          };
          if (lineFeatureIdRef.current) {
            safeDrawDelete(draw, lineFeatureIdRef.current);
          }
          const ids = draw.add(lineFeature);
          lineFeatureIdRef.current = ids[0];
        } catch (error) {
          console.error('[QUOTE] line update failed', error);
        }
      },

      /**
       * No-op kept for call-site compatibility. The meter position is part of the
       * persisted slice now, so it is already restored by the time anything runs.
       */
      ensureMeterFromStorage: () => {},

      resetQuote: () => {
        lineFeatureIdRef.current = null;
        set({ ...initialState, hydrated: true, leadId: uuid(), startedAt: Date.now() });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Rehydrated manually on mount so server and first client render agree.
      skipHydration: true,
      partialize: (state) => ({
        currentStepIndex: state.currentStepIndex,
        address: state.address,
        coordinates: state.coordinates,
        avgValue: state.avgValue,
        highestValue: state.highestValue,
        percentage: state.percentage,
        totalPanels: state.totalPanels,
        quotation: state.quotation,
        paymentMethod: state.paymentMethod,
        quoteId: state.quoteId,
        leadId: state.leadId,
        electricalMeter: state.electricalMeter,
        additionalCost: state.additionalCost,
        panelPosition: state.panelPosition,
        electricalMeterPosition: state.electricalMeterPosition,
        // mapScreenshot is a multi-MB data URL — never persisted.
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.warn('[QUOTE] rehydrate failed', error);
        // A leadId must exist exactly once per funnel run and survive refresh.
        if (state && !state.leadId) state.leadId = uuid();
        useQuoteStore.setState({ hydrated: true });
      },
    }
  )
);

/** Clear persisted funnel state. Called once the lead is safely submitted. */
export function clearPersistedQuote(): void {
  try {
    useQuoteStore.persist.clearStorage();
  } catch (error) {
    console.warn('[QUOTE] clear storage failed', error);
  }
}
