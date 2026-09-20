import { extractPhoneNumbers } from '@/lib/normalize/phone';
import { extractPostalCodes } from '@/lib/normalize/address';
import { normalizeText } from '@/lib/normalize/text';
import { looksParked, looksPlaceholder } from '@/lib/normalize/domain';
import type { FetchedPage } from '@/lib/providers/types';

/**
 * Signal extraction from a fetched page.
 *
 * Only facts are extracted — phone numbers, postal codes, visible text,
 * structured data. Nothing is inferred here; interpretation happens in the
 * scorer, where it can be weighed and recorded as evidence.
 */

export interface PageSignals {
  title: string | null;
  /** Visible text, lowercased and normalised. */
  text: string;
  normalizedText: string;
  phones: string[];
  postalCodes: string[];
  outboundLinks: string[];
  /** schema.org LocalBusiness-ish objects found in JSON-LD. */
  structured: StructuredBusiness[];
  isParked: boolean;
  isPlaceholder: boolean;
  /** Body is suspiciously small (likely an error or empty page). */
  isEmpty: boolean;
}

export interface StructuredBusiness {
  type: string;
  name: string | null;
  telephone: string | null;
  streetAddress: string | null;
  postalCode: string | null;
  addressLocality: string | null;
  url: string | null;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ndash: '–', mdash: '—',
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => ENTITIES[name] ?? match);
}

/** Strips scripts, styles and tags, leaving readable text. */
export function htmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  return decodeEntities(withoutScripts.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim() : null;
}

function extractJsonLd(html: string): StructuredBusiness[] {
  const out: StructuredBusiness[] = [];
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    const payload = block[1];
    if (!payload) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload.trim());
    } catch {
      continue; // Malformed JSON-LD is ignored rather than guessed at.
    }
    for (const node of flattenJsonLd(parsed)) {
      const type = String(node['@type'] ?? '');
      if (!type) continue;
      const address = (node.address ?? {}) as Record<string, unknown>;
      out.push({
        type,
        name: asString(node.name),
        telephone: asString(node.telephone),
        streetAddress: asString(address.streetAddress),
        postalCode: asString(address.postalCode),
        addressLocality: asString(address.addressLocality),
        url: asString(node.url),
      });
    }
  }
  return out;
}

function flattenJsonLd(value: unknown, depth = 0): Array<Record<string, unknown>> {
  if (depth > 4 || value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((v) => flattenJsonLd(v, depth + 1));
  const node = value as Record<string, unknown>;
  const nested = Array.isArray(node['@graph']) ? flattenJsonLd(node['@graph'], depth + 1) : [];
  return node['@type'] ? [node, ...nested] : nested;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    const href = match[1];
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    try {
      links.add(new URL(href, baseUrl).toString());
    } catch {
      // Ignore unparseable hrefs.
    }
  }
  return [...links];
}

export function extractPageSignals(page: FetchedPage, defaultCountry = 'DE'): PageSignals {
  const html = page.body ?? '';
  const text = htmlToText(html);
  // tel: links are the most reliable phone source on a page.
  const telLinks = [...html.matchAll(/href=["']tel:([^"']+)["']/gi)].map((m) => m[1] ?? '');
  const phones = [...new Set([...extractPhoneNumbers(telLinks.join(' '), defaultCountry), ...extractPhoneNumbers(text, defaultCountry)])];

  return {
    title: extractTitle(html),
    text,
    normalizedText: normalizeText(text),
    phones,
    postalCodes: extractPostalCodes(text),
    outboundLinks: extractLinks(html, page.finalUrl),
    structured: extractJsonLd(html),
    isParked: looksParked(text),
    isPlaceholder: looksPlaceholder(text),
    isEmpty: text.length < 60,
  };
}
