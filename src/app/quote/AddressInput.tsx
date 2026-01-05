'use client';

import { useDebounce } from '@/lib/hooks';
import { searchAddress } from '@/lib/mapbox';
import { cn } from '@/lib/utils';
import { GeocodingFeature } from '@/types';
import { useEffect, useRef, useState, FormEvent, ChangeEvent, JSX } from 'react';
import { useQuoteContext } from '@/contexts/quoteContext';
import { useSearchParams } from 'next/navigation';
import { enqueueOrSend } from '@/lib/leadQueue';
import { fireDesignStartOnce } from '@/lib/fb';

// Sample: 1600 Amphitheatre Parkway, Mountain View, CA

type MapboxFeature = {
  place_type?: string[];
  context?: Array<{ id?: string; short_code?: string; text?: string }>;
};

function deriveStateFromFeature(f: MapboxFeature): { stateCode?: string; stateName?: string } {
  const ctx = Array.isArray(f?.context) ? f.context : [];
  const region = ctx.find(c => c.id?.startsWith("region"));
  const short = region?.short_code; // e.g., "US-TX"
  const stateCode = typeof short === "string" ? short.split("-")[1] : undefined;
  const stateName = region?.text;
  return { stateCode, stateName };
}

export const AddressInput = (): JSX.Element => {
  const { setAddress, setCoordinates, shouldContinueButtonDisabled, setCurrentStepIndex, leadId } = useQuoteContext();
  const [suggestions, setSuggestions] = useState<GeocodingFeature[]>([]);
  const [localAddress, setLocalAddress] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(true);
  const debouncedAddress = useDebounce<string>(localAddress, 500);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const inputAddressRef = useRef<HTMLInputElement>(null);
  const [derivedState, setDerivedState] = useState<string>('');
  
  // Get state from URL params (e.g., /quote?state=Texas) or use derived state
  const selectedState = searchParams.get('state') || derivedState || 'TX';

  // Early lead capture function
  const captureEarlyLead = async (address: string, state?: string) => {
    const stateToUse = state || selectedState;
    try {
      await enqueueOrSend({
        id: leadId,
        state: stateToUse,
        email: "",
        phone: "",
        address: address,
        ts: Date.now(),
      });
      console.log("[EARLY_LEAD_CAPTURED]", leadId, stateToUse, address);
    } catch (error) {
      console.error("[EARLY_LEAD_CAPTURE_ERROR]", error);
    }
  };

  useEffect(() => {
    const fetchSuggestions = async (): Promise<void> => {
      if (debouncedAddress.length < 3) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const results = await searchAddress(debouncedAddress);
        setSuggestions(results);
      } catch (error) {
        console.warn('Error fetching suggestions:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuggestions();
  }, [debouncedAddress]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const searchZipcode = async (): Promise<void> => {
      try {
        setLocalAddress(searchParams.get('zipcode') || '');
        const results = await searchAddress(searchParams.get('zipcode') || '');
        setShowSuggestions(false);
        setSuggestions([]);
        setAddress(results[0].place_name);
        setLocalAddress(results[0].place_name);
        setCoordinates({
        latitude: results[0].center[1],
        longitude: results[0].center[0],
        });
        // Derive state from geocoded result
        const { stateCode, stateName } = deriveStateFromFeature(results[0] as MapboxFeature);
        const derivedStateValue = stateCode || stateName || 'TX';
        setDerivedState(derivedStateValue);
        // Capture lead early when address is set from zipcode
        await captureEarlyLead(results[0].place_name, derivedStateValue);
        // Fire DesignStart once per session
        try { fireDesignStartOnce(); } catch {}
      } catch (error) {
        console.warn('Error fetching address from zipcode:', error);
      }
    };
    if (searchParams.get('zipcode')) {
      searchZipcode();
    }
  }, []);

  const handleSuggestionClick = async (suggestion: GeocodingFeature): Promise<void> => {
    setShowSuggestions(false);
    setAddress(suggestion.place_name);
    setLocalAddress(suggestion.place_name);
    setCoordinates({
      latitude: suggestion.center[1],
      longitude: suggestion.center[0],
    });
    inputAddressRef.current?.blur();
    
    // Derive state from selected suggestion
    const { stateCode, stateName } = deriveStateFromFeature(suggestion as MapboxFeature);
    const derivedStateValue = stateCode || stateName || 'TX';
    setDerivedState(derivedStateValue);
    
    // Capture lead early when address suggestion is selected
    await captureEarlyLead(suggestion.place_name, derivedStateValue);
    // Fire DesignStart once per session
    try { fireDesignStartOnce(); } catch {}
  };

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    // Address will be sent to Airtable when lead is captured in Step3Form
    setCurrentStepIndex(1);
  };

  return (
    <div className="w-full relative">
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex flex-row gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              id="address"
              ref={inputAddressRef}
              value={localAddress}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setShowSuggestions(true);
                setLocalAddress(e.target.value);
              }}
              onFocus={() => {
                setShowSuggestions(true);
                // Fire DesignStart on first focus
                try { fireDesignStartOnce(); } catch {}
              }}
              className="h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base outline-none ring-0 transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 placeholder:text-neutral-500"
              placeholder="Enter your address"
              autoComplete="off"
            />
            {isLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-200 border-t-transparent"></div>
              </div>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-10 top-[52px] w-full shadow-lg rounded-lg bg-white border border-neutral-200"
              >
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className="w-full px-4 py-2 text-left transition-all duration-300 hover:bg-gray-100 focus:outline-none focus:bg-gray-100 text-sm text-neutral-700 first:rounded-t-lg last:rounded-b-lg"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion.place_name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            className={cn("h-12 px-4 rounded-xl text-sm font-semibold transition-all duration-300 shrink-0", {
              'bg-gray-400 text-white cursor-not-allowed': shouldContinueButtonDisabled,
              'bg-black text-white hover:bg-gray-800': !shouldContinueButtonDisabled,
            })}
            disabled={shouldContinueButtonDisabled}
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddressInput;
