import { env } from '@/lib/env';
import { NominatimGeocodingProvider } from './geocoding/nominatim';
import { GoogleGeocodingProvider } from './geocoding/google';
import { FixtureGeocodingProvider } from './geocoding/fixture';
import { OverpassDiscoveryProvider } from './discovery/overpass';
import { GooglePlacesDiscoveryProvider } from './discovery/google-places';
import { FixtureDiscoveryProvider } from './discovery/fixture';
import { BraveWebSearchProvider } from './search/brave';
import { GoogleCseWebSearchProvider } from './search/google-cse';
import { NoWebSearchProvider } from './search/none';
import { FixtureWebSearchProvider } from './search/fixture';
import { SafeHttpFetcher } from './http/fetcher';
import { FixtureHttpFetcher } from './http/fixture';
import { GooglePlacesPhotoProvider, NoPhotoProvider } from './photos/google-places';
import type {
  DiscoveryProvider,
  GeocodingProvider,
  HttpFetcher,
  PhotoProvider,
  WebSearchProvider,
} from './types';

/**
 * Provider registry.
 *
 * A `ProviderSet` is passed explicitly into the research and verification
 * pipelines, so tests can supply deterministic providers without touching
 * global state.
 */
export interface ProviderSet {
  geocoding: GeocodingProvider;
  discovery: DiscoveryProvider;
  search: WebSearchProvider;
  fetcher: HttpFetcher;
  photos: PhotoProvider;
}

export function createGeocodingProvider(): GeocodingProvider {
  switch (env.geocodingProvider) {
    case 'nominatim':
      return new NominatimGeocodingProvider();
    case 'google':
      return new GoogleGeocodingProvider();
    default:
      return new FixtureGeocodingProvider();
  }
}

export function createDiscoveryProvider(): DiscoveryProvider {
  switch (env.discoveryProvider) {
    case 'overpass':
      return new OverpassDiscoveryProvider();
    case 'google-places':
      return new GooglePlacesDiscoveryProvider();
    default:
      return new FixtureDiscoveryProvider();
  }
}

export function createWebSearchProvider(): WebSearchProvider {
  switch (env.webSearchProvider) {
    case 'brave':
      return new BraveWebSearchProvider();
    case 'google-cse':
      return new GoogleCseWebSearchProvider();
    default:
      // In demo mode the offline index stands in for a real engine so the
      // pipeline can be exercised; otherwise search is genuinely unavailable.
      return env.discoveryProvider === 'fixture' ? new FixtureWebSearchProvider() : new NoWebSearchProvider();
  }
}

export function createHttpFetcher(): HttpFetcher {
  return env.discoveryProvider === 'fixture' ? new FixtureHttpFetcher() : new SafeHttpFetcher();
}

export function createPhotoProvider(): PhotoProvider {
  return env.photoProvider === 'google-places' ? new GooglePlacesPhotoProvider() : new NoPhotoProvider();
}

export function createProviderSet(): ProviderSet {
  return {
    geocoding: createGeocodingProvider(),
    discovery: createDiscoveryProvider(),
    search: createWebSearchProvider(),
    fetcher: createHttpFetcher(),
    photos: createPhotoProvider(),
  };
}

/** Provider status for the settings screen and the evidence footer. */
export function describeProviders(set: ProviderSet = createProviderSet()) {
  return {
    geocoding: set.geocoding.info,
    discovery: set.discovery.info,
    search: set.search.info,
    fetcher: set.fetcher.info,
    photos: set.photos.info,
  };
}
