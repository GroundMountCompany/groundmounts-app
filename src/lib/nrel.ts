import type { UtilityRateResponse } from '@/types';

// Custom error classes for better error handling
export class NRELApiError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'NRELApiError';
  }
}

export class NRELConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NRELConfigError';
  }
}

export class NRELDataError extends Error {
  constructor(message: string, public data?: unknown) {
    super(message);
    this.name = 'NRELDataError';
  }
}

export async function getUtilityRates(coords: [number, number]): Promise<UtilityRateResponse> {
  const [longitude, latitude] = coords;
  
  // Validate API key
  if (!process.env.NEXT_PUBLIC_NREL_API_KEY) {
    throw new NRELConfigError('NREL API key is not configured');
  }

  // Validate coordinates
  if (!isValidCoordinates(latitude, longitude)) {
    throw new NRELDataError(
      'Invalid coordinates provided',
      { latitude, longitude }
    );
  }

  const apiUrl = `https://developer.nrel.gov/api/utility_rates/v3.json?api_key=${
    process.env.NEXT_PUBLIC_NREL_API_KEY
  }&lat=${latitude}&lon=${longitude}`;

  try {
    const response = await fetch(apiUrl);
    
    // Handle different HTTP status codes
    if (!response.ok) {
      let errorMessage = `NREL API error: ${response.statusText}`;
      
      // Try to get more detailed error message from response
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch {
        // If we can't parse the error response, use the default message
      }

      throw new NRELApiError(errorMessage, response.status);
    }

    const data = await response.json();

    // Validate response data structure
    if (!isValidUtilityRateResponse(data)) {
      throw new NRELDataError(
        'Invalid response data structure from NREL API',
        data
      );
    }

    // Check for API-level errors
    if (data.errors && data.errors.length > 0) {
      throw new NRELDataError(
        'NREL API returned errors',
        data.errors
      );
    }

    // Log successful response
    console.log('Utility rates data:', {
      residential: data.outputs.residential,
      commercial: data.outputs.commercial,
      industrial: data.outputs.industrial,
      utility_name: data.outputs.utility_name
    });

    return data;
  } catch (error) {
    // Handle different types of errors
    if (error instanceof NRELApiError || 
        error instanceof NRELConfigError || 
        error instanceof NRELDataError) {
      throw error;
    }

    // Handle unexpected errors
    console.error('Unexpected error while fetching utility rates:', error);
    throw new NRELApiError('Failed to fetch utility rates data');
  }
}

// Helper functions for validation
function isValidCoordinates(lat: number, lon: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180
  );
}

function isValidUtilityRateResponse(data: unknown): data is UtilityRateResponse {
  return (
    !!data &&
    typeof data === 'object' &&
    'outputs' in data &&
    !!data.outputs &&
    typeof data.outputs === 'object' &&
    'residential' in data.outputs &&
    typeof data.outputs.residential === 'number' &&
    'commercial' in data.outputs &&
    typeof data.outputs.commercial === 'number' &&
    'industrial' in data.outputs &&
    typeof data.outputs.industrial === 'number' &&
    'utility_name' in data.outputs &&
    typeof data.outputs.utility_name === 'string'
  );
} 
