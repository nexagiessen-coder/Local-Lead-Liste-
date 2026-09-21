import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * env.ts reads `process.env` once at module load (it's a singleton config
 * object, not a function), so exercising different inputs means resetting
 * the module registry and re-importing between cases.
 */
const ENV_KEYS = ['DISCOVERY_PROVIDER', 'GEOCODING_PROVIDER', 'WEB_SEARCH_PROVIDER', 'PHOTO_PROVIDER'] as const;
const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) original[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  vi.resetModules();
});

describe('provider id parsing', () => {
  it('accepts the documented lowercase values', async () => {
    process.env.DISCOVERY_PROVIDER = 'overpass';
    vi.resetModules();
    const { env } = await import('@/lib/env');
    expect(env.discoveryProvider).toBe('overpass');
  });

  it('is case-insensitive, so an autocapitalized value still matches', async () => {
    // A phone/tablet keyboard, or a hosting panel's form, commonly
    // autocapitalizes the first letter of a typed value — this must not
    // silently fall back to the demo/fixture provider.
    process.env.DISCOVERY_PROVIDER = 'Overpass';
    process.env.GEOCODING_PROVIDER = 'Nominatim';
    process.env.WEB_SEARCH_PROVIDER = 'Brave';
    vi.resetModules();
    const { env } = await import('@/lib/env');

    expect(env.discoveryProvider).toBe('overpass');
    expect(env.geocodingProvider).toBe('nominatim');
    expect(env.webSearchProvider).toBe('brave');
  });

  it('falls back to the default for a genuinely unknown value', async () => {
    process.env.DISCOVERY_PROVIDER = 'not-a-real-provider';
    vi.resetModules();
    const { env } = await import('@/lib/env');
    expect(env.discoveryProvider).toBe('fixture');
  });
});
