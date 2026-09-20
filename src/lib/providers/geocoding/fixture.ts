import type { GeocodeResult, GeocodingProvider, ProviderInfo } from '../types';
import { normalizeText } from '@/lib/normalize/text';

/**
 * Offline geocoder over a small list of German cities.
 *
 * Used for local development and tests so the app runs with no API keys. Its
 * results are flagged as demo data everywhere they surface.
 */
const CITIES: Array<Omit<GeocodeResult, 'importance'> & { aliases: string[] }> = [
  { label: 'Gießen, Hessen, Germany', lat: 50.5866, lon: 8.6742, city: 'Gießen', postalCode: '35390', region: 'Hessen', countryCode: 'DE', aliases: ['giessen', 'gieen', 'gie en'] },
  { label: 'Frankfurt am Main, Hessen, Germany', lat: 50.1109, lon: 8.6821, city: 'Frankfurt am Main', postalCode: '60311', region: 'Hessen', countryCode: 'DE', aliases: ['frankfurt', 'frankfurt am main', 'frankfurt main', 'ffm'] },
  { label: 'Wetzlar, Hessen, Germany', lat: 50.5533, lon: 8.5033, city: 'Wetzlar', postalCode: '35576', region: 'Hessen', countryCode: 'DE', aliases: ['wetzlar'] },
  { label: 'Marburg, Hessen, Germany', lat: 50.8021, lon: 8.7667, city: 'Marburg', postalCode: '35037', region: 'Hessen', countryCode: 'DE', aliases: ['marburg'] },
  { label: 'Offenbach am Main, Hessen, Germany', lat: 50.0956, lon: 8.7761, city: 'Offenbach am Main', postalCode: '63065', region: 'Hessen', countryCode: 'DE', aliases: ['offenbach'] },
  { label: 'Bad Nauheim, Hessen, Germany', lat: 50.3667, lon: 8.7333, city: 'Bad Nauheim', postalCode: '61231', region: 'Hessen', countryCode: 'DE', aliases: ['bad nauheim', 'nauheim'] },
  { label: 'Darmstadt, Hessen, Germany', lat: 49.8728, lon: 8.6512, city: 'Darmstadt', postalCode: '64283', region: 'Hessen', countryCode: 'DE', aliases: ['darmstadt'] },
  { label: 'Hanau, Hessen, Germany', lat: 50.1333, lon: 8.9167, city: 'Hanau', postalCode: '63450', region: 'Hessen', countryCode: 'DE', aliases: ['hanau'] },
];

export class FixtureGeocodingProvider implements GeocodingProvider {
  readonly info: ProviderInfo = {
    id: 'fixture',
    label: 'Demo geocoder (offline)',
    attribution: 'Demo data — not real research output',
    isAvailable: true,
    unavailableReason: null,
  };

  async geocode(query: string): Promise<GeocodeResult | null> {
    const needle = normalizeText(query);
    if (!needle) return null;
    for (const city of CITIES) {
      if (city.aliases.some((alias) => needle === alias || needle.includes(alias))) {
        const { aliases: _aliases, ...rest } = city;
        return { ...rest, importance: 0.8 };
      }
    }
    return null;
  }
}

export const FIXTURE_CITIES = CITIES;
