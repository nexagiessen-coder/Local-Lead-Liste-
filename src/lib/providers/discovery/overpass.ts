import { env } from '@/lib/env';
import { getCategory, CATEGORIES } from '@/lib/discovery/categories';
import { parseOpeningHours } from '@/lib/hours/parse';
import { cleanString } from '@/lib/normalize/text';
import {
  ProviderError,
  type DiscoveryProvider,
  type DiscoveryQuery,
  type ProviderInfo,
  type RawBusinessCandidate,
} from '../types';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

const SOCIAL_TAG_KEYS = [
  'contact:facebook', 'contact:instagram', 'contact:twitter', 'contact:linkedin',
  'contact:youtube', 'contact:tiktok', 'facebook', 'instagram',
];

/**
 * OpenStreetMap discovery via the Overpass API.
 *
 * OSM data is ODbL-licensed; attribution is surfaced in the UI. This provider
 * queries only the tags it needs and respects the configured endpoint's
 * timeout. It never scrapes map tiles or third-party sites.
 */
export class OverpassDiscoveryProvider implements DiscoveryProvider {
  readonly info: ProviderInfo = {
    id: 'overpass',
    label: 'OpenStreetMap (Overpass API)',
    attribution: '© OpenStreetMap contributors (ODbL)',
    isAvailable: true,
    unavailableReason: null,
  };

  constructor(private readonly endpoint = env.overpassEndpoint) {}

  async search(query: DiscoveryQuery): Promise<RawBusinessCandidate[]> {
    const category = getCategory(query.category);
    const tags = category ? category.osmTags : CATEGORIES.flatMap((c) => c.osmTags);
    const radiusMeters = Math.round(query.radiusKm * 1000);
    // Ask for more than requested: many OSM entries lack a name and are dropped.
    const fetchLimit = Math.min(1000, Math.max(query.limit * 5, 100));

    const clauses = tags
      .map((tag) => {
        const [key, value] = tag.split('=');
        return `  nwr["${key}"="${value}"](around:${radiusMeters},${query.center.lat},${query.center.lon});`;
      })
      .join('\n');

    const body = `[out:json][timeout:60];\n(\n${clauses}\n);\nout center tags ${fetchLimit};`;

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': env.osmUserAgent,
          Accept: 'application/json',
        },
        body: new URLSearchParams({ data: body }).toString(),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (cause) {
      throw new ProviderError('overpass', 'Overpass request failed.', { cause, retryable: true });
    }

    if (response.status === 429 || response.status === 504) {
      throw new ProviderError('overpass', 'Overpass is rate limiting or overloaded. Try again shortly.', {
        retryable: true,
      });
    }
    if (!response.ok) {
      throw new ProviderError('overpass', `Overpass returned HTTP ${response.status}.`, {
        retryable: response.status >= 500,
      });
    }

    const data = (await response.json()) as OverpassResponse;
    const out: RawBusinessCandidate[] = [];

    for (const element of data.elements) {
      const tagMap = element.tags ?? {};
      const name = cleanString(tagMap.name ?? tagMap['name:de'] ?? null);
      if (!name) continue; // Unnamed features cannot be identified and are skipped.

      const lat = element.lat ?? element.center?.lat ?? null;
      const lon = element.lon ?? element.center?.lon ?? null;
      const openingHoursRaw = cleanString(tagMap.opening_hours ?? null);

      out.push({
        provider: 'overpass',
        externalId: `${element.type}/${element.id}`,
        sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        name,
        category: query.category ?? matchCategoryFromTags(tagMap),
        categoryLabel: cleanString(tagMap.shop ?? tagMap.amenity ?? tagMap.craft ?? tagMap.office ?? tagMap.leisure ?? null),
        street: cleanString(tagMap['addr:street'] ?? null),
        houseNumber: cleanString(tagMap['addr:housenumber'] ?? null),
        postalCode: cleanString(tagMap['addr:postcode'] ?? null),
        city: cleanString(tagMap['addr:city'] ?? null),
        region: cleanString(tagMap['addr:state'] ?? null),
        countryCode: cleanString(tagMap['addr:country'] ?? null)?.toUpperCase() ?? null,
        lat,
        lon,
        phone: cleanString(tagMap.phone ?? tagMap['contact:phone'] ?? tagMap['contact:mobile'] ?? null),
        email: cleanString(tagMap.email ?? tagMap['contact:email'] ?? null),
        website: cleanString(tagMap.website ?? tagMap['contact:website'] ?? tagMap.url ?? null),
        socialUrls: SOCIAL_TAG_KEYS.map((key) => cleanString(tagMap[key] ?? null)).filter(
          (v): v is string => v !== null,
        ),
        openingHours: parseOpeningHours(openingHoursRaw, env.defaultTimezone),
        openingHoursRaw,
        raw: tagMap,
        isDemoData: false,
      });

      if (out.length >= fetchLimit) break;
    }

    return out;
  }
}

function matchCategoryFromTags(tags: Record<string, string>): string | null {
  for (const category of CATEGORIES) {
    for (const tag of category.osmTags) {
      const [key, value] = tag.split('=');
      if (key && value && tags[key] === value) return category.key;
    }
  }
  return null;
}
