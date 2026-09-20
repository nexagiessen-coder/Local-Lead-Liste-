import { env } from '@/lib/env';
import { parseOpeningHours } from '@/lib/hours/parse';
import { distanceKm } from '@/lib/normalize/geo';
import { FIXTURE_BUSINESSES } from '../fixture-data';
import type {
  DiscoveryProvider,
  DiscoveryQuery,
  ProviderInfo,
  RawBusinessCandidate,
} from '../types';

/**
 * Offline discovery over the demo dataset. Every candidate is flagged as demo
 * data so it is badged in the UI and can be filtered out.
 */
export class FixtureDiscoveryProvider implements DiscoveryProvider {
  readonly info: ProviderInfo = {
    id: 'fixture',
    label: 'Demo dataset (offline)',
    attribution: 'Demo data — not real research output',
    isAvailable: true,
    unavailableReason: null,
  };

  async search(query: DiscoveryQuery): Promise<RawBusinessCandidate[]> {
    const matches = FIXTURE_BUSINESSES.filter((business) => {
      if (query.category && business.category !== query.category) return false;
      return distanceKm(query.center, { lat: business.lat, lon: business.lon }) <= query.radiusKm;
    });

    return matches.slice(0, Math.max(1, query.limit) * 3).map((business) => ({
      provider: 'fixture',
      externalId: business.externalId,
      sourceUrl: null,
      name: business.name,
      category: business.category,
      categoryLabel: business.categoryLabel,
      street: business.street,
      houseNumber: business.houseNumber,
      postalCode: business.postalCode,
      city: business.city,
      region: 'Hessen',
      countryCode: 'DE',
      lat: business.lat,
      lon: business.lon,
      phone: business.phone,
      email: business.email ?? null,
      website: business.website,
      socialUrls: business.socialUrls ?? [],
      openingHours: parseOpeningHours(business.openingHoursRaw, env.defaultTimezone),
      openingHoursRaw: business.openingHoursRaw,
      raw: { ...business },
      isDemoData: true,
    }));
  }
}
