import { cleanString, normalizeText } from './text';

export interface NormalizedAddress {
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string | null;
}

const STREET_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bstrasse\b/g, 'str'],
  [/\bstrase\b/g, 'str'],
  [/\bplatz\b/g, 'pl'],
  [/\bstreet\b/g, 'str'],
  [/\broad\b/g, 'rd'],
  [/\bavenue\b/g, 'ave'],
];

/** Canonical street key: "Bahnhofstrasse" and "Bahnhofstr." collapse to one key. */
export function normalizeStreet(street: string | null | undefined): string {
  let out = normalizeText(street);
  // German compound streets: "bahnhofstrasse" -> "bahnhof str"
  out = out.replace(/(\w{3,}?)(strasse|str)\b/g, '$1 str');
  for (const [pattern, replacement] of STREET_ABBREVIATIONS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Splits a free-form street line into street name and house number. */
export function splitStreetLine(line: string | null | undefined): {
  street: string | null;
  houseNumber: string | null;
} {
  const cleaned = cleanString(line);
  if (!cleaned) return { street: null, houseNumber: null };
  const trailing = cleaned.match(/^(.*?)[\s,]+(\d+\s*[-/]?\s*\d*\s*[a-zA-Z]?)$/);
  if (trailing?.[1] && trailing[2]) {
    return { street: cleanString(trailing[1]), houseNumber: cleanString(trailing[2]) };
  }
  const leading = cleaned.match(/^(\d+\s*[a-zA-Z]?)[\s,]+(.+)$/);
  if (leading?.[1] && leading[2]) {
    return { street: cleanString(leading[2]), houseNumber: cleanString(leading[1]) };
  }
  return { street: cleaned, houseNumber: null };
}

export function normalizeHouseNumber(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, '');
}

export function normalizePostalCode(value: string | null | undefined): string | null {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  const compact = cleaned.replace(/\s+/g, '').toUpperCase();
  return compact === '' ? null : compact;
}

/**
 * Deduplication key for an address. Returns null when the address is too
 * incomplete to be a reliable key — callers must then fall back to other
 * signals rather than assuming a match.
 */
export function addressKey(address: NormalizedAddress): string | null {
  const postal = normalizePostalCode(address.postalCode);
  const street = normalizeStreet(address.street);
  const houseNumber = normalizeHouseNumber(address.houseNumber);
  if (!postal || !street) return null;
  return [address.countryCode?.toUpperCase() ?? '', postal, street, houseNumber]
    .join('|')
    .toLowerCase();
}

/** Finds postal codes in free text (4-5 digit continental, UK-style). */
export function extractPostalCodes(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\b(\d{4,5})\b/g)) {
    if (m[1]) found.add(m[1]);
  }
  for (const m of text.matchAll(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/gi)) {
    if (m[1]) found.add(m[1].toUpperCase().replace(/\s+/g, ''));
  }
  return [...found];
}

export function formatAddress(address: NormalizedAddress): string | null {
  const line1 = [address.street, address.houseNumber].filter(Boolean).join(' ');
  const line2 = [address.postalCode, address.city].filter(Boolean).join(' ');
  const out = [line1, line2].filter((p) => p && p.length > 0).join(', ');
  return out === '' ? null : out;
}
