import type { GeocodingFeature, MapboxResponse } from '@/types';

export async function searchAddress(query: string): Promise<GeocodingFeature[]> {
  if (!query || query.length < 3) return [];

  const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    query
  )}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}&types=address,postcode&limit=5&country=${process.env.NEXT_PUBLIC_COUNTRY_CODE}`;

  try {
    const response = await fetch(endpoint);
    const data: MapboxResponse = await response.json();

    return data.features.map((feature) => ({
      id: feature.id,
      place_name: feature.place_name,
      center: feature.center,
    }));
  } catch (error) {
    console.error('Error fetching address suggestions:', error);
    return [];
  }
}

export async function reverseGeocode(coordinates: [number, number]): Promise<string> {
  const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${coordinates[0]},${coordinates[1]}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`;
  try {
    const response = await fetch(endpoint);
    const data: MapboxResponse = await response.json();

    return data.features[0].place_name;
  } catch (error) {
    console.error('Error fetching address suggestions:', error);
    return '';
  }
}
