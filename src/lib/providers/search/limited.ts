import { getDb, type Db } from '@/lib/db';
import { consumeMonthlyUsage } from '@/lib/repo/provider-usage';
import { ProviderError, type ProviderInfo, type WebSearchProvider, type WebSearchResult } from '../types';

/**
 * Wraps a `WebSearchProvider` with a hard monthly cap, tracked in the
 * database so it holds across restarts — not just for the life of one
 * process — and stays correct even if the app ever runs as more than one
 * instance.
 *
 * Once the cap is hit for the current calendar month, every call throws
 * `ProviderError` instead of reaching the real provider: the search channel
 * becomes "unavailable" for the rest of the month exactly the way it already
 * does when unconfigured, which the verification engine already treats
 * safely (businesses fall back to "requires manual check", never a false
 * "no website"). The wrapped provider's own quota is never touched for the
 * request that trips the cap.
 */
export class LimitedWebSearchProvider implements WebSearchProvider {
  readonly info: ProviderInfo;

  constructor(
    private readonly inner: WebSearchProvider,
    private readonly limit: number,
    private readonly db: Db = getDb(),
  ) {
    this.info = inner.info;
  }

  async search(query: string, limit: number): Promise<WebSearchResult[]> {
    const usage = await consumeMonthlyUsage(this.info.id, this.limit, this.db);
    if (!usage.allowed) {
      throw new ProviderError(
        this.info.id,
        `Monthly search limit reached (${usage.limit}/month, set via WEB_SEARCH_MONTHLY_LIMIT). Resets next calendar month.`,
      );
    }
    return this.inner.search(query, limit);
  }
}
