import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/** Presentation helpers. Every one of them renders "unknown" rather than guessing. */

export function formatDateTime(ts: number | null | undefined, timeZone?: string): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(ts));
}

export function formatDate(ts: number | null | undefined, timeZone?: string): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone }).format(new Date(ts));
}

export function formatRelative(ts: number | null | undefined): string {
  if (!ts) return 'never';
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
  ];
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, ms] of units) {
    if (abs >= ms) return formatter.format(Math.round(diff / ms), unit);
  }
  return 'just now';
}

/** Human-friendly national format where possible, E.164 otherwise. */
export function formatPhone(e164: string | null, fallback: string | null = null): string | null {
  if (!e164) return fallback;
  try {
    const parsed = parsePhoneNumberFromString(e164);
    return parsed ? parsed.formatNational() : e164;
  } catch {
    return e164;
  }
}

export function telHref(e164: string | null): string | null {
  return e164 ? `tel:${e164}` : null;
}

/**
 * Google search URL for manual verification: business name + city.
 * Opened in a new tab so the lead list stays where it is.
 */
export function manualSearchUrl(name: string, city: string | null): string {
  const query = [name, city].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function formatAddressLines(business: {
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
}): string[] {
  const line1 = [business.street, business.houseNumber].filter(Boolean).join(' ');
  const line2 = [business.postalCode, business.city].filter(Boolean).join(' ');
  return [line1, line2].filter((line) => line.length > 0);
}

export function parsePhoneForCountry(value: string, country: string): string | null {
  const parsed = parsePhoneNumberFromString(value, country as CountryCode);
  return parsed?.isValid() ? parsed.number : null;
}
