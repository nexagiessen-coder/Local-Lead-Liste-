import { normalizeText } from '@/lib/normalize/text';
import { FIXTURE_SEARCH_DOCS } from '../fixture-data';
import type { ProviderInfo, WebSearchProvider, WebSearchResult } from '../types';

/**
 * Offline search over the demo index.
 *
 * Scores documents by keyword overlap with the query, mimicking a real engine
 * closely enough to exercise the website-discovery channel end to end.
 */
export class FixtureWebSearchProvider implements WebSearchProvider {
  readonly info: ProviderInfo = {
    id: 'fixture-search',
    label: 'Demo search index (offline)',
    attribution: 'Demo data — not real research output',
    isAvailable: true,
    unavailableReason: null,
  };

  async search(query: string, limit: number): Promise<WebSearchResult[]> {
    const terms = new Set(normalizeText(query).split(' ').filter((t) => t.length >= 2));
    if (terms.size === 0) return [];

    const scored = FIXTURE_SEARCH_DOCS.map((doc) => {
      const hits = doc.keywords.filter((k) => terms.has(normalizeText(k))).length;
      return { doc, score: hits / Math.max(1, doc.keywords.length), hits };
    })
      // Require at least two overlapping keywords so unrelated docs are not returned.
      .filter((entry) => entry.hits >= 2)
      .sort((a, b) => b.score - a.score || b.hits - a.hits);

    return scored.slice(0, limit).map(({ doc }) => ({
      url: doc.url,
      title: doc.title,
      snippet: doc.snippet,
    }));
  }
}
