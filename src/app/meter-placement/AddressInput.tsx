'use client';

import { useState, useEffect } from 'react';
import { debounce } from 'lodash';

interface Props {
  onAddressSelect: (address: string, coordinates: { lat: number; lng: number }) => void;
}

export default function AddressInput({ onAddressSelect }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const searchAddress = async (input: string) => {
    if (!input) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          input
        )}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}&types=address&country=US`
      );
      const data = await response.json();
      setSuggestions(data.features);
    } catch (error) {
      console.error('Error fetching address suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const debouncedSearch = debounce(searchAddress, 300);

  useEffect(() => {
    if (query.length >= 3) {
      debouncedSearch(query);
    } else {
      setSuggestions([]);
    }
  }, [query]);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Enter your address"
        className="w-full p-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      
      {isLoading && (
        <div className="absolute right-3 top-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="absolute w-full mt-1 bg-white border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 focus:bg-gray-100"
              onClick={() => {
                setQuery(suggestion.place_name);
                setSuggestions([]);
                onAddressSelect(suggestion.place_name, {
                  lat: suggestion.center[1],
                  lng: suggestion.center[0]
                });
              }}
            >
              {suggestion.place_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
} 