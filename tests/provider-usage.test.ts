import { describe, it, expect } from 'vitest';
import { consumeMonthlyUsage, currentMonthlyUsage } from '@/lib/repo/provider-usage';
import { LimitedWebSearchProvider } from '@/lib/providers/search/limited';
import { ProviderError, type WebSearchProvider, type WebSearchResult } from '@/lib/providers/types';
import { testDb } from './helpers';

class StubSearchProvider implements WebSearchProvider {
  calls = 0;
  readonly info = { id: 'stub', label: 'Stub', attribution: null, isAvailable: true, unavailableReason: null };

  async search(): Promise<WebSearchResult[]> {
    this.calls += 1;
    return [{ url: 'https://example.com', title: 'Example', snippet: '' }];
  }
}

describe('provider usage cap', () => {
  it('allows calls up to the limit and blocks the next one', async () => {
    const { db } = await testDb();
    const first = await consumeMonthlyUsage('stub', 2, db);
    const second = await consumeMonthlyUsage('stub', 2, db);
    const third = await consumeMonthlyUsage('stub', 2, db);

    expect(first).toMatchObject({ allowed: true, count: 1 });
    expect(second).toMatchObject({ allowed: true, count: 2 });
    expect(third).toMatchObject({ allowed: false, count: 3 });
  });

  it('tracks usage independently per provider', async () => {
    const { db } = await testDb();
    await consumeMonthlyUsage('brave', 1, db);
    const google = await consumeMonthlyUsage('google-cse', 1, db);

    expect(google).toMatchObject({ allowed: true, count: 1 });
    expect(await currentMonthlyUsage('brave', db)).toBe(1);
    expect(await currentMonthlyUsage('google-cse', db)).toBe(1);
  });

  it('reports zero usage before any call is made', async () => {
    const { db } = await testDb();
    expect(await currentMonthlyUsage('unused', db)).toBe(0);
  });
});

describe('LimitedWebSearchProvider', () => {
  it('delegates to the wrapped provider while under the cap', async () => {
    const { db } = await testDb();
    const stub = new StubSearchProvider();
    const limited = new LimitedWebSearchProvider(stub, 2, db);

    const results = await limited.search('query', 10);
    expect(results).toHaveLength(1);
    expect(stub.calls).toBe(1);
  });

  it('stops delegating once the cap is reached, without calling the inner provider again', async () => {
    const { db } = await testDb();
    const stub = new StubSearchProvider();
    const limited = new LimitedWebSearchProvider(stub, 1, db);

    await limited.search('query', 10); // uses up the one allowed call
    expect(stub.calls).toBe(1);

    await expect(limited.search('query', 10)).rejects.toThrow(ProviderError);
    expect(stub.calls).toBe(1); // the inner provider was never reached the second time
  });

  it('keeps the wrapped provider unavailable for the rest of the month once tripped', async () => {
    const { db } = await testDb();
    const stub = new StubSearchProvider();
    const limited = new LimitedWebSearchProvider(stub, 0, db);

    await expect(limited.search('query', 10)).rejects.toThrow(/Monthly search limit reached/);
  });
});
