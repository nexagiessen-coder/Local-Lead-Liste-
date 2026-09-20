import { env } from '@/lib/env';
import { ProviderError, type GeocodeResult, type GeocodingProvider, type ProviderInfo } from '../types';

interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results: Array<{
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
    address_components: Array<{ long_name: string; short_name: string; types: string[] }>;
  }>;
}

export class GoogleGeocodingProvider implements GeocodingProvider {
  readonly info: ProviderInfo;

  constructor(private readonly apiKey = env.googleMapsApiKey) {
    this.info = {
      id: 'google',
      label: 'Google Geocoding API',
      attribution: 'Geocoding data © Google',
      isAvailable: Boolean(apiKey),
      unavailableReason: apiKey ? null : 'GOOGLE_MAPS_API_KEY is not set.',
    };
  }

  async geocode(query: string): Promise<GeocodeResult | null> {
    if (!this.apiKey) {
      throw new ProviderError('google', 'GOOGLE_MAPS_API_KEY is not configured.');
    }
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', query);
    url.searchParams.set('key', this.apiKey);

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(env.fetchTimeoutMs) });
    } catch (cause) {
      throw new ProviderError('google', 'Geocoding request failed.', { cause, retryable: true });
    }
    if (!response.ok) {
      throw new ProviderError('google', `Geocoding returned HTTP ${response.status}.`, {
        retryable: response.status >= 500,
      });
    }

    const data = (await response.json()) as GoogleGeocodeResponse;
    if (data.status === 'ZERO_RESULTS') return null;
    if (data.status !== 'OK') {
      throw new ProviderError('google', `Geocoding error: ${data.status} ${data.error_message ?? ''}`.trim());
    }

    const first = data.results[0];
    if (!first) return null;
    const component = (type: string) =>
      first.address_components.find((c) => c.types.includes(type)) ?? null;

    return {
      label: first.formatted_address,
      lat: first.geometry.location.lat,
      lon: first.geometry.location.lng,
      city: component('locality')?.long_name ?? component('postal_town')?.long_name ?? null,
      postalCode: component('postal_code')?.long_name ?? null,
      region: component('administrative_area_level_1')?.long_name ?? null,
      countryCode: component('country')?.short_name ?? null,
      importance: null,
    };
  }
}
