import { getDb, one, run, type Db } from '@/lib/db';
import { ProviderError, type GeocodingProvider, type RawBusinessCandidate } from '@/lib/providers/types';

/**
 * Address enrichment.
 *
 * Discovery sources frequently locate a business precisely — coordinates and a
 * phone number — while carrying no address at all. Such a record is a perfectly
 * callable lead, but without an address its identity score stays below the
 * confirmed threshold, so it can never be reported as "no website" no matter
 * how thorough the website research was.
 *
 * Reading the address back from the coordinates closes that gap by *adding a
 * real, checkable fact* rather than by lowering the bar for what counts as
 * identified. Two deliberate limits keep it honest:
 *
 *  - It only runs for records that are callable (a phone) and locatable
 *    (coordinates) but address-less, which is also the only case where it can
 *    change an outcome — so it adds no load for businesses it cannot help.
 *  - The result is scored as a *partial* address, never a complete one, even
 *    when a house number comes back. The business record itself did not assert
 *    this address; the map did.
 */

/** ~11 m of precision: enough to distinguish premises, coarse enough to reuse. */
function cacheKey(lat: number, lon: number): string {
  return `reverse:${lat.toFixed(4)},${lon.toFixed(4)}`;
}

export interface EnrichedCandidate {
  candidate: RawBusinessCandidate;
  /** True when an address was added, so the caller can score it as partial. */
  addressFromReverseGeocode: boolean;
}

export async function enrichCandidateAddress(
  candidate: RawBusinessCandidate,
  geocoding: GeocodingProvider,
  db: Db = getDb(),
): Promise<EnrichedCandidate> {
  const unchanged: EnrichedCandidate = { candidate, addressFromReverseGeocode: false };

  const hasAddress = Boolean(candidate.street ?? candidate.postalCode ?? candidate.city);
  const locatable = typeof candidate.lat === 'number' && typeof candidate.lon === 'number';
  const callable = Boolean(candidate.phone);
  if (hasAddress || !locatable || !callable) return unchanged;

  const key = cacheKey(candidate.lat!, candidate.lon!);
  const cached = await one<{ result_json: string }>(
    db,
    'SELECT result_json FROM geocode_cache WHERE query = $1',
    [key],
  );

  let address: Awaited<ReturnType<GeocodingProvider['reverse']>>;
  if (cached) {
    address = JSON.parse(cached.result_json) as typeof address;
  } else {
    try {
      address = await geocoding.reverse(candidate.lat!, candidate.lon!);
    } catch (error) {
      // Enrichment is an optional improvement: if the geocoder cannot answer,
      // the business simply keeps the identity it already had and falls to a
      // manual check. Never guess an address to fill the gap.
      if (error instanceof ProviderError) return unchanged;
      throw error;
    }
    await run(
      db,
      `INSERT INTO geocode_cache (query, provider, result_json, created_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (query) DO UPDATE SET provider = EXCLUDED.provider, result_json = EXCLUDED.result_json,
         created_at = EXCLUDED.created_at`,
      [key, geocoding.info.id, JSON.stringify(address), Date.now()],
    );
  }

  if (!address || (!address.street && !address.postalCode && !address.city)) return unchanged;

  return {
    candidate: {
      ...candidate,
      street: candidate.street ?? address.street,
      houseNumber: candidate.houseNumber ?? address.houseNumber,
      postalCode: candidate.postalCode ?? address.postalCode,
      city: candidate.city ?? address.city,
      region: candidate.region ?? address.region,
      countryCode: candidate.countryCode ?? address.countryCode,
    },
    addressFromReverseGeocode: true,
  };
}
