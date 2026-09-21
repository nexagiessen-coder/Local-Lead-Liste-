import { newDb } from 'pg-mem';
import { ensureMigrated, run, type Db } from '@/lib/db';
import { FixtureDiscoveryProvider } from '@/lib/providers/discovery/fixture';
import { FixtureWebSearchProvider } from '@/lib/providers/search/fixture';
import { FixtureHttpFetcher } from '@/lib/providers/http/fixture';
import { FixtureGeocodingProvider } from '@/lib/providers/geocoding/fixture';
import { NoPhotoProvider } from '@/lib/providers/photos/google-places';
import { buildIdentity } from '@/lib/identity/identity';
import type { RawBusinessCandidate } from '@/lib/providers/types';
import type { ResolvedIdentity } from '@/lib/identity/identity';
import type { ProviderSet } from '@/lib/providers/registry';

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

/**
 * A freshly migrated, isolated database for one test — backed by `pg-mem`, a
 * pure-JS Postgres-compatible engine, rather than a real Postgres server.
 * Each call creates its own in-memory instance, so tests never share state
 * and don't need a running database to pass.
 */
export async function testDb(): Promise<{ db: Db; userId: string }> {
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool } = mem.adapters.createPg();
  const db = new Pool() as unknown as Db;
  await ensureMigrated(db);

  const userId = 'usr_test';
  const now = Date.now();
  await run(
    db,
    `INSERT INTO users (id, email, name, role, password_hash, password_salt, is_active, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8)`,
    [userId, 'test@example.com', 'Test User', 'admin', 'x', 'y', now, now],
  );
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
