import { env } from '@/lib/env';
import { ProviderError, type ProviderInfo, type WebSearchProvider, type WebSearchResult } from '../types';

interface CseResponse {
  items?: Array<{ link?: string; title?: string; snippet?: string }>;
  error?: { message?: string };
}

/** Google Programmable Search (Custom Search JSON API). */
export class GoogleCseWebSearchProvider implements WebSearchProvider {
  readonly info: ProviderInfo;

  constructor(
    private readonly apiKey = env.googleCseApiKey,
    private readonly engineId = env.googleCseEngineId,
  ) {
    const configured = Boolean(apiKey && engineId);
    this.info = {
      id: 'google-cse',
      label: 'Google Programmable Search',
      attribution: 'Search results © Google',
      isAvailable: configured,
      unavailableReason: configured ? null : 'GOOGLE_CSE_API_KEY and GOOGLE_CSE_ENGINE_ID must both be set.',
    };
  }

  async search(query: string, limit: number): Promise<WebSearchResult[]> {
    if (!this.apiKey || !this.engineId) {
      throw new ProviderError('google-cse', 'Google Programmable Search is not configured.');
    }
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('cx', this.engineId);
    url.searchParams.set('q', query);
    url.searchParams.set('num', String(Math.min(10, Math.max(1, limit))));

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(env.fetchTimeoutMs) });
    } catch (cause) {
      throw new ProviderError('google-cse', 'Search request failed.', { cause, retryable: true });
    }
    const data = (await response.json().catch(() => ({}))) as CseResponse;
    if (!response.ok) {
      throw new ProviderError(
        'google-cse',
        `Search returned HTTP ${response.status}. ${data.error?.message ?? ''}`.trim(),
        { retryable: response.status >= 500 || response.status === 429 },
      );
    }
    return (data.items ?? [])
      .filter((i): i is { link: string; title?: string; snippet?: string } => Boolean(i.link))
      .map((i) => ({ url: i.link, title: i.title ?? '', snippet: i.snippet ?? '' }));
  }
}
