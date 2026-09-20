import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { env } from '@/lib/env';
import { ProviderError, type FetchedPage, type HttpFetcher, type ProviderInfo } from '../types';

const MAX_REDIRECTS = 5;

/** RFC1918 / loopback / link-local / unique-local ranges. */
function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80') ||
      lower.startsWith('::ffff:127.') ||
      lower.startsWith('::ffff:10.') ||
      lower.startsWith('::ffff:192.168.')
    );
  }
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

/**
 * SSRF guard: a candidate URL must resolve to a public address. Candidate URLs
 * come from search results and business profiles, i.e. from outside the trust
 * boundary, so they are treated as hostile input.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new ProviderError('http', `Refusing to fetch a private address (${hostname}).`);
    }
    return;
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.internal')) {
    throw new ProviderError('http', `Refusing to fetch an internal hostname (${hostname}).`);
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch (cause) {
    throw new ProviderError('http', `DNS lookup failed for ${hostname}.`, { cause, retryable: true });
  }
  if (addresses.length === 0) {
    throw new ProviderError('http', `No DNS records for ${hostname}.`, { retryable: true });
  }
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new ProviderError('http', `${hostname} resolves to a private address.`);
  }
}

/**
 * Fetches a candidate website page.
 *
 * - follows redirects manually so the chain can be recorded as evidence
 * - caps body size and time
 * - sends no cookies or credentials
 * - only accepts http(s)
 */
export class SafeHttpFetcher implements HttpFetcher {
  readonly info: ProviderInfo = {
    id: 'http',
    label: 'Website fetcher',
    attribution: null,
    isAvailable: true,
    unavailableReason: null,
  };

  constructor(
    private readonly timeoutMs = env.fetchTimeoutMs,
    private readonly maxBytes = env.fetchMaxBytes,
  ) {}

  async fetchPage(url: string): Promise<FetchedPage> {
    const requestedUrl = url;
    const redirects: string[] = [];
    let current = url;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let parsed: URL;
      try {
        parsed = new URL(current);
      } catch {
        throw new ProviderError('http', `Invalid URL: ${current}`);
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new ProviderError('http', `Unsupported protocol: ${parsed.protocol}`);
      }
      await assertPublicHost(parsed.hostname);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await fetch(parsed.toString(), {
          redirect: 'manual',
          signal: controller.signal,
          credentials: 'omit',
          headers: {
            'User-Agent': env.osmUserAgent,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'de,en;q=0.8',
          },
        });
      } catch (cause) {
        clearTimeout(timer);
        const aborted = cause instanceof Error && cause.name === 'AbortError';
        throw new ProviderError('http', aborted ? `Timed out after ${this.timeoutMs}ms` : `Request failed for ${parsed.hostname}`, {
          cause,
          retryable: true,
        });
      }
      clearTimeout(timer);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return finish(requestedUrl, parsed.toString(), response, '', redirects);
        }
        const next = new URL(location, parsed).toString();
        redirects.push(next);
        current = next;
        continue;
      }

      const body = await readCapped(response, this.maxBytes);
      return finish(requestedUrl, parsed.toString(), response, body, redirects);
    }

    throw new ProviderError('http', `Too many redirects (${MAX_REDIRECTS}) starting at ${requestedUrl}.`);
  }
}

function finish(
  requestedUrl: string,
  finalUrl: string,
  response: Response,
  body: string,
  redirects: string[],
): FetchedPage {
  return {
    requestedUrl,
    finalUrl,
    status: response.status,
    contentType: response.headers.get('content-type'),
    body,
    redirects,
    fetchedAt: Date.now(),
  };
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  await reader.cancel().catch(() => undefined);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk.subarray(0, Math.min(chunk.byteLength, total - offset)), offset);
    offset += chunk.byteLength;
    if (offset >= total) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}
