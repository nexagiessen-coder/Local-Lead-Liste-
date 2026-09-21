import { env } from '@/lib/env';
import { cleanString } from '@/lib/normalize/text';
import { createThrottle, parseRetryAfter, withRetry } from '../throttle';
import {
  ProviderError,
  type GeocodeResult,
  type GeocodingProvider,
  type ProviderInfo,
  type ReverseGeocodeResult,
} from '../types';

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  importance?: number;
  address?: Record<string, string>;
}

/**
 * Nominatim's usage policy allows at most one request per second and asks for
 * an identifying User-Agent. Forward and reverse lookups hit the same service,
 * so they share one module-level queue.
 */
const throttle = createThrottle(env.geocodingMinIntervalMs);

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

    const items = await withRetry(() => throttle(() => this.request<NominatimItem[]>(url)));
    const first = Array.isArray(items) ? items[0] : undefined;
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

  async reverse(lat: number, lon: number): Promise<ReverseGeocodeResult | null> {
    const url = new URL('/reverse', env.nominatimEndpoint);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    // Building level: the address of the premises, not the whole street or suburb.
    url.searchParams.set('zoom', '18');

    const item = await withRetry(() => throttle(() => this.request<NominatimItem>(url)));
    const address = item?.address;
    if (!address) return null;

    return {
      street: cleanString(address.road ?? address.pedestrian ?? address.footway ?? null),
      houseNumber: cleanString(address.house_number ?? null),
      postalCode: cleanString(address.postcode ?? null),
      city: cleanString(address.city ?? address.town ?? address.village ?? address.municipality ?? null),
      region: cleanString(address.state ?? null),
      countryCode: address.country_code ? address.country_code.toUpperCase() : null,
    };
  }

  private async request<T>(url: URL): Promise<T | null> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': env.osmUserAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(env.fetchTimeoutMs),
      });
    } catch (cause) {
      throw new ProviderError('nominatim', 'Geocoding request failed.', { cause, retryable: true });
    }
    if (response.status === 429 || response.status === 503) {
      throw new ProviderError('nominatim', 'Geocoding is rate limiting. Slow down and try again.', {
        retryable: true,
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      });
    }
    if (!response.ok) {
      throw new ProviderError('nominatim', `Geocoding returned HTTP ${response.status}.`, {
        retryable: response.status >= 500,
      });
    }
    return (await response.json()) as T;
  }
}
