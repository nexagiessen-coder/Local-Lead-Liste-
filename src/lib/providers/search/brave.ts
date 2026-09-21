import { env } from '@/lib/env';
import { createThrottle, parseRetryAfter, withRetry } from '../throttle';
import { ProviderError, type ProviderInfo, type WebSearchProvider, type WebSearchResult } from '../types';

interface BraveResponse {
  web?: { results?: Array<{ url?: string; title?: string; description?: string }> };
}

/**
 * Brave's free tier allows one query per second. The limit is per
 * subscription, so the throttle lives at module scope and every search in
 * this process — across concurrent research runs — queues behind it.
 */
const throttle = createThrottle(env.webSearchMinIntervalMs);

/** Brave Search API — an independent index with a documented API. */
export class BraveWebSearchProvider implements WebSearchProvider {
  readonly info: ProviderInfo;

  constructor(private readonly apiKey = env.braveSearchApiKey) {
    this.info = {
      id: 'brave',
      label: 'Brave Search API',
      attribution: 'Search results via Brave Search',
      isAvailable: Boolean(apiKey),
      unavailableReason: apiKey ? null : 'BRAVE_SEARCH_API_KEY is not set.',
    };
  }

  async search(query: string, limit: number): Promise<WebSearchResult[]> {
    if (!this.apiKey) throw new ProviderError('brave', 'BRAVE_SEARCH_API_KEY is not configured.');
    return withRetry(() => throttle(() => this.searchOnce(query, limit)));
  }

  private async searchOnce(query: string, limit: number): Promise<WebSearchResult[]> {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(Math.min(20, Math.max(1, limit))));

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey! },
        signal: AbortSignal.timeout(env.fetchTimeoutMs),
      });
    } catch (cause) {
      throw new ProviderError('brave', 'Search request failed.', { cause, retryable: true });
    }
    if (response.status === 429) {
      throw new ProviderError('brave', 'Search rate limit reached.', {
        retryable: true,
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      });
    }
    if (!response.ok) {
      throw new ProviderError('brave', `Search returned HTTP ${response.status}.`, {
        retryable: response.status >= 500,
      });
    }

    const data = (await response.json()) as BraveResponse;
    return (data.web?.results ?? [])
      .filter((r): r is { url: string; title?: string; description?: string } => Boolean(r.url))
      .map((r) => ({ url: r.url, title: r.title ?? '', snippet: r.description ?? '' }));
  }
}
