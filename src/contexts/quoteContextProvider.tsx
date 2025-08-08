import React, { useEffect, JSX, useState, useCallback, useRef, useMemo } from 'react';
import { QuoteContext } from './quoteContext';
import { Feature, LineString } from 'geojson';
import * as turf from '@turf/turf';
import { v4 as uuid } from 'uuid';

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface ElectricalMeter {
  coordinates: Coordinates;
  distanceInFeet: number;
}

type PaymentMethod = 'unselected' | 'cash' | 'finance';

type PanelorMeterCoordinates = [number, number];

export interface QuoteContextValues {
  currentStepIndex: number;
  address: string;
  coordinates: Coordinates;
  quotation: number;
  totalPanels: number;
  paymentMethod: PaymentMethod;
  percentage: number;
  avgValue: number;
  highestValue: number;
  quoteId: string;
  leadId: string;
  startedAt: number;
  isAutoLocationError: boolean;
  shouldContinueButtonDisabled: boolean;
  isAddressCoordinatesCompleted: boolean;
  mapZoomPercentage: number;
  shouldDrawPanels: boolean;
  electricalMeter: ElectricalMeter | null;
  additionalCost: number;
  panelPosition: PanelorMeterCoordinates | null;
  electricalMeterPosition: PanelorMeterCoordinates | null;
  lineFeatureIdRef: React.MutableRefObject<string | null>;
  drawRef: React.MutableRefObject<MapboxDraw | null>;
  setIsAutoLocationError: (value: boolean) => void;
  setCurrentStepIndex: (value: number) => void;
  setAddress: (value: string) => void;
  setCoordinates: (value: Coordinates) => void;
  setQuotation: (value: number) => void;
  setPaymentMethod: (value: PaymentMethod) => void;
  setTotalPanels: (value: number) => void;
  setMapZoomPercentage: (value: number) => void;
  setPercentage: (value: number) => void;
  setAvgValue: (value: number) => void;
  setHighestValue: (value: number) => void;
  setQuoteId: (value: string) => void;
  setElectricalMeter: (value: ElectricalMeter | null) => void;
  setAdditionalCost: (value: number) => void;
  setPanelPosition: (value: PanelorMeterCoordinates | null) => void;
  setElectricalMeterPosition: (value: PanelorMeterCoordinates | null) => void;
  createOrUpdateLine: (meterCoords: PanelorMeterCoordinates, panelCoords: PanelorMeterCoordinates, draw: MapboxDraw) => void;
  updateDistanceAndCost: (meterCoords: [number, number], panelCoords: [number, number]) => void;
}

interface QuoteContextProviderProps {
  children: React.ReactNode;
}

