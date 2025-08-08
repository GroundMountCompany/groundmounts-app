'use client';

import { useDebounce } from '@/lib/hooks';
import { searchAddress, reverseGeocode } from '@/lib/mapbox';
import { cn, updateSheet } from '@/lib/utils';
import { GeocodingFeature } from '@/types';
import { useEffect, useRef, useState, FormEvent, ChangeEvent, JSX } from 'react';
import { useQuoteContext } from '@/contexts/quoteContext';
import { useSearchParams } from 'next/navigation';
import { enqueueOrSend } from '@/lib/leadQueue';

// Sample: 1600 Amphitheatre Parkway, Mountain View, CA

export const AddressInput = (): JSX.Element => {
  const { setAddress, setCoordinates, setIsAutoLocationError, shouldContinueButtonDisabled, setCurrentStepIndex, leadId } = useQuoteContext();
  const [suggestions, setSuggestions] = useState<GeocodingFeature[]>([]);
  const [localAddress, setLocalAddress] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(true);
  const debouncedAddress = useDebounce<string>(localAddress, 500);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const inputAddressRef = useRef<HTMLInputElement>(null);
  
  // Get state from URL params (e.g., /quote?state=Texas)
  const selectedState = searchParams.get('state') || 'TX';

  // Early lead capture function
  const captureEarlyLead = async (address: string) => {
    try {
      await enqueueOrSend({
        id: leadId,
        state: selectedState,
        email: "",
        phone: "",
        address: address,
        ts: Date.now(),
      });
      console.log("[EARLY_LEAD_CAPTURED]", leadId, selectedState, address);
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
    const detectLocation = async (): Promise<void> => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position: GeolocationPosition) => {
          const { latitude, longitude } = position.coords;
          const coordinates: [number, number] = [longitude, latitude];

          try {
            const address = await reverseGeocode(coordinates);
            setLocalAddress(address);
            setAddress(address);
            setCoordinates({
              latitude,
              longitude,
            });
            setShowSuggestions(false);
            setSuggestions([]);
            console.log('Detect Location Success:Address:', address, ' | Coordinates:', coordinates);
            setIsAutoLocationError(false);
            // Capture lead early when address is detected
            await captureEarlyLead(address);
          } catch (error) {
            console.warn('Error fetching address from coordinates:', error);
            setIsAutoLocationError(true)
          }
        }, (error: GeolocationPositionError) => {
          console.warn('Error getting location:', error);
          setIsAutoLocationError(true)
        });
      } else {
        console.warn('Geolocation is not supported by this browser.');
      }
    };
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
        // Capture lead early when address is set from zipcode
        await captureEarlyLead(results[0].place_name);
      } catch (error) {
        console.warn('Error fetching address from zipcode:', error);
        setIsAutoLocationError(true)
      }
    };
    if (!searchParams.get('zipcode')) {
      detectLocation();
    } else {
      searchZipcode();
    }
  }, []);

  const handleSuggestionClick = async (suggestion: GeocodingFeature): Promise<void> => {
    setShowSuggestions(false);
    setIsAutoLocationError(false);
    setAddress(suggestion.place_name);
    setLocalAddress(suggestion.place_name);
    setCoordinates({
      latitude: suggestion.center[1],
      longitude: suggestion.center[0],
    });
    inputAddressRef.current?.blur();
    // Capture lead early when address suggestion is selected
    await captureEarlyLead(suggestion.place_name);
  };

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    await updateSheet("E", localAddress)
    setCurrentStepIndex(1);
  };

  return (
    <div className="w-full max-w-md mx-auto relative">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-row">
          <div className="relative grow shrink-0 lg:grow-0">
            <input
              type="text"
              id="address"
              ref={inputAddressRef}
              value={localAddress}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setShowSuggestions(true);
                setLocalAddress(e.target.value);
              }}
              onFocus={() => setShowSuggestions(true)}
              className="shadow-lg rounded-full px-4 py-2 filter backdrop-blur-md bg-white/70 text-xs text-[#111111] placeholder:text-xs placeholder:text-[#111111] outline-none w-full lg:w-[433px] h-[42px]"
              placeholder="Find My Location"
              autoComplete="off"
            />
            {isLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-200 border-t-transparent"></div>
              </div>
            )}
            {!isLoading && (
              <img src="/images/icons/detect-location.png" alt="location" className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" />
            )}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-10 bottom-[48px] w-full shadow-lg rounded-lg filter backdrop-blur-md bg-white/70"
              >
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className="w-full px-4 py-2 text-left transition-all duration-300 hover:bg-gray-100 focus:outline-none focus:bg-gray-100 text-xs text-[#111111] first:rounded-t-lg last:rounded-b-lg"
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
            className={cn("hover:bg-custom-primary bg-custom-black text-white transition-all duration-300 px-4 py-2 rounded-full px-6 py-3 text-xs ml-3 lg:ml-4 filter backdrop-blur-md", {
              'bg-[#C0C0C0] cursor-not-allowed': shouldContinueButtonDisabled,
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
