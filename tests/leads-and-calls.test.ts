import { describe, it, expect } from 'vitest';
import { runResearch } from '@/lib/discovery/pipeline';
import {
  assignLead,
  callingQueue,
  countBusinessRows,
  leadCounts,
  listBusinessRows,
  promoteToLead,
  updateLeadStatus,
} from '@/lib/repo/leads';
import { callHistory, recordCallOutcome, startCall } from '@/lib/repo/calls';
import { excludeBusiness } from '@/lib/repo/businesses';
import { run } from '@/lib/db';
import { testDb, testProviders } from './helpers';

async function seedPool() {
  const { db, userId } = await testDb();
  await runResearch(
    { locationQuery: 'Gießen', radiusKm: 30, category: 'barber', desiredCount: 20, onlyNew: true, userId },
    testProviders(),
    db,
  );
  return { db, userId };
}

describe('lead list', () => {
  it('filters by website status', async () => {
    const { db } = await seedPool();
    const verified = await listBusinessRows({ scope: 'pool', websiteStatus: ['VERIFIED_NO_WEBSITE'] }, db);
    expect(verified.length).toBeGreaterThan(0);
    expect(verified.every((r) => r.business.websiteStatus === 'VERIFIED_NO_WEBSITE')).toBe(true);
  });

  it('searches across name, city and phone', async () => {
    const { db } = await seedPool();
    expect(await listBusinessRows({ scope: 'pool', search: 'melek' }, db)).toHaveLength(1);
    expect(await listBusinessRows({ scope: 'pool', search: 'wetzlar' }, db)).toHaveLength(1);
    expect(await listBusinessRows({ scope: 'pool', search: '1234502' }, db)).toHaveLength(1);
  });

  it('sorts by the requested column and direction', async () => {
    const { db } = await seedPool();
    const ascRows = await listBusinessRows({ scope: 'pool', sort: 'name', direction: 'asc' }, db);
    const descRows = await listBusinessRows({ scope: 'pool', sort: 'name', direction: 'desc' }, db);
    const asc = ascRows.map((r) => r.business.name);
    const desc = descRows.map((r) => r.business.name);
    expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b)));
    expect(desc[0]).toBe(asc[asc.length - 1]);
  });

  it('paginates without losing rows', async () => {
    const { db } = await seedPool();
    const total = await countBusinessRows({ scope: 'pool' }, db);
    const firstPage = await listBusinessRows({ scope: 'pool', limit: 2, offset: 0 }, db);
    const secondPage = await listBusinessRows({ scope: 'pool', limit: 2, offset: 2 }, db);
    expect(firstPage).toHaveLength(2);
    expect(total).toBeGreaterThan(2);
    expect(firstPage[0]!.business.id).not.toBe(secondPage[0]?.business.id);
  });

  it('hides excluded businesses unless asked for', async () => {
    const { db, userId } = await seedPool();
    const target = (await listBusinessRows({ scope: 'pool' }, db))[0]!;
    await excludeBusiness(target.business.id, userId, 'Out of area.', db);

    expect((await listBusinessRows({ scope: 'pool' }, db)).some((r) => r.business.id === target.business.id)).toBe(
      false,
    );
    expect(
      (await listBusinessRows({ scope: 'pool', includeExcluded: true }, db)).some(
        (r) => r.business.id === target.business.id,
      ),
    ).toBe(true);
  });

  it('counts qualifying and manual-check businesses for the dashboard', async () => {
    const { db } = await seedPool();
    const counts = await leadCounts(db);
    expect(counts.researched).toBeGreaterThan(0);
    expect(counts.qualified).toBeGreaterThan(0);
    expect(counts.manualCheck).toBeGreaterThan(0);
    expect(counts.leads).toBe(0);
  });
});

