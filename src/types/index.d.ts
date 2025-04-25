import { ReactNode } from 'react';
// MapBox related types
export interface GeocodingFeature {
  id: string;
  place_name: string;
  center: [number, number];
}

export interface MapboxFeature {
  id: string;
  place_name: string;
  center: [number, number];
  features?: MapboxFeature[];
}

export interface MapboxResponse {
  features: MapboxFeature[];
}

// NREL API related types
export interface UtilityRateResponse {
  inputs: {
    address: string;
    lat: number;
    lon: number;
  };
  outputs: {
    residential: number;
    commercial: number;
    industrial: number;
    utility_name: string;
    utility_info: {
      eiaid: number;
      company_id: string;
      utility_name: string;
    };
  };
  errors: string[];
}

// Solar Panel related types
export interface PanelPosition {
  coords: [number, number];
  bearing: number;
}

export interface PanelLayout {
  totalPanels: number;
  rows: number;
  panelsPerRow: number;
  totalArea: number;
  totalPowerKW: number;
}

export interface ButtonProps {
  href?: string;
  type?: 'primary' | 'secondary' | 'primaryOutline';
  size?: 'small' | 'big' | 'responsive';
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
}

export interface NavLink {
  href: string;
  label: string;
}

export interface HeroCard {
  title: string;
  description: string;
}

export interface ServiceCard {
  title: string;
  description: string;
}

export interface CostOfRoofTable {
  col1: string;
  col2: string;
  col3: string;
}

export interface FaqItem {
  title: string;
  content: string;
}

export interface AccordionItem {
  title: string;
  content: string;
}

export interface AccordionProps {
  items: AccordionItem[];
  icon?: 'plus' | 'chevron';
}

export interface AboutCard {
  title: string;
}

export interface ZipcodeInputProps {
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
}

export interface TransitionVariants {
  delay?: number;
  duration: number;
  ease: string;
}

export interface RevealProps {
  initial: {
    x?: number;
    y?: number;
    opacity: number;
  };
  whileInView?: {
    x?: number;
    y?: number;
    opacity: number;
  };
  animate?: {
    x?: number;
    y?: number;
    opacity: number;
  };
  viewport?: { once: boolean };
  transition: TransitionVariants;
}

export interface ApproachStep {
  step: number;
  title: string;
  description: string;
  additionalDescription: string;
  estimatedTime: string;
  decorationImage?: string;
  decorationImagePosition?: string;
}

interface StepContent {
  label: string;
  title: string;
  description: string;
}

interface DynamicStyling {
  width: number;
  height: number;
  panelHeight: number;
  fontSize: number;
  efficiencyBarHeight: number;
}
