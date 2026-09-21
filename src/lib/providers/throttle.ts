import { ProviderError } from './types';

/**
 * Outbound request pacing.
 *
 * Every external API this app uses publishes a rate limit that is far lower
 * than the speed the pipeline would otherwise call it at: Brave's free tier
 * allows one query per second, Nominatim's usage policy asks for one request
 * per second, and the public Overpass endpoint is shared infrastructure that
 * returns 429/504 under load.
 *
 * Without pacing, a research run fires hundreds of requests in seconds, nearly
 * all of them are rejected, and — because a channel that could not run must
 * never be read as "looked and found nothing" — every business ends up at
 * REQUIRES_MANUAL_CHECK. Pacing is therefore not an optimisation here; it is
 * what makes a verifiable answer possible at all.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type Throttle = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Serialises tasks and keeps at least `minIntervalMs` between the start of one
 * and the start of the next. Shared per provider at module scope, so every
 * concurrent research run in this process queues behind the same limiter —
 * a per-instance one would let two runs double the request rate.
 */
export function createThrottle(minIntervalMs: number): Throttle {
  let chain: Promise<unknown> = Promise.resolve();
  let lastStartedAt = 0;

  return function run<T>(task: () => Promise<T>): Promise<T> {
    const result = chain.then(async () => {
      const wait = lastStartedAt + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastStartedAt = Date.now();
      return task();
    });
    // The queue must survive a failing task, so swallow the rejection here;
    // the real one is still delivered to the caller through `result`.
    chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

export interface RetryOptions {
  /** Total attempts including the first. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Retries a provider call while it fails *retryably* (rate limits, timeouts,
 * 5xx). A non-retryable error — a bad key, a malformed request — is rethrown
 * immediately, because repeating it would only waste quota and time.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 8000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ProviderError && error.retryable;
      if (!retryable || attempt === attempts) throw error;

      // Exponential backoff with jitter, so several queued calls that all hit
      // the same limit don't retry in lockstep and trip it again together.
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const hinted = error instanceof ProviderError ? error.retryAfterMs : null;
      const delay = Math.max(hinted ?? 0, backoff) + Math.random() * 250;
      await sleep(delay);
    }
  }
  throw lastError;
}

/**
 * Reads a `Retry-After` header (seconds, or an HTTP date) into milliseconds.
 * Providers state here how long to wait; honouring it is both faster and more
 * polite than guessing.
 */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}