describe('calling', () => {
  async function seedLead() {
    const { db, userId } = await seedPool();
    const qualified = (await listBusinessRows({ scope: 'pool', qualifiedOnly: true }, db))[0]!;
    const lead = await promoteToLead(qualified.business.id, userId, {}, db);
    return { db, userId, lead, business: qualified.business };
  }

  it('records a call without removing the lead', async () => {
    const { db, userId, lead, business } = await seedLead();
    await startCall({ leadId: lead.id, businessId: business.id, userId, phoneE164: business.phoneE164 }, db);

    const rows = await listBusinessRows({ scope: 'leads' }, db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lead?.callCount).toBe(1);
    expect(rows[0]!.lead?.lastCallAt).not.toBeNull();
  });

  it('increments the counter on every attempt', async () => {
    const { db, userId, lead, business } = await seedLead();
    await startCall({ leadId: lead.id, businessId: business.id, userId, phoneE164: business.phoneE164 }, db);
    await startCall({ leadId: lead.id, businessId: business.id, userId, phoneE164: business.phoneE164 }, db);
    expect((await listBusinessRows({ scope: 'leads' }, db))[0]!.lead?.callCount).toBe(2);
    expect(await callHistory(business.id, db)).toHaveLength(2);
  });

  it('stores the outcome, note and callback date', async () => {
    const { db, userId, lead, business } = await seedLead();
    const call = await startCall(
      { leadId: lead.id, businessId: business.id, userId, phoneE164: business.phoneE164 },
      db,
    );
    const callbackAt = Date.now() + 86_400_000;
    await recordCallOutcome(
      { callId: call.id, outcome: 'callback', note: 'Ask for the owner.', callbackAt, durationSeconds: 45 },
      db,
    );

    const history = await callHistory(business.id, db);
    expect(history[0]).toMatchObject({ outcome: 'callback', note: 'Ask for the owner.', durationSeconds: 45 });
    expect((await listBusinessRows({ scope: 'leads' }, db))[0]!.lead?.nextCallbackAt).toBe(callbackAt);
  });

  it('keeps a future callback out of the queue until it is due', async () => {
    const { db, userId, lead, business } = await seedLead();
    const call = await startCall(
      { leadId: lead.id, businessId: business.id, userId, phoneE164: business.phoneE164 },
      db,
    );
    await recordCallOutcome(
      { callId: call.id, outcome: 'callback', note: null, callbackAt: Date.now() + 86_400_000, durationSeconds: null },
      db,
    );
    expect((await callingQueue(userId, 50, db)).some((r) => r.lead?.id === lead.id)).toBe(false);
  });

  it('puts a due callback at the front of the queue', async () => {
    const { db, userId } = await seedPool();
    const qualified = await listBusinessRows({ scope: 'pool', qualifiedOnly: true }, db);
    expect(qualified.length).toBeGreaterThanOrEqual(2);
    const first = await promoteToLead(qualified[0]!.business.id, userId, {}, db);
    const second = await promoteToLead(qualified[1]!.business.id, userId, {}, db);

    const call = await startCall(
      { leadId: second.id, businessId: qualified[1]!.business.id, userId, phoneE164: qualified[1]!.business.phoneE164 },
      db,
    );
    await recordCallOutcome(
      { callId: call.id, outcome: 'callback', note: null, callbackAt: Date.now() - 1000, durationSeconds: null },
      db,
    );

    const queue = await callingQueue(userId, 50, db);
    expect(queue[0]!.lead?.id).toBe(second.id);
    expect(queue.some((r) => r.lead?.id === first.id)).toBe(true);
  });

  it('drops leads with a terminal status from the queue but keeps them in the list', async () => {
    const { db, userId, lead } = await seedLead();
    await updateLeadStatus(lead.id, 'not_interested', userId, 'Not a fit.', db);

    expect((await callingQueue(userId, 50, db)).some((r) => r.lead?.id === lead.id)).toBe(false);
    expect(await listBusinessRows({ scope: 'leads' }, db)).toHaveLength(1);
  });

  it('prefers the caller’s own leads over other people’s', async () => {
    const { db, userId } = await seedPool();
    const qualified = await listBusinessRows({ scope: 'pool', qualifiedOnly: true }, db);
    const mine = await promoteToLead(qualified[0]!.business.id, userId, {}, db);
    const theirs = await promoteToLead(qualified[1]!.business.id, userId, {}, db);

    const now = Date.now();
    await run(
      db,
      `INSERT INTO users (id, email, name, role, password_hash, password_salt, is_active, created_at, updated_at)
       VALUES ('usr_other','other@example.com','Other User','member','x','y',1,$1,$2)`,
      [now, now],
    );
    await assignLead(mine.id, userId, db);
    await assignLead(theirs.id, 'usr_other', db);

    const queue = await callingQueue(userId, 50, db);
    expect(queue[0]!.lead?.id).toBe(mine.id);
  });

  it('records who made each call', async () => {
    const { db, userId, lead, business } = await seedLead();
    await startCall({ leadId: lead.id, businessId: business.id, userId, phoneE164: business.phoneE164 }, db);
    expect((await callHistory(business.id, db))[0]?.userName).toBe('Test User');
  });
});
