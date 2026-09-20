/**
 * Provider interfaces.
 *
 * Every external data source sits behind one of these interfaces so that
 * providers can be swapped or added without touching the verification engine.
 *
 * Two rules apply to all providers:
 *  1. They report availability honestly (`isAvailable`), and
 *  2. They throw `ProviderError` rather than returning empty results when a
 *     lookup fails. An empty result must mean "looked, found nothing"; it must
 *     never mean "could not look". The verification engine depends on this
 *     distinction to avoid false "no website" conclusions.
 */

import type { OpeningHours } from '@/lib/types';

export class ProviderError extends Error {
  readonly provider: string;
  readonly retryable: boolean;

  constructor(provider: string, message: string, options: { retryable?: boolean; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = 'ProviderError';
    this.provider = provider;
    this.retryable = options.retryable ?? false;
  }
}

export interface ProviderInfo {
  id: string;
  label: string;
  /** Attribution string that must be shown in the UI where required. */
  attribution: string | null;
  /** False when the provider is not configured (missing key, disabled). */
  isAvailable: boolean;
  /** Reason shown to the user when unavailable. */
  unavailableReason: string | null;
}

// --- Geocoding --------------------------------------------------------------

export interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
  city: string | null;
  postalCode: string | null;
  region: string | null;
  countryCode: string | null;
  /** Provider's own confidence, 0..1, when available. */
  importance: number | null;
}

export interface GeocodingProvider {
  readonly info: ProviderInfo;
  geocode(query: string): Promise<GeocodeResult | null>;
}

// --- Discovery --------------------------------------------------------------

export interface DiscoveryQuery {
  center: { lat: number; lon: number };
  radiusKm: number;
  /** Internal category key from the taxonomy, or null for "any business". */
  category: string | null;
  /** Maximum raw candidates to return (before dedupe/verification). */
  limit: number;
}

/**
 * A business as reported by a discovery provider. This is raw input — it is
 * never trusted as identity until the identity stage has run.
 */
export interface RawBusinessCandidate {
  provider: string;
  externalId: string;
  sourceUrl: string | null;
  name: string;
  category: string | null;
  categoryLabel: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  lat: number | null;
  lon: number | null;
  phone: string | null;
  email: string | null;
  /** Website exactly as the provider reports it — may be null or junk. */
  website: string | null;
  /** Social profile URLs reported by the provider. */
  socialUrls: string[];
  openingHours: OpeningHours | null;
  openingHoursRaw: string | null;
  /** Provider payload, stored verbatim for auditability. */
  raw: Record<string, unknown>;
  /** True for local demo data so the UI can badge it. */
  isDemoData: boolean;
}

export interface DiscoveryProvider {
  readonly info: ProviderInfo;
  search(query: DiscoveryQuery): Promise<RawBusinessCandidate[]>;
}

// --- Web search -------------------------------------------------------------

export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
}

export interface WebSearchProvider {
  readonly info: ProviderInfo;
  search(query: string, limit: number): Promise<WebSearchResult[]>;
}

// --- HTTP fetching ----------------------------------------------------------

export interface FetchedPage {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  /** Decoded body, truncated to the configured byte cap. */
  body: string;
  redirects: string[];
  fetchedAt: number;
}

export interface HttpFetcher {
  readonly info: ProviderInfo;
  fetchPage(url: string): Promise<FetchedPage>;
}

// --- Photos -----------------------------------------------------------------

export interface PhotoRef {
  provider: string;
  providerRef: string;
  /** Application URL that proxies the image; never a third-party hotlink. */
  url: string;
  attribution: string | null;
  width: number | null;
  height: number | null;
  /**
   * How we know the photo belongs to *this* business — e.g. "Returned by the
   * provider for the matched place id". Photos without a verifiable link are
   * never shown.
   */
  linkBasis: string;
}

export interface PhotoProvider {
  readonly info: ProviderInfo;
  /** `providerPlaceId` must come from a source already matched to the business. */
  getPhotos(providerPlaceId: string, limit: number): Promise<PhotoRef[]>;
}
