import { ProviderError, type ProviderInfo, type WebSearchProvider, type WebSearchResult } from '../types';

/**
 * The explicit "no search provider configured" implementation.
 *
 * It throws rather than returning an empty list. That distinction matters: an
 * empty list would look like "searched, found nothing", which the verification
 * engine may use as evidence of absence. Throwing marks the channel as
 * unavailable, which forces REQUIRES_MANUAL_CHECK instead.
 */
export class NoWebSearchProvider implements WebSearchProvider {
  readonly info: ProviderInfo = {
    id: 'none',
    label: 'No web search provider',
    attribution: null,
    isAvailable: false,
    unavailableReason:
      'No web search provider is configured. Set WEB_SEARCH_PROVIDER (and its API key) to enable ' +
      'search-based website discovery. Without it, businesses cannot be confirmed as having no website.',
  };

  async search(_query: string, _limit: number): Promise<WebSearchResult[]> {
    throw new ProviderError('none', this.info.unavailableReason ?? 'Web search is not configured.');
  }
}
