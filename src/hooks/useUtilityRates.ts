import { useState } from 'react';
import { getUtilityRates } from '@/lib/nrel';
import { NRELApiError, NRELConfigError, NRELDataError } from '@/lib/nrel';

interface UtilityRates {
  residential: number;
  commercial: number;
  industrial: number;
  utilityName: string;
}

interface UseUtilityRatesReturn {
  fetchUtilityRates: (coordinates: [number, number]) => Promise<void>;
  utilityRates: UtilityRates | null;
  isLoading: boolean;
  error: string | null;
}

export const useUtilityRates = (): UseUtilityRatesReturn => {
  const [utilityRates, setUtilityRates] = useState<UtilityRates | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUtilityRates = async (coordinates: [number, number]) => {
    setIsLoading(true);
    setError(null);

    try {
      const utilityData = await getUtilityRates(coordinates);
      setUtilityRates({
        residential: utilityData.outputs.residential,
        commercial: utilityData.outputs.commercial,
        industrial: utilityData.outputs.industrial,
        utilityName: utilityData.outputs.utility_name
      });
    } catch (error) {
      let errorMessage = 'Failed to fetch utility rates';
      
      if (error instanceof NRELConfigError) {
        errorMessage = 'System configuration error. Please contact support.';
        console.error('NREL configuration error:', error.message);
      } else if (error instanceof NRELApiError) {
        errorMessage = 'Unable to reach utility rate service. Please try again later.';
        console.error('NREL API error:', error.message, 'Status:', error.statusCode);
      } else if (error instanceof NRELDataError) {
        errorMessage = 'Invalid data received from utility rate service.';
        console.error('NREL data error:', error.message, 'Data:', error.data);
      } else {
        console.error('Unexpected error:', error);
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    fetchUtilityRates,
    utilityRates,
    isLoading,
    error
  };
}; 
