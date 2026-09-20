import { normalizeText } from './text';

/** Hosts that can never be a business's *own* website. */
const NON_OFFICIAL_HOSTS = new Set([
  'facebook.com', 'fb.com', 'instagram.com', 'x.com', 'twitter.com',
  'linkedin.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'pinterest.com', 'snapchat.com',
  'wa.me', 'whatsapp.com', 't.me', 'threads.net', 'xing.com',
  'google.com', 'google.de', 'business.site', 'goo.gl', 'maps.app.goo.gl',
  'yelp.com', 'yelp.de', 'tripadvisor.com', 'tripadvisor.de', 'opentable.com',
  'gelbeseiten.de', 'dasoertliche.de', '11880.com', 'meinestadt.de', 'cylex.de',
  'werkenntdenbesten.de', 'golocal.de', 'branchenbuch.de', 'firmenwissen.de',
  'wikipedia.org', 'apple.com', 'amazon.de', 'amazon.com', 'ebay.de',
  'treatwell.de', 'booksy.com', 'planity.com', 'shore.com', 'salonkee.de',
  'lieferando.de', 'ubereats.com', 'wolt.com', 'doordash.com', 'thefork.de',
  'jameda.de', 'doctolib.de', 'sanego.de', 'kununu.com', 'indeed.com', 'stepstone.de',
]);

/** Social platforms specifically (a subset of the above). */
const SOCIAL_HOSTS = new Set([
  'facebook.com', 'fb.com', 'instagram.com', 'x.com', 'twitter.com', 'linkedin.com',
  'tiktok.com', 'youtube.com', 'youtu.be', 'pinterest.com', 'snapchat.com', 'threads.net',
  'xing.com', 't.me', 'wa.me', 'whatsapp.com',
]);

/** Link shorteners — we resolve them, we never trust them directly. */
const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 'ow.ly', 't.co', 'rb.gy', 'cutt.ly']);

/** Page text that indicates a parked/placeholder page rather than a real site. */
const PARKED_MARKERS = [
  'domain is for sale', 'this domain is parked', 'buy this domain', 'domain kaufen',
  'diese domain steht zum verkauf', 'parked domain', 'domain parking',
  'future home of something quite cool', 'index of /', 'default web page',
  'apache2 ubuntu default page', 'welcome to nginx', 'diese domain wurde registriert',
];

/** Page text that indicates a site exists but is not yet live. */
const PLACEHOLDER_MARKERS = [
  'website coming soon', 'coming soon', 'under construction', 'im aufbau',
  'demnaechst verfuegbar', 'baustelle', 'wir sind bald fuer sie da',
];

export function getHostname(url: string): string | null {
  try {
    const parsed = new URL(url.includes('://') ? url : `https://${url}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Registrable-ish domain: strips `www.` and known multi-level suffixes. */
export function registrableDomain(url: string): string | null {
  const host = getHostname(url);
  if (!host) return null;
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const twoLevelSuffixes = new Set(['co.uk', 'org.uk', 'com.au', 'co.nz', 'com.br', 'co.jp']);
  const lastTwo = parts.slice(-2).join('.');
  if (twoLevelSuffixes.has(lastTwo) && parts.length >= 3) return parts.slice(-3).join('.');
  return lastTwo;
}

export function isSocialOrDirectoryHost(url: string): boolean {
  const domain = registrableDomain(url);
  if (!domain) return false;
  if (NON_OFFICIAL_HOSTS.has(domain)) return true;
  // Subdomains of Google Maps and similar.
  const host = getHostname(url) ?? '';
  return host.endsWith('.google.com') || host.endsWith('.business.site');
}

export function isSocialHost(url: string): boolean {
  const domain = registrableDomain(url);
  return domain !== null && SOCIAL_HOSTS.has(domain);
}

export function isShortener(url: string): boolean {
  const domain = registrableDomain(url);
  return domain !== null && SHORTENERS.has(domain);
}

export function looksParked(pageText: string): boolean {
  const text = normalizeText(pageText);
  return PARKED_MARKERS.some((marker) => text.includes(normalizeText(marker)));
}

export function looksPlaceholder(pageText: string): boolean {
  const text = normalizeText(pageText);
  return PLACEHOLDER_MARKERS.some((marker) => text.includes(normalizeText(marker)));
}

/** How much of the business name appears in the domain label. */
export function domainNameOverlap(domain: string, businessName: string): number {
  const label = domain.split('.')[0] ?? '';
  const normalizedLabel = normalizeText(label).replace(/\s+/g, '');
  const tokens = normalizeText(businessName).split(' ').filter((t) => t.length >= 3);
  if (tokens.length === 0 || normalizedLabel === '') return 0;
  const hits = tokens.filter((t) => normalizedLabel.includes(t)).length;
  return hits / tokens.length;
}

export function normalizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url.includes('://') ? url : `https://${url}`);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

export { NON_OFFICIAL_HOSTS, SOCIAL_HOSTS };
