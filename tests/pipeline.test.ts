import { describe, it, expect } from 'vitest';
import { runResearch } from '@/lib/discovery/pipeline';
import { listBusinessRows, promoteToLead, QualificationBlockedError } from '@/lib/repo/leads';
import { getLatestVerification } from '@/lib/repo/verifications';
import { testDb, testProviders } from './helpers';

const BASE = {
  radiusKm: 15,
  category: null as string | null,
  desiredCount: 20,
  onlyNew: true,
};

describe('research pipeline', () => {
  it('discovers, verifies and pools businesses without creating leads', async () => {
    const { db, userId } = testDb();
    const outcome = await runResearch(
      { ...BASE, locationQuery: 'Gießen', category: 'barber', userId },
      testProviders(),
      db,
    );

    expect(outcome.status).toBe('completed');
    expect(outcome.stats.discovered).toBeGreaterThan(0);
    expect(outcome.stats.newBusinesses).toBeGreaterThan(0);
    expect(outcome.stats.verified).toBeGreaterThan(0);

    // Nothing was promoted automatically.
    const leads = listBusinessRows({ scope: 'leads' }, db);
    expect(leads).toHaveLength(0);

    const pool = listBusinessRows({ scope: 'pool' }, db);
    expect(pool.length).toBe(outcome.stats.newBusinesses + outcome.stats.needsReview);
  });

  it('deduplicates a business reported twice by the same source', async () => {
    const { db, userId } = testDb();
    // demo/1 and demo/4 are the same shop; demo/4 adds a legal suffix.
    await runResearch({ ...BASE, locationQuery: 'Gießen', category: 'barber', userId }, testProviders(), db);

    const pool = listBusinessRows({ scope: 'pool' }, db);
    const seltersweg = pool.filter((r) => r.business.name.toLowerCase().includes('seltersweg'));
    expect(seltersweg).toHaveLength(1);
  });

  it('keeps two branches with the same name as separate businesses', async () => {
    const { db, userId } = testDb();
    // Friseur Müller exists in both Gießen and Wetzlar.
    await runResearch({ ...BASE, locationQuery: 'Gießen', radiusKm: 30, category: 'barber', userId }, testProviders(), db);

    const pool = listBusinessRows({ scope: 'pool' }, db);
    const mueller = pool.filter((r) => r.business.name.includes('Müller'));
    expect(mueller).toHaveLength(2);
    expect(new Set(mueller.map((m) => m.business.city)).size).toBe(2);
  });

  it('does not re-create businesses on a second run', async () => {
    const { db, userId } = testDb();
    const providers = testProviders();
    const first = await runResearch({ ...BASE, locationQuery: 'Gießen', category: 'barber', userId }, providers, db);
    const second = await runResearch({ ...BASE, locationQuery: 'Gießen', category: 'barber', userId }, providers, db);

    expect(first.stats.newBusinesses).toBeGreaterThan(0);
    expect(second.stats.newBusinesses).toBe(0);
    expect(second.stats.refreshed).toBeGreaterThan(0);
  });

  it('stores an evidence trail for every verified business', async () => {
    const { db, userId } = testDb();
    await runResearch({ ...BASE, locationQuery: 'Gießen', category: 'barber', userId }, testProviders(), db);

    const pool = listBusinessRows({ scope: 'pool' }, db);
    for (const row of pool) {
      if (row.business.websiteStatus === 'NOT_CHECKED') continue;
      const verification = getLatestVerification(row.business.id, db);
      expect(verification, `missing verification for ${row.business.name}`).not.toBeNull();
      expect(verification!.evidence.length).toBeGreaterThan(0);
    }
  });
});

describe('qualification gate', () => {
  it('refuses to promote a business that is not verified as having no website', async () => {
    const { db, userId } = testDb();
    await runResearch({ ...BASE, locationQuery: 'Gießen', category: 'restaurant', userId }, testProviders(), db);

    const pool = listBusinessRows({ scope: 'pool' }, db);
    const withWebsite = pool.find((r) => r.business.websiteStatus === 'VERIFIED_WEBSITE');
    expect(withWebsite).toBeDefined();
    expect(() => promoteToLead(withWebsite!.business.id, userId, {}, db)).toThrow(QualificationBlockedError);
  });

  it('promotes a qualified business and records the status history', async () => {
    const { db, userId } = testDb();
    await runResearch({ ...BASE, locationQuery: 'Gießen', category: 'barber', userId }, testProviders(), db);

    const pool = listBusinessRows({ scope: 'pool' }, db);
    const qualified = pool.find((r) => r.qualification.qualifies);
    expect(qualified, 'expected at least one qualifying business').toBeDefined();

    const lead = promoteToLead(qualified!.business.id, userId, {}, db);
    expect(lead.status).toBe('new');

    const leads = listBusinessRows({ scope: 'leads' }, db);
    expect(leads).toHaveLength(1);
  });

  it('allows an explicit override and marks it as overridden', async () => {
    const { db, userId } = testDb();
    await runResearch({ ...BASE, locationQuery: 'Gießen', category: 'restaurant', userId }, testProviders(), db);
    const pool = listBusinessRows({ scope: 'pool' }, db);
    const blocked = pool.find((r) => !r.qualification.qualifies);
    expect(blocked).toBeDefined();

    const lead = promoteToLead(blocked!.business.id, userId, { force: true }, db);
    expect(lead.qualification).toMatchObject({ qualifies: false });
  });
});
