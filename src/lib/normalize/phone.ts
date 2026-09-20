import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { cleanString } from './text';

export interface NormalizedPhone {
  raw: string;
  e164: string | null;
  national: string | null;
  country: string | null;
  isValid: boolean;
}

/**
 * Normalises a phone number to E.164. E.164 equality is the strongest identity
 * signal in the system, so anything that cannot be parsed confidently returns
 * `e164: null` rather than a guess.
 */
export function normalizePhone(
  input: string | null | undefined,
  defaultCountry = 'DE',
): NormalizedPhone | null {
  const raw = cleanString(input);
  if (!raw) return null;
  try {
    const parsed = parsePhoneNumberFromString(raw, defaultCountry as CountryCode);
    if (!parsed || !parsed.isValid()) {
      return { raw, e164: null, national: null, country: null, isValid: false };
    }
    return {
      raw,
      e164: parsed.number,
      national: parsed.formatNational(),
      country: parsed.country ?? null,
      isValid: true,
    };
  } catch {
    return { raw, e164: null, national: null, country: null, isValid: false };
  }
}

/** Digits-only form, used to find phone numbers inside free-form page text. */
export function phoneDigits(e164: string): string {
  return e164.replace(/\D/g, '');
}

/**
 * Finds every plausible phone number in a block of text and returns the set of
 * E.164 numbers. Used to compare a candidate website against a business.
 */
export function extractPhoneNumbers(text: string, defaultCountry = 'DE'): string[] {
  const found = new Set<string>();
  const pattern = /(?:\+|00)?[\d][\d\s()/.-]{5,24}\d/g;
  for (const match of text.matchAll(pattern)) {
    const candidate = match[0];
    const digitCount = candidate.replace(/\D/g, '').length;
    if (digitCount < 6 || digitCount > 16) continue;
    const parsed = normalizePhone(candidate, defaultCountry);
    if (parsed?.e164) found.add(parsed.e164);
  }
  return [...found];
}

/**
 * Compares two phone numbers: 'match' | 'mismatch' | 'unknown'.
 * 'unknown' when either side could not be normalised, or when one number is a
 * prefix of the other (main line vs. extension) — neither is proof.
 */
export function comparePhones(
  a: string | null | undefined,
  b: string | null | undefined,
): 'match' | 'mismatch' | 'unknown' {
  if (!a || !b) return 'unknown';
  if (a === b) return 'match';
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  if (da.length >= 8 && db.length >= 8 && (da.startsWith(db) || db.startsWith(da))) return 'unknown';
  return 'mismatch';
}
