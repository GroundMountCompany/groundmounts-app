'use client';

import { useDebounce } from '@/lib/hooks';
import { searchAddress } from '@/lib/mapbox';
import { GeocodingFeature } from '@/types';
import { useEffect, useRef, useState, ChangeEvent, JSX } from 'react';
import { useQuoteContext } from '@/contexts/quoteContext';
import { useSearchParams } from 'next/navigation';
import { fireDesignStartOnce } from '@/lib/fb';

export const AddressInput = (): JSX.Element => {
  const { setAddress, setCoordinates } = useQuoteContext();
  const [suggestions, setSuggestions] = useState<GeocodingFeature[]>([]);
  const [localAddress, setLocalAddress] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(true);
  const debouncedAddress = useDebounce<string>(localAddress, 500);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const inputAddressRef = useRef<HTMLInputElement>(null);

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

  const handleSuggestionClick = (suggestion: GeocodingFeature): void => {
    setShowSuggestions(false);
    setAddress(suggestion.place_name);
    setLocalAddress(suggestion.place_name);
    setCoordinates({
      latitude: suggestion.center[1],
      longitude: suggestion.center[0],
    });
    inputAddressRef.current?.blur();
    
    // Fire DesignStart once per session
    try { fireDesignStartOnce(); } catch {}
  };

  return (
    <div className="w-full relative">
      <div className="space-y-2">
        <div className="relative">
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
              try { fireDesignStartOnce(); } catch {}
            }}
            className="h-14 w-full rounded-xl border border-neutral-300 bg-white px-4 text-[17px] outline-none transition focus:border-neutral-500 placeholder:text-neutral-500"
            placeholder="Enter your address"
            autoComplete="off"
          />
          {isLoading && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-transparent" />
            </div>
          )}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute z-10 top-[60px] w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
            >
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  className="min-h-[48px] w-full px-4 py-3 text-left text-[16px] text-neutral-800 transition hover:bg-neutral-100"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  {suggestion.place_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddressInput;
