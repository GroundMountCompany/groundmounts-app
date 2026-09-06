'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as turf from '@turf/turf';
import { v4 as uuid } from 'uuid';
import { TRENCH } from '@/config/pricing';
import type { PanelTier } from '@/config/pricing';
import type { SlopeTier } from '@/lib/slope';
import { TX_FALLBACK_CURVE, type ProductionCurve } from '@/lib/production';
import { resetSiteIntel } from '@/lib/siteIntel';
import type { BillMonth } from '@/lib/billSchema';

/** none -> reading -> review -> confirmed, with failure returning to none. */
export type BillPhase = 'none' | 'reading' | 'review' | 'confirmed';

/**
 * Whether the panel count still belongs to the sizing maths.
 *
 * 'auto' means the count is whatever covers the customer's target at the angle
 * the array is pointing, and turning the array re-computes it. The moment they
 * press + or -, the count is theirs: rotation stops touching it, because a
 * number somebody chose by hand must not move on its own.
 */
export type SizingMode = 'auto' | 'manual';

/**
 * What the last automatic resize did, for the toast to report.
 *
 * Not persisted: it describes something that just happened on screen, and a
 * reload an hour later should not announce it again.
 */
export interface SizeNotice {
  /** Panels added (positive) or removed (negative). Never zero. */
  delta: number;
  /** The azimuth the array ended on, so the toast can name the direction. */
  azimuth: number;
  /** Distinguishes two resizes that happen to have the same delta. */
  id: number;
}

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

