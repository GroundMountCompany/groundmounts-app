'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import AddressInput from './AddressInput';
import Image from 'next/image';
import Button from "@/components/common/Button";

// Initialize mapbox with token
if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
  throw new Error('Mapbox token is required');
}
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

interface Coordinates {
  lat: number;
  lng: number;
}

export default function MeterPlacementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [meterCoordinates, setMeterCoordinates] = useState<Coordinates | null>(null);
  const [showInstructions, setShowInstructions] = useState(true);

  useEffect(() => {
    if (!map.current && mapContainer.current && coordinates) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-v9',
        center: [coordinates.lng, coordinates.lat],
        zoom: 19,
        pitch: 45
      });

      map.current.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        
        if (marker.current) {
          marker.current.remove();
        }

        marker.current = new mapboxgl.Marker({
          color: '#FF0000',
          draggable: true
        })
          .setLngLat([lng, lat])
          .addTo(map.current!);

        setMeterCoordinates({ lng, lat });
      });
    }
  }, [coordinates]);

  const handleAddressSelect = (selectedAddress: string, coords: Coordinates) => {
    setAddress(selectedAddress);
    setCoordinates(coords);
    setShowInstructions(false);
  };

  const handleContinue = async () => {
    if (!address || !meterCoordinates || !userId) return;

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          address,
          meterCoordinates,
          timestamp: new Date().toISOString()
        }),
      });

      if (!response.ok) throw new Error('Failed to submit data');

      router.push('/quote'); // or wherever you want to redirect next
    } catch (error) {
      console.error('Error:', error);
      alert('There was an error saving your information. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Instructions Modal */}
      {showInstructions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <h2 className="text-2xl font-bold mb-4">Place Your Electrical Meter</h2>
            <div className="space-y-4">
              <p>Follow these steps:</p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Enter your address in the search box</li>
                <li>Once your property is shown, locate your electrical meter</li>
                <li>Click on the map to place the meter pin</li>
              </ol>
              <div className="mt-4">
                <h3 className="font-semibold mb-2">Example Electrical Meters:</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Image
                    src="/images/meter-example-1.jpg"
                    alt="Example electrical meter 1"
                    width={200}
                    height={150}
                    className="rounded-lg"
                  />
                  <Image
                    src="/images/meter-example-2.jpg"
                    alt="Example electrical meter 2"
                    width={200}
                    height={150}
                    className="rounded-lg"
                  />
                </div>
              </div>
              <button
                className="mt-6 w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
                onClick={() => setShowInstructions(false)}
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-none p-4 bg-white shadow-md z-10">
        <AddressInput onAddressSelect={handleAddressSelect} />
      </div>

      {/* Map Container */}
      <div ref={mapContainer} className="flex-grow" />

      {/* Helper Text */}
      {coordinates && !meterCoordinates && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-white px-4 py-2 rounded-full shadow-lg">
          Click on the map to place your electrical meter
        </div>
      )}

      {/* Continue Button */}
      <div className="flex-none p-4 bg-white border-t">
        <Button
          onClick={handleContinue}
          disabled={!address || !meterCoordinates}
          className="w-full"
          type="primary"
          size="big"
        >
          Continue
        </Button>
      </div>
    </div>
  );
} 