'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { BrandConfig } from '@/config/brands';
import { getBrand } from '@/config/getBrand';

const BrandContext = createContext<BrandConfig | null>(null);

interface BrandProviderProps {
  children: ReactNode;
  brand?: BrandConfig;
}

/**
 * Provider for brand configuration throughout the app.
 * Can optionally accept a brand prop for server-side rendering,
 * otherwise uses getBrand() to read from env.
 */
export function BrandProvider({ children, brand }: BrandProviderProps) {
  const brandConfig = brand || getBrand();

  return (
    <BrandContext.Provider value={brandConfig}>
      {children}
    </BrandContext.Provider>
  );
}

/**
 * Hook to access the current brand configuration.
 * Must be used within a BrandProvider.
 */
export function useBrand(): BrandConfig {
  const context = useContext(BrandContext);

  if (!context) {
    throw new Error('useBrand must be used within a BrandProvider');
  }

  return context;
}

/**
 * HOC to inject brand config as a prop for class components or
 * components that need brand outside of hooks.
 */
export function withBrand<P extends { brand: BrandConfig }>(
  Component: React.ComponentType<P>
) {
  return function WrappedComponent(props: Omit<P, 'brand'>) {
    const brand = useBrand();
    return <Component {...(props as P)} brand={brand} />;
  };
}
