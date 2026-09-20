import { getHostname, registrableDomain } from './domain';

/**
 * Social profile parsing.
 *
 * A social page is never a website. But a business's own social profile is a
 * strong pointer *towards* its website — through the handle it chose, and
 * through the link-in-bio page it publishes. This module turns a social URL
 * into the structured facts the verification engine can act on.
 *
 * Nothing here fetches facebook.com or instagram.com. Their terms forbid
 * automated collection, and the pages are login-walled, so a scraper would be
 * both non-compliant and unreliable. The engine works from data our own search
 * provider returns and from pages that are meant to be followed.
 */

export type SocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'x'
  | 'youtube'
  | 'other';

export interface SocialProfile {
  platform: SocialPlatform;
  /** Account name without the leading "@", lowercased. Null when not readable. */
  handle: string | null;
  url: string;
}

const PLATFORM_BY_DOMAIN: Record<string, SocialPlatform> = {
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'fb.me': 'facebook',
  'instagram.com': 'instagram',
  'tiktok.com': 'tiktok',
  'linkedin.com': 'linkedin',
  'x.com': 'x',
  'twitter.com': 'x',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
};

/**
 * Path segments that introduce *content*, not an account. Everything after one
 * of these is a post id, so there is no handle to read.
 */
const CONTENT_SEGMENTS = new Set([
  'p', 'reel', 'reels', 'posts', 'post', 'photo', 'photos', 'videos', 'video',
  'watch', 'story', 'stories', 'explore', 'groups', 'events', 'marketplace',
  'profile.php', 'people', 'share', 'permalink', 'media', 'tv', 'shorts',
  'sharer', 'search', 'hashtag', 'login', 'help', 'legal', 'privacy',
]);

/** Path segments that come immediately *before* an account name. */
const HANDLE_PREFIX_SEGMENTS = new Set(['pages', 'company', 'in', 'c', 'user', 'channel', 'school']);

/**
 * Link-in-bio services: public link directories that exist to be followed.
 * Fetching one is ordinary link following, not scraping a walled platform.
 */
const LINK_IN_BIO_HOSTS = new Set([
  'linktr.ee', 'linktree.com', 'beacons.ai', 'bio.link', 'taplink.cc',
  'lnk.bio', 'solo.to', 'campsite.bio', 'komi.io', 'msha.ke', 'allmylinks.com',
  'linkin.bio', 'many.link', 'withkoji.com', 'shorby.com', 'pillar.io',
]);

export function parseSocialProfile(url: string): SocialProfile | null {
  const domain = registrableDomain(url);
  if (!domain) return null;
  const platform = PLATFORM_BY_DOMAIN[domain];
  if (!platform) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.includes('://') ? url : `https://${url}`);
  } catch {
    return null;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  let handle: string | null = null;
  for (const segment of segments) {
    const clean = decodeURIComponent(segment).replace(/^@/, '').toLowerCase();
    if (clean === '') continue;
    // A content path means there is no account name to read here at all.
    if (CONTENT_SEGMENTS.has(clean)) break;
    // "/company/", "/in/", "/pages/" introduce the name; keep looking.
    if (HANDLE_PREFIX_SEGMENTS.has(clean)) continue;
    // A numeric id identifies an account but is not a name we can work from.
    if (/^\d+$/.test(clean)) break;
    if (!/^[a-z0-9._-]{2,60}$/.test(clean)) break;
    handle = clean;
    break;
  }

  return { platform, handle, url };
}

export function isLinkInBioHost(url: string): boolean {
  const domain = registrableDomain(url);
  if (domain !== null && LINK_IN_BIO_HOSTS.has(domain)) return true;
  const host = getHostname(url);
  return host !== null && host.endsWith('.bio.link');
}

/**
 * Domains a business with this handle might plausibly own.
 *
 * These are only ever *candidates*: each one still has to pass the same
 * page-level matching as any other domain before it counts for anything. A
 * handle that happens to match someone else's domain cannot slip through.
 */
export function handleDomainCandidates(handle: string, tlds: readonly string[] = ['de', 'com']): string[] {
  const cleaned = handle.trim().toLowerCase().replace(/^@/, '');
  if (cleaned.length < 4) return [];

  const compact = cleaned.replace(/[^a-z0-9]/g, '');
  const hyphenated = cleaned.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const labels = new Set<string>();
  if (compact.length >= 4) labels.add(compact);
  if (hyphenated.length >= 4 && hyphenated !== compact) labels.add(hyphenated);

  const out: string[] = [];
  for (const label of labels) {
    for (const tld of tlds) out.push(`https://${label}.${tld}`);
  }
  return out;
}

const DOMAIN_PATTERN = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:de|com|net|org|eu|at|ch|info|shop|online|studio|salon|bar|cafe))\b/gi;

/**
 * Domains mentioned in a piece of text, such as a search result snippet.
 *
 * Search engines surface the "Website" field of a business's social page in the
 * snippet they return. Reading our own provider's snippet is legitimate; it is
 * also the only reliable way to see that field without logging in.
 */
export function extractDomainsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(DOMAIN_PATTERN)) {
    const candidate = match[1]?.toLowerCase();
    if (!candidate) continue;
    // Skip things that are obviously file names rather than hosts.
    if (/\.(?:jpg|jpeg|png|gif|webp|pdf|mp4)$/.test(candidate)) continue;
    found.add(candidate.replace(/^www\./, ''));
  }
  return [...found];
}

export { LINK_IN_BIO_HOSTS };