export const QuoteContextProvider = ({ children }: QuoteContextProviderProps): JSX.Element => {

  // STEPS STATE
  const [currentStepIndex, setCurrentStepIndex] = React.useState<number>(0);

  // ADDRESS RELATED STATE
  const [address, setAddress] = React.useState<string>('');
  const [mapZoomPercentage, setMapZoomPercentage] = React.useState<number>(0);
  // default coordinates for Dallas, TX
  const [coordinates, setCoordinates] = React.useState<Coordinates>({
    latitude: 32.9007121,
    longitude: -96.9478987
  });
  const [isAutoLocationError, setIsAutoLocationError] = React.useState<boolean>(false);

  // QUOTATION RELATED STATE
  const [quotation, setQuotation] = React.useState<number>(0);
  const [totalPanels, setTotalPanels] = React.useState<number>(0);
  const [avgValue, setAvgValue] = useState<number>(0);
  const [highestValue, setHighestValue] = useState<number>(0);
  const [percentage, setPercentage] = useState<number>(50);

  // PAYMENT METHOD RELATED STATE
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>('unselected');

  // QUOTE ID RELATED STATE
  const [quoteId, setQuoteId] = React.useState<string>('');

  // PERSISTENT LEAD ID FOR EARLY CAPTURE
  const leadIdRef = useRef<string>(uuid());
  const leadId = leadIdRef.current;

  // TIME TRACKING FOR SPAM PREVENTION
  const startedAtRef = useRef<number>(Date.now());
  const startedAt = startedAtRef.current;

  // ELECTRICAL METER RELATED STATE
  const COST_PER_FOOT = 45;
  const [electricalMeter, setElectricalMeter] = React.useState<ElectricalMeter | null>(null);
  const [additionalCost, setAdditionalCost] = React.useState<number>(0);
  const [panelPosition, setPanelPosition] = useState<PanelorMeterCoordinates | null>(null);
  const [electricalMeterPosition, setElectricalMeterPosition] = useState<PanelorMeterCoordinates | null>(null);
  const lineFeatureIdRef = useRef<string | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);

  const isAddressEmpty: boolean = address.length === 0;
  const isCoordinatesZero: boolean = coordinates.latitude === 0 && coordinates.longitude === 0;
  const shouldContinueButtonDisabled: boolean = isAddressEmpty || isCoordinatesZero;
  const isAddressCoordinatesCompleted: boolean = !isAddressEmpty && !isCoordinatesZero;
  const shouldDrawPanels = useMemo(() => totalPanels > 0, [totalPanels]);

  useEffect(() => {
    if (currentStepIndex === 0) {
      setTotalPanels(0);
      setQuotation(0);
      setPaymentMethod('unselected');
      setElectricalMeter(null);
      setAdditionalCost(0);
      setPanelPosition(null);
      setElectricalMeterPosition(null);
      lineFeatureIdRef.current = null;
    }
    if (currentStepIndex === 1) {
      setPaymentMethod('unselected');
    }
  }, [currentStepIndex])

  const createOrUpdateLine = useCallback((meterCoords: [number, number], panelCoords: [number, number], draw: MapboxDraw) => {
    try {
      // Calculate the center point of the solar panel array
      // The panel marker's visual center is offset from its coordinates
      // We need to adjust the panel coordinates to target the visual center
      
      const lineFeature: Feature<LineString> = {
        type: 'Feature',
        id: 'meter-to-panel-line',
        geometry: {
          type: 'LineString',
          coordinates: [meterCoords, panelCoords]
        },
        properties: {}
      };

      if (lineFeatureIdRef.current) {
        draw.delete(lineFeatureIdRef.current);
      }
      const ids = draw.add(lineFeature);
      lineFeatureIdRef.current = ids[0];
    } catch (error) {
      console.error('Error creating/updating line:', error);
    }
  }, [lineFeatureIdRef]);

  const calculateDistance = useCallback((meterCoords: [number, number], panelCoords: [number, number]) => {
    try {
      const from = turf.point(meterCoords);
      const to = turf.point(panelCoords);
      const distanceInKm = turf.distance(from, to);
      return Math.round(distanceInKm * 3280.84);
    } catch (error) {
      console.error('Error calculating distance:', error);
      return 0;
    }
  }, []);

  const updateDistanceAndCost = useCallback((meterCoords: [number, number], panelCoords: [number, number]) => {
    try {
      // meterCoords is optional, it happen when user click on the map to place electrical meter for the first time
      if (!meterCoords || !panelCoords) return;

      const distanceInFeet = calculateDistance(meterCoords, panelCoords);
      const additionalCost = distanceInFeet * COST_PER_FOOT;

      setElectricalMeter({
        coordinates: {
          latitude: meterCoords[1],
          longitude: meterCoords[0]
        },
        distanceInFeet
      });
      setAdditionalCost(additionalCost);
    } catch (error) {
      console.error('Error updating distance and cost:', error);
    }
  }, [setElectricalMeter, setAdditionalCost, calculateDistance]);

  useEffect(() => {
    if (electricalMeterPosition && panelPosition && drawRef.current) {
      console.log('panelPosition', panelPosition)
      updateDistanceAndCost(electricalMeterPosition, panelPosition);
      createOrUpdateLine(electricalMeterPosition, panelPosition, drawRef.current);
    }
  }, [electricalMeterPosition, panelPosition, createOrUpdateLine, drawRef]);

  // Stabilize setter functions with useCallback
  const stableSetCurrentStepIndex = useCallback(setCurrentStepIndex, []);
  const stableSetAddress = useCallback(setAddress, []);
  const stableSetCoordinates = useCallback(setCoordinates, []);
  const stableSetQuotation = useCallback(setQuotation, []);
  const stableSetPaymentMethod = useCallback(setPaymentMethod, []);
  const stableSetTotalPanels = useCallback(setTotalPanels, []);
  const stableSetMapZoomPercentage = useCallback(setMapZoomPercentage, []);
  const stableSetPercentage = useCallback(setPercentage, []);
  const stableSetAvgValue = useCallback(setAvgValue, []);
  const stableSetHighestValue = useCallback(setHighestValue, []);
  const stableSetQuoteId = useCallback(setQuoteId, []);
  const stableSetElectricalMeter = useCallback(setElectricalMeter, []);
  const stableSetAdditionalCost = useCallback(setAdditionalCost, []);
  const stableSetPanelPosition = useCallback(setPanelPosition, []);
  const stableSetElectricalMeterPosition = useCallback(setElectricalMeterPosition, []);
  const stableSetIsAutoLocationError = useCallback(setIsAutoLocationError, []);

  const values: QuoteContextValues = React.useMemo(() => ({
    currentStepIndex,
    address,
    coordinates,
    quotation,
    totalPanels,
    paymentMethod,
    percentage,
    avgValue,
    highestValue,
    quoteId,
    leadId,
    startedAt,
    isAutoLocationError,
    shouldContinueButtonDisabled,
    isAddressCoordinatesCompleted,
    mapZoomPercentage,
    shouldDrawPanels,
    electricalMeter,
    additionalCost,
    panelPosition,
    electricalMeterPosition,
    lineFeatureIdRef,
    drawRef,
    setIsAutoLocationError: stableSetIsAutoLocationError,
    setCurrentStepIndex: stableSetCurrentStepIndex,
    setAddress: stableSetAddress,
    setCoordinates: stableSetCoordinates,
    setQuotation: stableSetQuotation,
    setPaymentMethod: stableSetPaymentMethod,
    setTotalPanels: stableSetTotalPanels,
    setMapZoomPercentage: stableSetMapZoomPercentage,
    setPercentage: stableSetPercentage,
    setAvgValue: stableSetAvgValue,
    setHighestValue: stableSetHighestValue,
    setQuoteId: stableSetQuoteId,
    setElectricalMeter: stableSetElectricalMeter,
    setAdditionalCost: stableSetAdditionalCost,
    setPanelPosition: stableSetPanelPosition,
    setElectricalMeterPosition: stableSetElectricalMeterPosition,
    createOrUpdateLine,
    updateDistanceAndCost,
  }), [
    currentStepIndex,
    address,
    coordinates,
    quotation,
    totalPanels,
    paymentMethod,
    percentage,
    avgValue,
    highestValue,
    quoteId,
    leadId,
    startedAt,
    isAutoLocationError,
    shouldContinueButtonDisabled,
    isAddressCoordinatesCompleted,
    shouldDrawPanels,
    mapZoomPercentage,
    electricalMeter,
    additionalCost,
    panelPosition,
    electricalMeterPosition,
    lineFeatureIdRef,
    drawRef,
    stableSetIsAutoLocationError,
    stableSetCurrentStepIndex,
    stableSetAddress,
    stableSetCoordinates,
    stableSetQuotation,
    stableSetPaymentMethod,
    stableSetTotalPanels,
    stableSetMapZoomPercentage,
    stableSetPercentage,
    stableSetAvgValue,
    stableSetHighestValue,
    stableSetQuoteId,
    stableSetElectricalMeter,
    stableSetAdditionalCost,
    stableSetPanelPosition,
    stableSetElectricalMeterPosition,
    createOrUpdateLine,
    updateDistanceAndCost
  ]);

  return (
    <QuoteContext.Provider value={values}>
      {children}
    </QuoteContext.Provider>
  )
}

export default QuoteContextProvider
