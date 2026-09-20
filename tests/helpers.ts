import { FixtureDiscoveryProvider } from '@/lib/providers/discovery/fixture';
import { FixtureWebSearchProvider } from '@/lib/providers/search/fixture';
import { FixtureHttpFetcher } from '@/lib/providers/http/fixture';
import { buildIdentity } from '@/lib/identity/identity';
import type { RawBusinessCandidate } from '@/lib/providers/types';
import type { ResolvedIdentity } from '@/lib/identity/identity';

/** All demo businesses as raw provider candidates. */
export async function loadFixtureCandidates(): Promise<RawBusinessCandidate[]> {
  const provider = new FixtureDiscoveryProvider();
  return provider.search({
    center: { lat: 50.35, lon: 8.68 },
    radiusKm: 100,
    category: null,
    limit: 100,
  });
}

export async function fixtureByExternalId(externalId: string): Promise<RawBusinessCandidate> {
  const all = await loadFixtureCandidates();
  const found = all.find((c) => c.externalId === externalId);
  if (!found) throw new Error(`Fixture ${externalId} not found`);
  return found;
}

export async function identityFor(externalId: string): Promise<{
  raw: RawBusinessCandidate;
  identity: ResolvedIdentity;
}> {
  const raw = await fixtureByExternalId(externalId);
  return { raw, identity: buildIdentity(raw, { defaultCountry: 'DE' }) };
}

export function fixtureProviders() {
  return {
    search: new FixtureWebSearchProvider(),
    fetcher: new FixtureHttpFetcher(),
  };
}

import type { Database } from 'better-sqlite3';
import { createInMemoryDb } from '@/lib/db';
import { FixtureGeocodingProvider } from '@/lib/providers/geocoding/fixture';
import { NoPhotoProvider } from '@/lib/providers/photos/google-places';
import type { ProviderSet } from '@/lib/providers/registry';

/** A migrated in-memory database with one test user. */
export function testDb(): { db: Database; userId: string } {
  const db = createInMemoryDb();
  const userId = 'usr_test';
  const now = Date.now();
  db.prepare(
    `INSERT INTO users (id, email, name, role, password_hash, password_salt, is_active, created_at, updated_at)
     VALUES (?,?,?,?,?,?,1,?,?)`,
  ).run(userId, 'test@example.com', 'Test User', 'admin', 'x', 'y', now, now);
  return { db, userId };
}

export function testProviders(): ProviderSet {
  return {
    geocoding: new FixtureGeocodingProvider(),
    discovery: new FixtureDiscoveryProvider(),
    search: new FixtureWebSearchProvider(),
    fetcher: new FixtureHttpFetcher(),
    photos: new NoPhotoProvider(),
  };
}
