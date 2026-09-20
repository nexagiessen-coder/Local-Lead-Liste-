import { getDb } from '@/lib/db';
import { createPhotoProvider } from '@/lib/providers/registry';
import { ProviderError, type PhotoRef } from '@/lib/providers/types';

/**
 * Business photos.
 *
 * Photos are only ever fetched for a provider place id that is recorded as a
 * *source of this business*, so a photo can never be shown against a
 * similarly-named business. Images are never generated, and they are not stored
 * — only the provider reference is kept, and the image itself is proxied on
 * demand.
 */

export interface PhotoResult {
  photos: PhotoRef[];
  /** Why there are no photos, when there are none. Always shown honestly. */
  unavailableReason: string | null;
  attribution: string | null;
}

const MAX_PHOTOS = 5;

export async function getBusinessPhotos(businessId: string): Promise<PhotoResult> {
  const provider = createPhotoProvider();
  if (!provider.info.isAvailable) {
    return {
      photos: [],
      unavailableReason: provider.info.unavailableReason ?? 'No photo provider is configured.',
      attribution: null,
    };
  }

  const source = getDb()
    .prepare(
      `SELECT external_id FROM business_sources
        WHERE business_id = ? AND provider = ?
        ORDER BY fetched_at DESC LIMIT 1`,
    )
    .get(businessId, provider.info.id === 'google-places' ? 'google-places' : provider.info.id) as
    | { external_id: string }
    | undefined;

  if (!source) {
    return {
      photos: [],
      unavailableReason:
        'This business has no record from the photo provider, so no photo can be confirmed as belonging to it.',
      attribution: null,
    };
  }

  try {
    const photos = await provider.getPhotos(source.external_id, MAX_PHOTOS);
    return {
      photos,
      unavailableReason: photos.length === 0 ? 'The provider has no photos for this business.' : null,
      attribution: provider.info.attribution,
    };
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : 'Photos could not be loaded.';
    return { photos: [], unavailableReason: message, attribution: provider.info.attribution };
  }
}
