import { FIXTURE_PAGES } from '../fixture-data';
import { getHostname } from '@/lib/normalize/domain';
import { ProviderError, type FetchedPage, type HttpFetcher, type ProviderInfo } from '../types';

/**
 * Fetcher over the demo "web".
 *
 * Unknown hosts raise a not-found error, which the engine reads as "this domain
 * does not host a site" — the same way a real DNS failure on a guessed domain
 * is read. Hosts explicitly marked `fails` raise a retryable error, simulating
 * a site that is temporarily down.
 */
export class FixtureHttpFetcher implements HttpFetcher {
  readonly info: ProviderInfo = {
    id: 'fixture-http',
    label: 'Demo website fetcher (offline)',
    attribution: null,
    isAvailable: true,
    unavailableReason: null,
  };

  async fetchPage(url: string): Promise<FetchedPage> {
    const redirects: string[] = [];
    let current = url;

    for (let hop = 0; hop < 5; hop++) {
      const host = getHostname(current);
      if (!host) throw new ProviderError('fixture-http', `Invalid URL: ${current}`);

      // Hosts that serve several pages (link-in-bio services) are keyed by
      // host + path; everything else is keyed by host alone.
      let path = '';
      try {
        path = new URL(current).pathname.replace(/\/+$/, '');
      } catch {
        path = '';
      }
      const page = FIXTURE_PAGES[`${host}${path}`] ?? FIXTURE_PAGES[host];
      if (!page) {
        throw new ProviderError('fixture-http', `No host found for ${host} (demo web).`, {
          retryable: false,
        });
      }
      if (page.fails) {
        throw new ProviderError('fixture-http', `${host} did not respond (demo web).`, {
          retryable: true,
        });
      }
      if (page.redirectTo) {
        redirects.push(page.redirectTo);
        current = page.redirectTo;
        continue;
      }
      return {
        requestedUrl: url,
        finalUrl: current,
        status: page.status,
        contentType: 'text/html; charset=utf-8',
        body: page.html ?? '',
        redirects,
        fetchedAt: Date.now(),
      };
    }
    throw new ProviderError('fixture-http', `Too many redirects starting at ${url}.`);
  }
}
