import { describe, it, expect } from 'vitest';
import { createThrottle, withRetry, parseRetryAfter } from '@/lib/providers/throttle';
import { ProviderError, type GeocodingProvider, type RawBusinessCandidate } from '@/lib/providers/types';
import { enrichCandidateAddress } from '@/lib/identity/enrich';
import { buildIdentity } from '@/lib/identity/identity';
import { testDb } from './helpers';

function candidate(overrides: Partial<RawBusinessCandidate> = {}): RawBusinessCandidate {
  return {
    provider: 'test',
    externalId: 'test/1',
    sourceUrl: null,
    name: 'Rasierklinge Barbier',
    category: 'barber',
    categoryLabel: 'Barber',
    street: null,
    houseNumber: null,
    postalCode: null,
    city: null,
    region: null,
    countryCode: 'DE',
    lat: 50.5866,
    lon: 8.6742,
    phone: '+49 641 1234518',
    email: null,
    website: null,
    socialUrls: [],
    openingHours: null,
    openingHoursRaw: null,
    raw: {},
    isDemoData: false,
    ...overrides,
  };
}

class StubGeocoder implements GeocodingProvider {
  reverseCalls = 0;
  readonly info = { id: 'stub', label: 'Stub', attribution: null, isAvailable: true, unavailableReason: null };
  constructor(private readonly behaviour: 'ok' | 'throws' | 'empty' = 'ok') {}
  async geocode() {
    return null;
  }
  async reverse() {
    this.reverseCalls += 1;
    if (this.behaviour === 'throws') throw new ProviderError('stub', 'rate limited', { retryable: true });
    if (this.behaviour === 'empty') return null;
    return {
      street: 'Westanlage',
      houseNumber: '18',
      postalCode: '35390',
      city: 'Gießen',
      region: 'Hessen',
      countryCode: 'DE',
    };
  }
}

describe('request pacing', () => {
  it('keeps a minimum gap between calls', async () => {
    const throttle = createThrottle(80);
    const startedAt: number[] = [];
    await Promise.all([0, 1, 2].map(() => throttle(async () => void startedAt.push(Date.now()))));

    startedAt.sort((a, b) => a - b);
    expect(startedAt[1]! - startedAt[0]!).toBeGreaterThanOrEqual(70);
    expect(startedAt[2]! - startedAt[1]!).toBeGreaterThanOrEqual(70);
  });

  it('keeps running after a task throws', async () => {
    const throttle = createThrottle(10);
    await expect(throttle(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(throttle(async () => 'still works')).resolves.toBe('still works');
  });
});

describe('retrying provider calls', () => {
  it('retries a retryable failure and then succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new ProviderError('brave', 'rate limited', { retryable: true });
        return 'ok';
      },
      { baseDelayMs: 1 },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('gives up immediately on a non-retryable failure', async () => {
    let attempts = 0;
    await expect(
      withRetry(async () => {
        attempts += 1;
        throw new ProviderError('brave', 'bad api key');
      }, { baseDelayMs: 1 }),
    ).rejects.toThrow('bad api key');
    expect(attempts).toBe(1);
  });

  it('reads a Retry-After header in seconds and as a date', () => {
    expect(parseRetryAfter('2')).toBe(2000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('not-a-date')).toBeNull();
  });
});

describe('address enrichment', () => {
  it('lifts a callable, located business without an address to confirmed identity', async () => {
    const { db } = await testDb();
    const raw = candidate();

    // Without an address this business is callable and precisely located, yet
    // scores too low to ever be reported as "no website".
    const before = buildIdentity(raw, { defaultCountry: 'DE' });
    expect(before.status).not.toBe('CONFIRMED');

    const { candidate: enriched, addressFromReverseGeocode } = await enrichCandidateAddress(
      raw,
      new StubGeocoder(),
      db,
    );
    const after = buildIdentity(enriched, { defaultCountry: 'DE', addressFromReverseGeocode });

    expect(addressFromReverseGeocode).toBe(true);
    expect(after.city).toBe('Gießen');
    expect(after.status).toBe('CONFIRMED');
  });

  it('never scores a map-derived address as a complete street address', async () => {
    const { db } = await testDb();
    const { candidate: enriched, addressFromReverseGeocode } = await enrichCandidateAddress(
      candidate(),
      new StubGeocoder(),
      db,
    );
    const identity = buildIdentity(enriched, { defaultCountry: 'DE', addressFromReverseGeocode });
    const addressSignal = identity.signals.find((s) => s.key === 'address');

    expect(addressSignal?.strength).toBe('medium');
    expect(addressSignal?.label).toMatch(/read from map coordinates/i);
    // Same data claimed by the source itself would outscore it.
    const asserted = buildIdentity(enriched, { defaultCountry: 'DE' });
    expect(asserted.confidence).toBeGreaterThan(identity.confidence);
  });

  it('leaves the business untouched when the geocoder cannot answer', async () => {
    const { db } = await testDb();
    const geocoder = new StubGeocoder('throws');
    const { candidate: result, addressFromReverseGeocode } = await enrichCandidateAddress(
      candidate(),
      geocoder,
      db,
    );

    expect(addressFromReverseGeocode).toBe(false);
    expect(result.city).toBeNull();
    expect(buildIdentity(result, { defaultCountry: 'DE' }).status).not.toBe('CONFIRMED');
  });

  it('skips businesses that already have an address, or cannot be called', async () => {
    const { db } = await testDb();

    const withAddress = new StubGeocoder();
    await enrichCandidateAddress(candidate({ city: 'Gießen', street: 'Westanlage' }), withAddress, db);
    expect(withAddress.reverseCalls).toBe(0);

    const noPhone = new StubGeocoder();
    await enrichCandidateAddress(candidate({ phone: null }), noPhone, db);
    expect(noPhone.reverseCalls).toBe(0);
  });

  it('reuses a cached lookup instead of calling the geocoder again', async () => {
    const { db } = await testDb();
    const geocoder = new StubGeocoder();

    await enrichCandidateAddress(candidate(), geocoder, db);
    await enrichCandidateAddress(candidate({ externalId: 'test/2' }), geocoder, db);

    expect(geocoder.reverseCalls).toBe(1);
  });
});
