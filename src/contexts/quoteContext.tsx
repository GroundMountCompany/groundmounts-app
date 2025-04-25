'use client';

import React, { createContext, useContext, useState } from 'react';

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface MeterLocation {
  latitude: number;
  longitude: number;
}

interface QuoteContextType {
  address: string;
  setAddress: (address: string) => void;
  coordinates: Coordinates;
  setCoordinates: (coordinates: Coordinates) => void;
  meterLocation: MeterLocation | null;
  setMeterLocation: (location: MeterLocation | null) => void;
}

const QuoteContext = createContext<QuoteContextType | undefined>(undefined);

export function QuoteProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string>('');
  const [coordinates, setCoordinates] = useState<Coordinates>({
    latitude: 0,
    longitude: 0,
  });
  const [meterLocation, setMeterLocation] = useState<MeterLocation | null>(null);

  return (
    <QuoteContext.Provider
      value={{
        address,
        setAddress,
        coordinates,
        setCoordinates,
        meterLocation,
        setMeterLocation,
      }}
    >
      {children}
    </QuoteContext.Provider>
  );
}

export function useQuoteContext() {
  const context = useContext(QuoteContext);
  if (context === undefined) {
    throw new Error('useQuoteContext must be used within a QuoteProvider');
  }
  return context;
} 