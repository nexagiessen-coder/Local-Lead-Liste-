import { env } from '@/lib/env';
import { ProviderError, type GeocodeResult, type GeocodingProvider, type ProviderInfo } from '../types';

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  importance?: number;
  address?: Record<string, string>;
}

/**
 * OpenStreetMap Nominatim geocoder.
 *
 * Usage policy requires an identifying User-Agent and a low request rate; the
 * caller caches results (see `geocode_cache`) so each location is looked up once.
 */
export class NominatimGeocodingProvider implements GeocodingProvider {
  readonly info: ProviderInfo = {
    id: 'nominatim',
    label: 'OpenStreetMap Nominatim',
    attribution: '© OpenStreetMap contributors',
    isAvailable: true,
    unavailableReason: null,
  };

  async geocode(query: string): Promise<GeocodeResult | null> {
    const url = new URL('/search', env.nominatimEndpoint);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '1');

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': env.osmUserAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(env.fetchTimeoutMs),
      });
    } catch (cause) {
      throw new ProviderError('nominatim', 'Geocoding request failed.', { cause, retryable: true });
    }
    if (!response.ok) {
      throw new ProviderError('nominatim', `Geocoding returned HTTP ${response.status}.`, {
        retryable: response.status >= 500,
      });
    }

    const items = (await response.json()) as NominatimItem[];
    const first = items[0];
    if (!first) return null;

    const address = first.address ?? {};
    return {
      label: first.display_name,
      lat: Number(first.lat),
      lon: Number(first.lon),
      city: address.city ?? address.town ?? address.village ?? address.municipality ?? null,
      postalCode: address.postcode ?? null,
      region: address.state ?? null,
      countryCode: address.country_code ? address.country_code.toUpperCase() : null,
      importance: typeof first.importance === 'number' ? first.importance : null,
    };
  }
}
