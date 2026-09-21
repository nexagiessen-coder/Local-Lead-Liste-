import { addressKey, normalizeStreet, normalizePostalCode } from '@/lib/normalize/address';
import { normalizePhone } from '@/lib/normalize/phone';
import { distinctiveTokens, normalizeBusinessName, normalizeText, cleanString } from '@/lib/normalize/text';
import type { RawBusinessCandidate } from '@/lib/providers/types';
import type { IdentitySignal, IdentityStatus } from '@/lib/types';

/**
 * Identity verification.
 *
 * Before anything is said about a business's website, the system must be able
 * to say *which* business it is talking about. This module turns a raw provider
 * record into a normalised identity plus an explicit confidence score, and it
 * refuses to claim confidence it does not have.
 */

export interface ResolvedIdentity {
  name: string;
  nameNormalized: string;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  cityNormalized: string | null;
  region: string | null;
  countryCode: string | null;
  lat: number | null;
  lon: number | null;
  phoneRaw: string | null;
  phoneE164: string | null;
  email: string | null;
  dedupeKeyPhone: string | null;
  dedupeKeyAddress: string | null;
  signals: IdentitySignal[];
  confidence: number;
  status: IdentityStatus;
}

/** Points awarded per signal. Strong signals dominate on purpose. */
const POINTS = {
  validPhone: 35,
  fullAddress: 30,
  partialAddress: 15,
  coordinates: 10,
  distinctiveName: 8,
  category: 4,
  corroboration: 15,
} as const;

export const IDENTITY_CONFIRMED_THRESHOLD = 70;
export const IDENTITY_PROBABLE_THRESHOLD = 45;

export interface BuildIdentityOptions {
  defaultCountry?: string;
  /** Number of independent sources that reported this same business. */
  corroboratingSources?: number;
  /** Set when sources disagree on a strong field — forces NEEDS_REVIEW. */
  conflicts?: string[];
  /**
   * True when the address was read back from coordinates rather than asserted
   * by the business record itself. Such an address is real and useful, but it
   * describes the premises the map places the business at, so it is always
   * scored as a partial address — never as the strong "complete street
   * address" signal, which only the source's own claim earns.
   */
  addressFromReverseGeocode?: boolean;
}

export function buildIdentity(
  raw: RawBusinessCandidate,
  options: BuildIdentityOptions = {},
): ResolvedIdentity {
  const defaultCountry = options.defaultCountry ?? 'DE';
  const name = cleanString(raw.name) ?? '';
  const phone = normalizePhone(raw.phone, defaultCountry);
  const street = cleanString(raw.street);
  const houseNumber = cleanString(raw.houseNumber);
  const postalCode = normalizePostalCode(raw.postalCode);
  const city = cleanString(raw.city);
  const countryCode = cleanString(raw.countryCode)?.toUpperCase() ?? defaultCountry;

  const fromReverseGeocode = options.addressFromReverseGeocode === true;
  const hasCompleteAddress = Boolean(street && houseNumber && postalCode && city);
  // A map-derived address never earns the strong signal, however complete it
  // looks: the business record itself never claimed it.
  const hasFullAddress = hasCompleteAddress && !fromReverseGeocode;
  const hasPartialAddress =
    !hasFullAddress && Boolean((street && (city || postalCode)) || (fromReverseGeocode && (city || postalCode)));
  const hasCoordinates = typeof raw.lat === 'number' && typeof raw.lon === 'number';
  const nameTokens = distinctiveTokens(name);

  const signals: IdentitySignal[] = [
    {
      key: 'name',
      label: 'Business name',
      value: name || null,
      strength: 'weak',
      present: name.length > 0,
    },
    {
      key: 'distinctive_name',
      label: 'Distinctive name tokens',
      value: nameTokens.length > 0 ? nameTokens.join(', ') : null,
      strength: 'weak',
      present: nameTokens.length > 0,
    },
    {
      key: 'phone',
      label: 'Valid phone number',
      value: phone?.e164 ?? phone?.raw ?? null,
      strength: 'strong',
      present: Boolean(phone?.e164),
    },
    {
      key: 'address',
      label: fromReverseGeocode
        ? 'Address (read from map coordinates)'
        : hasFullAddress
          ? 'Complete street address'
          : 'Partial address',
      value: [street, houseNumber, postalCode, city].filter(Boolean).join(' ') || null,
      strength: hasFullAddress ? 'strong' : 'medium',
      present: hasFullAddress || hasPartialAddress,
    },
    {
      key: 'coordinates',
      label: 'Geographic coordinates',
      value: hasCoordinates ? `${raw.lat!.toFixed(5)}, ${raw.lon!.toFixed(5)}` : null,
      strength: 'medium',
      present: hasCoordinates,
    },
    {
      key: 'category',
      label: 'Business category',
      value: raw.categoryLabel ?? raw.category,
      strength: 'weak',
      present: Boolean(raw.category ?? raw.categoryLabel),
    },
    {
      key: 'corroboration',
      label: 'Independent sources',
      value: String(options.corroboratingSources ?? 1),
      strength: 'strong',
      present: (options.corroboratingSources ?? 1) >= 2,
    },
  ];

  let confidence = 0;
  if (phone?.e164) confidence += POINTS.validPhone;
  if (hasFullAddress) confidence += POINTS.fullAddress;
  else if (hasPartialAddress) confidence += POINTS.partialAddress;
  if (hasCoordinates) confidence += POINTS.coordinates;
  if (nameTokens.length > 0) confidence += POINTS.distinctiveName;
  if (raw.category ?? raw.categoryLabel) confidence += POINTS.category;
  if ((options.corroboratingSources ?? 1) >= 2) confidence += POINTS.corroboration;
  confidence = Math.min(100, confidence);

  let status: IdentityStatus;
  if (name.length === 0) {
    status = 'UNVERIFIED';
  } else if (options.conflicts && options.conflicts.length > 0) {
    status = 'NEEDS_REVIEW';
  } else if (confidence >= IDENTITY_CONFIRMED_THRESHOLD) {
    status = 'CONFIRMED';
  } else if (confidence >= IDENTITY_PROBABLE_THRESHOLD) {
    status = 'PROBABLE';
  } else {
    status = 'UNVERIFIED';
  }

  return {
    name,
    nameNormalized: normalizeBusinessName(name),
    street,
    houseNumber,
    postalCode,
    city,
    cityNormalized: city ? normalizeText(city) : null,
    region: cleanString(raw.region),
    countryCode,
    lat: raw.lat ?? null,
    lon: raw.lon ?? null,
    phoneRaw: phone?.raw ?? null,
    phoneE164: phone?.e164 ?? null,
    email: cleanString(raw.email),
    dedupeKeyPhone: phone?.e164 ?? null,
    dedupeKeyAddress: addressKey({ street, houseNumber, postalCode, city, countryCode }),
    signals,
    confidence,
    status,
  };
}

/**
 * A stable key grouping branches of the same brand, so the UI can show
 * "3 locations" without ever merging them into one lead.
 */
export function branchGroupKey(name: string, countryCode: string | null): string | null {
  const tokens = distinctiveTokens(name);
  if (tokens.length === 0) return null;
  return `${countryCode ?? ''}|${tokens.sort().join('-')}`.toLowerCase();
}

export { normalizeStreet };
