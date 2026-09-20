import { env } from '@/lib/env';
import { ProviderError, type PhotoProvider, type PhotoRef, type ProviderInfo } from '../types';

interface PlaceDetailsResponse {
  photos?: Array<{ name?: string; widthPx?: number; heightPx?: number; authorAttributions?: Array<{ displayName?: string }> }>;
}

/**
 * Photos from the Google Places API.
 *
 * Photos are only ever requested for a place id that the identity stage already
 * matched to this business, and the resulting URLs point at our own proxy route
 * rather than at Google directly. Images are not stored — only the reference.
 */
export class GooglePlacesPhotoProvider implements PhotoProvider {
  readonly info: ProviderInfo;

  constructor(private readonly apiKey = env.googleMapsApiKey) {
    this.info = {
      id: 'google-places',
      label: 'Google Places photos',
      attribution: 'Photos © Google and their contributors',
      isAvailable: Boolean(apiKey),
      unavailableReason: apiKey ? null : 'GOOGLE_MAPS_API_KEY is not set.',
    };
  }

  async getPhotos(providerPlaceId: string, limit: number): Promise<PhotoRef[]> {
    if (!this.apiKey) throw new ProviderError('google-places', 'GOOGLE_MAPS_API_KEY is not configured.');

    let response: Response;
    try {
      response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(providerPlaceId)}`, {
        headers: { 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'photos' },
        signal: AbortSignal.timeout(env.fetchTimeoutMs),
      });
    } catch (cause) {
      throw new ProviderError('google-places', 'Photo lookup failed.', { cause, retryable: true });
    }
    if (!response.ok) {
      throw new ProviderError('google-places', `Photo lookup returned HTTP ${response.status}.`, {
        retryable: response.status >= 500,
      });
    }

    const data = (await response.json()) as PlaceDetailsResponse;
    return (data.photos ?? [])
      .filter((p): p is { name: string; widthPx?: number; heightPx?: number; authorAttributions?: Array<{ displayName?: string }> } =>
        Boolean(p.name),
      )
      .slice(0, limit)
      .map((p) => ({
        provider: 'google-places',
        providerRef: p.name,
        url: `/api/photos?ref=${encodeURIComponent(p.name)}`,
        attribution: p.authorAttributions?.map((a) => a.displayName).filter(Boolean).join(', ') || 'Google',
        width: p.widthPx ?? null,
        height: p.heightPx ?? null,
        linkBasis: `Returned by Google Places for the place id matched to this business (${providerPlaceId}).`,
      }));
  }
}

export class NoPhotoProvider implements PhotoProvider {
  readonly info: ProviderInfo = {
    id: 'none',
    label: 'No photo provider',
    attribution: null,
    isAvailable: false,
    unavailableReason:
      'No photo provider is configured. Photos are only shown when a provider can vouch that they ' +
      'belong to this exact business; images are never generated or guessed.',
  };

  async getPhotos(): Promise<PhotoRef[]> {
    return [];
  }
}