/** Texas average, in cents per kWh. Prefilled so the field is never empty. */
export const DEFAULT_RATE_CENTS = 14;
/** Plausible range for a residential rate. Outside this we nudge, not block. */
export const RATE_CENTS_MIN = 5;
export const RATE_CENTS_MAX = 40;

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

  // --- Phase 2 design engine ---
  /** Array centre. Distinct from panelPosition, which was the old marker anchor. */
  arrayCenter: LngLat | null;
  /** Compass bearing the panels face. 180 = due south. */
  azimuth: number;
  panelTier: PanelTier;
  /** Live trench length in feet, from the array edge to the meter. */
  trenchFeet: number;
  /**
   * Read off the customer's own bill and confirmed by them.
   *
   * When present this is what the array is sized against: a year of measured
   * usage beats a monthly bill divided by an assumed rate.
   */
  billMonths: BillMonth[] | null;
  billAnnualKwh: number | null;
  /**
   * How far the upload got.
   *
   * In the store rather than the component because a customer who refreshes
   * after confirming their bill should see that it is confirmed, not a fresh
   * upload button offering to do the work again.
   */
  billPhase: BillPhase;
  /** What was read but not yet confirmed, so a refresh mid-review keeps it. */
  billDraft: BillMonth[] | null;
  billDraftRate: number | null;
  slopePercent: number | null;
  slopeTier: SlopeTier;
  /**
   * Where the slope answer came from. `null` means nothing has looked yet;
   * 'unavailable' means both lookups failed and the customer has to be asked;
   * 'chosen' means they answered.
   */
  slopeSource: 'terrain' | 'tilequery' | 'unavailable' | 'chosen' | null;
  /**
   * The customer's rate in whole cents per kWh.
   *
   * Cents, not dollars: a dollars field means typing "0." mid-entry, which
   * parsed to NaN and poisoned every number downstream.
   */
  rateCentsPerKwh: number;
  /** Manual panel adjustment on the design step, added to the sized count. */
  panelAdjust: number;
  sizingMode: SizingMode;
  sizeNotice: SizeNotice | null;
  /**
   * The count sizing produced, before any manual adjustment. Kept so the ±
   * control and a tier change can both work from the same baseline.
   */
  sizedPanels: number;
  /** The azimuth sizing was done at. Rotation must not re-size the array. */
  sizedAzimuth: number;
  /**
   * True once the map instance exists and its style has loaded. mapbox-gl is
   * imported lazily now, so anything that needs the map has to wait for this
   * rather than checking mapRef once and giving up.
   */
  mapReady: boolean;
  /**
   * The leadId whose Airtable write succeeded, and whose customer email was
   * sent. Persisted so a retry after a partial failure does not file the lead
   * twice or re-send an email that already went.
   */
  leadFiled: string | null;
  emailSent: string | null;
  /**
   * Contact details, kept so a reload does not lose them and so the email
   * cannot be sent to a different address than the one already filed.
   */
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  /** Shown when a navigation into the design was refused after filing. */
  designLockNotice: boolean;

  // --- Options and site intel (Phase 3) ---
  batteryUnits: number;
  needsClearing: boolean;
  /** kWh per kW per year at the reference azimuths, from /api/site. */
  productionCurve: ProductionCurve;
  curveSource: 'pvwatts' | 'fallback';
  soilClass: string | null;
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
  /** Months the customer confirmed off their own bill, and the year they imply. */
  setBillMonths: (months: BillMonth[], annualKwh: number) => void;
  clearBillMonths: () => void;
  /** Where the upload has got to. Persisted so a refresh does not lose it. */
  setBillPhase: (phase: BillPhase) => void;
  /** What we read, before the customer has confirmed it. */
  setBillDraft: (months: BillMonth[], ratePerKwh: number | null) => void;
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
  ensureMeterFromStorage: () => void;
  resetQuote: () => void;

  setArrayCenter: (v: LngLat | null) => void;
  setAzimuth: (v: number) => void;
  setPanelTier: (v: PanelTier) => void;
  setTrenchFeet: (v: number) => void;
  setSlope: (
    percent: number | null,
    tier: SlopeTier,
    source?: 'terrain' | 'tilequery' | 'unavailable'
  ) => void;
  /** The customer's own answer when the terrain lookup could not give one. */
  chooseSlopeTier: (tier: SlopeTier) => void;
  setRateCentsPerKwh: (v: number) => void;
  setPanelAdjust: (v: number) => void;
  setSizingMode: (mode: SizingMode) => void;
  setSizeNotice: (notice: SizeNotice | null) => void;
  returnToAuto: () => void;
  setSized: (panels: number, azimuth: number) => void;
  setMapReady: (v: boolean) => void;
  setLeadFiled: (leadId: string | null) => void;
  setEmailSent: (leadId: string | null) => void;
  setContact: (field: 'contactName' | 'contactEmail' | 'contactPhone', value: string) => void;
  setDesignLockNotice: (v: boolean) => void;
  setBatteryUnits: (v: number) => void;
  setNeedsClearing: (v: boolean) => void;
  setSiteIntel: (intel: {
    curve: ProductionCurve;
    curveSource: 'pvwatts' | 'fallback';
    soilClass: string | null;
  }) => void;
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
  // Covering all of your use is the common choice, so it is where the slider
  // starts. Anything else is a deliberate decision the customer makes.
  percentage: 100,
  paymentMethod: 'unselected',
  quoteId: '',
  leadId: '',
  startedAt: Date.now(),
  electricalMeter: null,
  additionalCost: 0,
  panelPosition: null,
  electricalMeterPosition: null,
  mapScreenshot: null,
  arrayCenter: null,
  azimuth: 180,
  panelTier: 'standard',
  trenchFeet: 0,
  billMonths: null,
  billAnnualKwh: null,
  billPhase: 'none',
  billDraft: null,
  billDraftRate: null,
  slopePercent: null,
  slopeTier: 'Unknown',
  slopeSource: null,
  rateCentsPerKwh: DEFAULT_RATE_CENTS,
  panelAdjust: 0,
  sizingMode: 'auto',
  sizeNotice: null,
  sizedPanels: 0,
  sizedAzimuth: 180,
  mapReady: false,
  leadFiled: null,
  emailSent: null,
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  designLockNotice: false,
  batteryUnits: 0,
  needsClearing: false,
  productionCurve: TX_FALLBACK_CURVE,
  curveSource: 'fallback',
  soilClass: null,
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

      setBillMonths: (billMonths, billAnnualKwh) =>
        set({ billMonths, billAnnualKwh, billPhase: 'confirmed' }),

      clearBillMonths: () =>
        set({
          billMonths: null,
          billAnnualKwh: null,
          billDraft: null,
          billDraftRate: null,
          billPhase: 'none',
        }),

      setBillPhase: (billPhase) => set({ billPhase }),
      setBillDraft: (billDraft, billDraftRate) =>
        set({ billDraft, billDraftRate, billPhase: 'review' }),
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
        }
      },

      setElectricalMeterPosition: (electricalMeterPosition) => {
        set({ electricalMeterPosition });
        const { panelPosition } = get();
        if (panelPosition && electricalMeterPosition) {
          get().updateDistanceAndCost(electricalMeterPosition, panelPosition);
        }
      },

      /**
       * Single source of truth for trench length and its cost. The old provider
       * wrote additionalCost from three different places, each with its own copy
       * of the per-foot rate; this is the only writer now, and the rate itself
       * comes from pricing.ts.
       */
      updateDistanceAndCost: (meter, panel) => {
        if (!meter || !panel) return;
        const feet = distanceInFeet(meter, panel);
        set({
          electricalMeter: {
            coordinates: { latitude: meter[1], longitude: meter[0] },
            distanceInFeet: feet,
          },
          additionalCost: Math.max(0, feet * TRENCH.basePerFt),
        });
      },

      /**
       * No-op kept for call-site compatibility. The meter position is part of the
       * persisted slice now, so it is already restored by the time anything runs.
       */
      ensureMeterFromStorage: () => {},

      setArrayCenter: (arrayCenter) => set({ arrayCenter }),
      setAzimuth: (azimuth) => set({ azimuth: ((azimuth % 360) + 360) % 360 }),
      setPanelTier: (panelTier) => set({ panelTier }),
      /** Trench length and its cost move together; nothing else writes them. */
      setTrenchFeet: (trenchFeet) =>
        set({
          trenchFeet,
          additionalCost: Math.max(0, Math.round(trenchFeet) * TRENCH.basePerFt),
        }),
      setSlope: (slopePercent, slopeTier, source) => {
        // A lookup that found nothing must not overwrite an answer the customer
        // gave us. Every arrival at the design step re-reads the ground, so a
        // reload after picking Steep was replacing that pick with Unknown — and
        // Unknown carries no site adder, which is the exact under-quote the
        // picker exists to prevent. A real measurement still wins: it is the
        // absence of one that has to defer.
        if (source === 'unavailable' && get().slopeSource === 'chosen') return;
        set({ slopePercent, slopeTier, slopeSource: source ?? null });
      },

      chooseSlopeTier: (slopeTier) =>
        set({ slopeTier, slopePercent: null, slopeSource: 'chosen' }),
      setRateCentsPerKwh: (rateCentsPerKwh) => set({ rateCentsPerKwh }),
      /*
        Touching +/- hands the count to the customer.

        From here on rotation leaves it alone — see applyAutoSize. The way back
        is the Auto-size chip, which is deliberately explicit: silently taking
        the number back would be worse than never having given it away.
      */
      setPanelAdjust: (panelAdjust) => set({ panelAdjust, sizingMode: 'manual' }),
      setSizingMode: (sizingMode) => set({ sizingMode }),
      setSizeNotice: (sizeNotice) => set({ sizeNotice }),
      /** Back to the sizing maths, with the hand adjustment dropped. */
      returnToAuto: () => set({ panelAdjust: 0, sizingMode: 'auto' }),
      setSized: (sizedPanels, sizedAzimuth) => set({ sizedPanels, sizedAzimuth }),
      setMapReady: (mapReady) => set({ mapReady }),
      setLeadFiled: (leadFiled) => set({ leadFiled }),
      setEmailSent: (emailSent) => set({ emailSent }),
      setContact: (field, value) => set({ [field]: value } as Partial<QuoteState>),
      setDesignLockNotice: (designLockNotice) => set({ designLockNotice }),
      setBatteryUnits: (batteryUnits) => set({ batteryUnits }),
      setNeedsClearing: (needsClearing) => set({ needsClearing }),
      setSiteIntel: ({ curve, curveSource, soilClass }) =>
        set({ productionCurve: curve, curveSource, soilClass }),

      resetQuote: () => {
        // A fresh funnel is a fresh place: let the site lookup ask again rather
        // than reusing the last visitor's cell.
        resetSiteIntel();
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
        // Persisted so a reload does not restart the funnel timer. Without it
        // ttc_ms measures time since the refresh, and a returning user who
        // submits promptly trips the min-time guard on /api/sendEmail.
        startedAt: state.startedAt,
        electricalMeter: state.electricalMeter,
        additionalCost: state.additionalCost,
        panelPosition: state.panelPosition,
        electricalMeterPosition: state.electricalMeterPosition,
        arrayCenter: state.arrayCenter,
        azimuth: state.azimuth,
        panelTier: state.panelTier,
        trenchFeet: state.trenchFeet,
        billMonths: state.billMonths,
        billAnnualKwh: state.billAnnualKwh,
        billPhase: state.billPhase,
        billDraft: state.billDraft,
        billDraftRate: state.billDraftRate,
        slopePercent: state.slopePercent,
        slopeTier: state.slopeTier,
        slopeSource: state.slopeSource,
        rateCentsPerKwh: state.rateCentsPerKwh,
        panelAdjust: state.panelAdjust,
        sizingMode: state.sizingMode,
        sizedPanels: state.sizedPanels,
        sizedAzimuth: state.sizedAzimuth,
        leadFiled: state.leadFiled,
        emailSent: state.emailSent,
        contactName: state.contactName,
        contactEmail: state.contactEmail,
        contactPhone: state.contactPhone,
        batteryUnits: state.batteryUnits,
        needsClearing: state.needsClearing,
        productionCurve: state.productionCurve,
        curveSource: state.curveSource,
        soilClass: state.soilClass,
        // Downscaled JPEG, so it is small enough to persist. Without this a
        // refresh on the contact form dropped the screenshot silently.
        mapScreenshot: state.mapScreenshot,
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
