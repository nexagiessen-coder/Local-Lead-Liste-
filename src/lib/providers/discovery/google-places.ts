import { env } from '@/lib/env';
import { getCategory, CATEGORIES } from '@/lib/discovery/categories';
import { openingHoursFromPeriods } from '@/lib/hours/parse';
import { splitStreetLine } from '@/lib/normalize/address';
import { cleanString } from '@/lib/normalize/text';
import {
  ProviderError,
  type DiscoveryProvider,
  type DiscoveryQuery,
  type ProviderInfo,
  type RawBusinessCandidate,
} from '../types';

interface PlacesPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  regularOpeningHours?: {
    periods?: Array<{
      open?: { day?: number; hour?: number; minute?: number };
      close?: { day?: number; hour?: number; minute?: number };
    }>;
    weekdayDescriptions?: string[];
  };
  utcOffsetMinutes?: number;
  photos?: Array<{ name?: string; widthPx?: number; heightPx?: number }>;
}

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.addressComponents',
  'places.location',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.types',
  'places.regularOpeningHours',
  'places.utcOffsetMinutes',
  'places.photos',
].join(',');

/**
 * Google Places API (New) — Nearby Search.
 *
 * Requires the operator's own billing-enabled key. Results are used under the
 * Places API terms: we store the place id and the fields we display, and photos
 * are fetched on demand rather than cached.
 */
export class GooglePlacesDiscoveryProvider implements DiscoveryProvider {
  readonly info: ProviderInfo;

  constructor(private readonly apiKey = env.googleMapsApiKey) {
    this.info = {
      id: 'google-places',
      label: 'Google Places API',
      attribution: 'Business data © Google',
      isAvailable: Boolean(apiKey),
      unavailableReason: apiKey ? null : 'GOOGLE_MAPS_API_KEY is not set.',
    };
  }

  async search(query: DiscoveryQuery): Promise<RawBusinessCandidate[]> {
    if (!this.apiKey) throw new ProviderError('google-places', 'GOOGLE_MAPS_API_KEY is not configured.');

    const category = getCategory(query.category);
    const includedTypes = category ? category.googleTypes : CATEGORIES.flatMap((c) => c.googleTypes).slice(0, 50);

    // Nearby Search caps the radius at 50 km and returns at most 20 results per call.
    const radiusMeters = Math.min(50_000, Math.round(query.radiusKm * 1000));

    let response: Response;
    try {
      response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify({
          includedTypes,
          maxResultCount: Math.min(20, Math.max(1, query.limit)),
          locationRestriction: {
            circle: {
              center: { latitude: query.center.lat, longitude: query.center.lon },
              radius: radiusMeters,
            },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (cause) {
      throw new ProviderError('google-places', 'Places request failed.', { cause, retryable: true });
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ProviderError('google-places', `Places returned HTTP ${response.status}. ${detail.slice(0, 200)}`, {
        retryable: response.status >= 500 || response.status === 429,
      });
    }

    const data = (await response.json()) as { places?: PlacesPlace[] };
    const places = data.places ?? [];

    return places.map((place) => {
      const component = (type: string) =>
        place.addressComponents?.find((c) => c.types?.includes(type)) ?? null;
      const streetLine = component('route')?.longText ?? null;
      const houseNumber = component('street_number')?.longText ?? null;
      const split = streetLine ? { street: streetLine, houseNumber } : splitStreetLine(place.formattedAddress ?? null);

      const timezone = env.defaultTimezone;
      const hours = place.regularOpeningHours?.periods
        ? openingHoursFromPeriods(
            place.regularOpeningHours.periods,
            timezone,
            place.regularOpeningHours.weekdayDescriptions?.join('; ') ?? null,
          )
        : null;

      return {
        provider: 'google-places',
        externalId: place.id,
        sourceUrl: `https://www.google.com/maps/place/?q=place_id:${place.id}`,
        name: cleanString(place.displayName?.text ?? null) ?? '(unnamed)',
        category: query.category ?? null,
        categoryLabel: cleanString(place.primaryTypeDisplayName?.text ?? place.primaryType ?? null),
        street: cleanString(split.street),
        houseNumber: cleanString(houseNumber ?? split.houseNumber),
        postalCode: cleanString(component('postal_code')?.longText ?? null),
        city: cleanString(component('locality')?.longText ?? component('postal_town')?.longText ?? null),
        region: cleanString(component('administrative_area_level_1')?.longText ?? null),
        countryCode: cleanString(component('country')?.shortText ?? null)?.toUpperCase() ?? null,
        lat: place.location?.latitude ?? null,
        lon: place.location?.longitude ?? null,
        phone: cleanString(place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? null),
        email: null,
        website: cleanString(place.websiteUri ?? null),
        socialUrls: [],
        openingHours: hours,
        openingHoursRaw: place.regularOpeningHours?.weekdayDescriptions?.join('; ') ?? null,
        raw: place as unknown as Record<string, unknown>,
        isDemoData: false,
      } satisfies RawBusinessCandidate;
    });
  }
}
