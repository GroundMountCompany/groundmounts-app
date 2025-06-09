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

interface StepContent {
  label: string;
  title?: string;
  description?: string;
}