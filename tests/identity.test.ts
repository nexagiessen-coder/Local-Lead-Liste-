import { describe, it, expect } from 'vitest';
import { buildIdentity } from '@/lib/identity/identity';
import { matchExistingBusiness, type MatchCandidate } from '@/lib/identity/dedupe';
import type { RawBusinessCandidate } from '@/lib/providers/types';

function raw(overrides: Partial<RawBusinessCandidate> = {}): RawBusinessCandidate {
  return {
    provider: 'test',
    externalId: 'test/1',
    sourceUrl: null,
    name: 'Barbier am Seltersweg',
    category: 'barber',
    categoryLabel: 'Barber',
    street: 'Seltersweg',
    houseNumber: '12',
    postalCode: '35390',
    city: 'Gießen',
    region: 'Hessen',
    countryCode: 'DE',
    lat: 50.5872,
    lon: 8.6748,
    phone: '+49 641 1234501',
    email: null,
    website: null,
    socialUrls: [],
    openingHours: null,
    openingHoursRaw: null,
    raw: {},
    isDemoData: true,
    ...overrides,
  };
}

describe('identity resolution', () => {
  it('confirms an identity with a phone number and a full address', () => {
    const identity = buildIdentity(raw());
    expect(identity.status).toBe('CONFIRMED');
    expect(identity.confidence).toBeGreaterThanOrEqual(70);
    expect(identity.phoneE164).toBe('+496411234501');
  });

  it('only reaches "probable" without a phone number', () => {
    const identity = buildIdentity(raw({ phone: null }));
    expect(identity.status).toBe('PROBABLE');
    expect(identity.phoneE164).toBeNull();
  });

  it('leaves an identity unverified when there is little more than a name', () => {
    const identity = buildIdentity(
      raw({ phone: null, street: null, houseNumber: null, postalCode: null, lat: null, lon: null, category: null, categoryLabel: null }),
    );
    expect(identity.status).toBe('UNVERIFIED');
  });

  it('forces review when sources conflict', () => {
    const identity = buildIdentity(raw(), { conflicts: ['Phone numbers differ between sources.'] });
    expect(identity.status).toBe('NEEDS_REVIEW');
  });

  it('normalises German street and city names into stable keys', () => {
    const a = buildIdentity(raw({ street: 'Bahnhofstraße', houseNumber: '44', postalCode: '35390' }));
    const b = buildIdentity(raw({ street: 'Bahnhofstr.', houseNumber: '44', postalCode: '35390' }));
    expect(a.dedupeKeyAddress).toBe(b.dedupeKeyAddress);
  });

  it('produces no address key from an incomplete address', () => {
    const identity = buildIdentity(raw({ postalCode: null }));
    expect(identity.dedupeKeyAddress).toBeNull();
  });

  it('records which signals were present', () => {
    const identity = buildIdentity(raw({ phone: null }));
    const phoneSignal = identity.signals.find((s) => s.key === 'phone');
    expect(phoneSignal?.present).toBe(false);
    expect(phoneSignal?.strength).toBe('strong');
  });
});

describe('deduplication', () => {
  const base: MatchCandidate = {
    id: 'biz_1',
    name: 'Barbier am Seltersweg',
    phoneE164: '+496411234501',
    dedupeKeyAddress: 'de|35390|seltersweg|12',
    postalCode: '35390',
    city: 'Gießen',
    lat: 50.5872,
    lon: 8.6748,
  };

  it('matches the same business reported with a legal suffix', () => {
    const identity = buildIdentity(raw({ name: 'Barbier am Seltersweg GmbH' }));
    const result = matchExistingBusiness(identity, [base]);
    expect(result.kind).toBe('same');
    expect(result.businessId).toBe('biz_1');
  });

  it('keeps a same-name business in another city separate', () => {
    const identity = buildIdentity(
      raw({ name: 'Friseur Müller', city: 'Wetzlar', postalCode: '35576', street: 'Bahnhofstraße', houseNumber: '2', phone: '+49 6441 1234506', lat: 50.5538, lon: 8.5029 }),
    );
    const other: MatchCandidate = {
      ...base,
      id: 'biz_2',
      name: 'Friseur Müller',
      phoneE164: '+496411234505',
      dedupeKeyAddress: 'de|35394|gruenberger str|5',
      postalCode: '35394',
      lat: 50.5903,
      lon: 8.7011,
    };
    const result = matchExistingBusiness(identity, [other]);
    expect(result.kind).toBe('branch');
    expect(result.reason).toMatch(/separate location/i);
  });

  it('does not merge different businesses at the same address', () => {
    const identity = buildIdentity(raw({ name: 'Pizzeria Roma', phone: '+49 641 9999999' }));
    const result = matchExistingBusiness(identity, [base]);
    expect(result.kind).toBe('none');
  });

  it('flags a shared phone number with unrelated names for review', () => {
    const identity = buildIdentity(raw({ name: 'Steuerkanzlei Weber', street: 'Marktplatz', houseNumber: '1', postalCode: '35390' }));
    const result = matchExistingBusiness(identity, [base]);
    expect(result.kind).toBe('review');
  });

  it('matches by address when the phone number is missing', () => {
    const identity = buildIdentity(raw({ name: 'Barbier Seltersweg', phone: null }));
    const result = matchExistingBusiness(identity, [{ ...base, phoneE164: null }]);
    expect(result.kind).toBe('same');
  });

  it('returns no match when nothing is comparable', () => {
    const identity = buildIdentity(raw({ name: 'Autohaus Nord', phone: '+49 641 7777777', postalCode: '35398', street: 'Nordanlage', houseNumber: '9', lat: 50.6, lon: 8.7 }));
    expect(matchExistingBusiness(identity, [base]).kind).toBe('none');
  });

  it('returns no match against an empty candidate list', () => {
    expect(matchExistingBusiness(buildIdentity(raw()), []).kind).toBe('none');
  });
});
