/**
 * Central environment configuration.
 *
 * Every value is read once, validated, and exposed as typed config. Secrets are
 * never logged and never sent to the client — only `publicConfig` is safe to
 * render in a client component.
 */

function str(key: string, fallback?: string): string | undefined {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw.trim();
}

function int(key: string, fallback: number): number {
  const raw = str(key);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export type DiscoveryProviderId = 'overpass' | 'google-places' | 'fixture';
export type GeocodingProviderId = 'nominatim' | 'google' | 'fixture';
export type WebSearchProviderId = 'brave' | 'google-cse' | 'none';
export type PhotoProviderId = 'google-places' | 'none';

function oneOf<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const raw = str(key);
  if (raw && (allowed as readonly string[]).includes(raw)) return raw as T;
  return fallback;
}

export const env = {
  appUrl: str('APP_URL', 'http://localhost:3000')!,
  nodeEnv: str('NODE_ENV', 'development')!,
  databasePath: str('DATABASE_PATH', './data/local-lead-list.sqlite')!,
  sessionSecret: str('SESSION_SECRET'),

  defaultCountry: (str('DEFAULT_COUNTRY', 'DE') ?? 'DE').toUpperCase(),
  defaultTimezone: str('DEFAULT_TIMEZONE', 'Europe/Berlin')!,

  discoveryProvider: oneOf('DISCOVERY_PROVIDER', ['overpass', 'google-places', 'fixture'] as const, 'fixture'),
  geocodingProvider: oneOf('GEOCODING_PROVIDER', ['nominatim', 'google', 'fixture'] as const, 'fixture'),
  webSearchProvider: oneOf('WEB_SEARCH_PROVIDER', ['brave', 'google-cse', 'none'] as const, 'none'),
  photoProvider: oneOf('PHOTO_PROVIDER', ['google-places', 'none'] as const, 'none'),

  overpassEndpoint: str('OVERPASS_ENDPOINT', 'https://overpass-api.de/api/interpreter')!,
  nominatimEndpoint: str('NOMINATIM_ENDPOINT', 'https://nominatim.openstreetmap.org')!,
  osmUserAgent: str('OSM_USER_AGENT', 'LocalLeadList/0.1 (self-hosted)')!,
  googleMapsApiKey: str('GOOGLE_MAPS_API_KEY'),
  braveSearchApiKey: str('BRAVE_SEARCH_API_KEY'),
  googleCseApiKey: str('GOOGLE_CSE_API_KEY'),
  googleCseEngineId: str('GOOGLE_CSE_ENGINE_ID'),

  /**
   * Minimum number of successfully completed discovery channels required before
   * a business may ever be marked VERIFIED_NO_WEBSITE. Hard floor of 2 — a
   * single channel can never prove absence.
   */
  minChannelsForNoWebsite: Math.max(2, int('MIN_CHANNELS_FOR_NO_WEBSITE', 2)),
  verificationTtlDays: Math.max(1, int('VERIFICATION_TTL_DAYS', 30)),
  fetchTimeoutMs: Math.max(1000, int('FETCH_TIMEOUT_MS', 8000)),
  fetchMaxBytes: Math.max(50_000, int('FETCH_MAX_BYTES', 1_500_000)),

  seedAdminEmail: str('SEED_ADMIN_EMAIL', 'admin@example.com')!,
  seedAdminPassword: str('SEED_ADMIN_PASSWORD'),
} as const;

export const isProduction = env.nodeEnv === 'production';
export const usesSecureCookies = env.appUrl.startsWith('https://');

/** True when the app is running entirely on local demo data. */
export const isDemoMode =
  env.discoveryProvider === 'fixture' || env.geocodingProvider === 'fixture';

/** Safe to serialise to the browser. Contains no secrets. */
export const publicConfig = {
  discoveryProvider: env.discoveryProvider,
  geocodingProvider: env.geocodingProvider,
  webSearchProvider: env.webSearchProvider,
  photoProvider: env.photoProvider,
  defaultCountry: env.defaultCountry,
  defaultTimezone: env.defaultTimezone,
  isDemoMode,
  minChannelsForNoWebsite: env.minChannelsForNoWebsite,
  verificationTtlDays: env.verificationTtlDays,
} as const;

export type PublicConfig = typeof publicConfig;

/**
 * Startup validation. Throws on misconfiguration that would be unsafe in
 * production rather than silently running with weak defaults.
 */
export function assertServerConfig(): void {
  const problems: string[] = [];
  if (!env.sessionSecret || env.sessionSecret.length < 32) {
    problems.push('SESSION_SECRET must be set to at least 32 characters.');
  }
  if (env.discoveryProvider === 'google-places' && !env.googleMapsApiKey) {
    problems.push('DISCOVERY_PROVIDER=google-places requires GOOGLE_MAPS_API_KEY.');
  }
  if (env.geocodingProvider === 'google' && !env.googleMapsApiKey) {
    problems.push('GEOCODING_PROVIDER=google requires GOOGLE_MAPS_API_KEY.');
  }
  if (env.webSearchProvider === 'brave' && !env.braveSearchApiKey) {
    problems.push('WEB_SEARCH_PROVIDER=brave requires BRAVE_SEARCH_API_KEY.');
  }
  if (env.webSearchProvider === 'google-cse' && (!env.googleCseApiKey || !env.googleCseEngineId)) {
    problems.push('WEB_SEARCH_PROVIDER=google-cse requires GOOGLE_CSE_API_KEY and GOOGLE_CSE_ENGINE_ID.');
  }
  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
  }
}
