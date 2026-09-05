'use client';

import { useDebounce } from '@/lib/hooks';
import { searchAddress } from '@/lib/mapbox';
import { GeocodingFeature } from '@/types';
import { useEffect, useRef, useState, useCallback, ChangeEvent, JSX } from 'react';
import { createPortal } from 'react-dom';
import { useQuoteContext } from '@/contexts/quoteContext';
import { useSearchParams } from 'next/navigation';
import { fireDesignStartOnce } from '@/lib/fb';
import { UI } from '@/config/copy';

/** Where the portalled list is drawn, in viewport coordinates. */
type Anchor = { left: number; top: number; width: number; maxHeight: number };

interface AddressInputProps {
  /**
   * Called when the address field takes focus. The shell drops the sheet to
   * peek so the suggestions have the space between the input and the keyboard.
   */
  onFocusRequestPeek?: () => void;
}

export const AddressInput = ({ onFocusRequestPeek }: AddressInputProps = {}): JSX.Element => {
  const { setAddress, setCoordinates } = useQuoteContext();
  const [suggestions, setSuggestions] = useState<GeocodingFeature[]>([]);
  const [localAddress, setLocalAddress] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(true);
  const debouncedAddress = useDebounce<string>(localAddress, 500);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const inputAddressRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState<boolean>(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  useEffect(() => setMounted(true), []);

  /**
   * Measure the gap between the bottom of the input and the top of the
   * keyboard.
   *
   * iOS Safari shrinks the *visual* viewport when the keyboard comes up and
   * leaves the layout viewport alone, so `window.innerHeight` still claims the
   * full screen. visualViewport is the only thing that knows where the keyboard
   * starts, and that boundary is what caps the list's height.
   */
  const measure = useCallback((): void => {
    const input = inputAddressRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const vv = window.visualViewport;
    const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    setAnchor({
      left: rect.left,
      top: rect.bottom + 6,
      width: rect.width,
      maxHeight: Math.max(96, bottom - rect.bottom - 6 - 8),
    });
  }, []);

  useEffect(() => {
    if (!showSuggestions) return;
    measure();
    const vv = window.visualViewport;
    // The sheet animating to peek and the keyboard sliding up both move the
    // input; re-measure until things settle rather than guessing a duration.
    const frames = [0, 60, 120, 240, 400].map((d) => window.setTimeout(measure, d));
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    return () => {
      frames.forEach(window.clearTimeout);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
    };
  }, [showSuggestions, suggestions.length, measure]);

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
    // Runs once on mount: ?zipcode= is an entry parameter, not something that
    // should re-geocode every time the store updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              // Get the sheet out of the way so the list has the gap between
              // the input and the keyboard to live in.
              onFocusRequestPeek?.();
              try { fireDesignStartOnce(); } catch {}
            }}
            className="h-14 w-full rounded-xl border border-neutral-300 bg-white px-4 text-[17px] outline-none transition focus:border-neutral-500 placeholder:text-neutral-500"
            placeholder={UI.addressPlaceholder}
            autoComplete="off"
          />
          {isLoading && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-transparent" />
            </div>
          )}
          {/*
            Rendered into the body, not into the sheet.
            
            The sheet is a positioned, scrolling container: a list inside it is
            clipped by it and painted underneath it, which on a real iPhone put
            the suggestions behind the sheet and the keyboard both. A portal at
            the top of the stack is the only place they are reliably visible.
          */}
          {mounted && showSuggestions && suggestions.length > 0 && anchor
            ? createPortal(
                <div
                  ref={suggestionsRef}
                  data-testid="address-suggestions"
                  className="fixed z-[100] overflow-y-auto overscroll-contain rounded-xl border border-neutral-200 bg-white shadow-2xl"
                  style={{
                    left: anchor.left,
                    top: anchor.top,
                    width: anchor.width,
                    maxHeight: anchor.maxHeight,
                  }}
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
                </div>,
                document.body
              )
            : null}
        </div>
      </div>
    </div>
  );
};

export default AddressInput;
