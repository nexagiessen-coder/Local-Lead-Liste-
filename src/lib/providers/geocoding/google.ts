import { env } from '@/lib/env';
import { createThrottle, parseRetryAfter, withRetry } from '../throttle';
import {
  ProviderError,
  type GeocodeResult,
  type GeocodingProvider,
  type ProviderInfo,
  type ReverseGeocodeResult,
} from '../types';

/** Google's quota is generous, but pacing still avoids burst-rate rejections. */
const throttle = createThrottle(env.geocodingMinIntervalMs);

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
    const url = this.endpoint();
    url.searchParams.set('address', query);

    const first = (await withRetry(() => throttle(() => this.request(url))))[0];
    if (!first) return null;
    const component = componentReader(first);

    return {
      label: first.formatted_address,
      lat: first.geometry.location.lat,
      lon: first.geometry.location.lng,
      city: component('locality') ?? component('postal_town'),
      postalCode: component('postal_code'),
      region: component('administrative_area_level_1'),
      countryCode: componentReader(first, 'short')('country'),
      importance: null,
    };
  }

  async reverse(lat: number, lon: number): Promise<ReverseGeocodeResult | null> {
    const url = this.endpoint();
    url.searchParams.set('latlng', `${lat},${lon}`);
    url.searchParams.set('result_type', 'street_address');

    const first = (await withRetry(() => throttle(() => this.request(url))))[0];
    if (!first) return null;
    const component = componentReader(first);

    return {
      street: component('route'),
      houseNumber: component('street_number'),
      postalCode: component('postal_code'),
      city: component('locality') ?? component('postal_town'),
      region: component('administrative_area_level_1'),
      countryCode: componentReader(first, 'short')('country'),
    };
  }

  private endpoint(): URL {
    if (!this.apiKey) {
      throw new ProviderError('google', 'GOOGLE_MAPS_API_KEY is not configured.');
    }
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('key', this.apiKey);
    return url;
  }

  private async request(url: URL): Promise<GoogleGeocodeResponse['results']> {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(env.fetchTimeoutMs) });
    } catch (cause) {
      throw new ProviderError('google', 'Geocoding request failed.', { cause, retryable: true });
    }
    if (response.status === 429) {
      throw new ProviderError('google', 'Geocoding rate limit reached.', {
        retryable: true,
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      });
    }
    if (!response.ok) {
      throw new ProviderError('google', `Geocoding returned HTTP ${response.status}.`, {
        retryable: response.status >= 500,
      });
    }

    const data = (await response.json()) as GoogleGeocodeResponse;
    if (data.status === 'ZERO_RESULTS') return [];
    // Google signals throttling in the body, not the status line.
    if (data.status === 'OVER_QUERY_LIMIT') {
      throw new ProviderError('google', 'Geocoding quota exceeded.', { retryable: true });
    }
    if (data.status !== 'OK') {
      throw new ProviderError('google', `Geocoding error: ${data.status} ${data.error_message ?? ''}`.trim());
    }
    return data.results;
  }
}

function componentReader(result: GoogleGeocodeResponse['results'][number], form: 'long' | 'short' = 'long') {
  return (type: string): string | null => {
    const found = result.address_components.find((c) => c.types.includes(type));
    if (!found) return null;
    return (form === 'short' ? found.short_name : found.long_name) || null;
  };
}
