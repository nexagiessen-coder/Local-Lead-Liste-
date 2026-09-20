import { distinctiveTokens, normalizeText } from '@/lib/normalize/text';
import {
  isSocialOrDirectoryHost,
  isSocialHost,
  normalizeUrl,
  registrableDomain,
} from '@/lib/normalize/domain';
import { ProviderError, type WebSearchProvider } from '@/lib/providers/types';
import type { ResolvedIdentity } from '@/lib/identity/identity';
import type { ChannelResult, WebsiteChannel } from '@/lib/types';

/**
 * Website candidate discovery.
 *
 * Each channel is independent and reports its own status. A channel that could
 * not run reports `unavailable` or `error` — never an empty result — because
 * the engine treats "no candidates" as evidence and must be able to tell the
 * difference between "looked and found nothing" and "could not look".
 */

export interface DiscoveredCandidate {
  url: string;
  channel: WebsiteChannel;
  /** Where the URL came from, for the evidence trail. */
  note: string;
}

export interface ChannelOutcome {
  result: ChannelResult;
  candidates: DiscoveredCandidate[];
  /** Social profiles seen while searching (not website candidates). */
  socialProfiles: string[];
  /** Directory listings seen while searching (not website candidates). */
  directoryListings: string[];
}

/** TLDs tried when guessing a domain from the business name. */
const GUESS_TLDS = ['de', 'com'];
const MAX_GUESSES = 6;
const MAX_SEARCH_CANDIDATES = 6;

/** Channel 1 — the website field on the discovery provider's business profile. */
export function providerFieldChannel(
  identity: ResolvedIdentity,
  providerWebsite: string | null,
  providerSocialUrls: string[] = [],
): ChannelOutcome {
  const socialProfiles = providerSocialUrls.filter((u) => isSocialHost(u));
  const candidates: DiscoveredCandidate[] = [];
  let detail = 'The business profile lists no website.';

  if (providerWebsite) {
    const normalized = normalizeUrl(providerWebsite);
    if (!normalized) {
      detail = `The profile's website value could not be read as a URL: "${providerWebsite}".`;
    } else if (isSocialHost(normalized)) {
      socialProfiles.push(normalized);
      detail = 'The profile lists a social media page in place of a website.';
    } else if (isSocialOrDirectoryHost(normalized)) {
      detail = `The profile links to a directory or platform page (${registrableDomain(normalized)}), not to an own website.`;
    } else {
      candidates.push({
        url: normalized,
        channel: 'provider_field',
        note: 'Listed as the website on the business profile.',
      });
      detail = `The profile lists ${registrableDomain(normalized)} as the website.`;
    }
  }

  return {
    result: { channel: 'provider_field', status: 'ok', detail, candidatesFound: candidates.length },
    candidates,
    socialProfiles: [...new Set(socialProfiles)],
    directoryListings: [],
  };
}

/** The exact queries the search channel runs, kept explicit for auditability. */
export function buildSearchQueries(identity: ResolvedIdentity): string[] {
  const queries: string[] = [];
  const name = identity.name.trim();
  if (!name) return queries;

  if (identity.city) queries.push(`"${name}" ${identity.city}`);
  if (identity.street && identity.city) {
    queries.push(`"${name}" ${identity.street} ${identity.city}`);
  }
  if (identity.phoneE164) queries.push(`"${name}" ${identity.phoneE164}`);
  if (queries.length === 0) queries.push(`"${name}"`);
  return queries;
}

/** Channel 2 — web search. */
export async function searchEngineChannel(
  identity: ResolvedIdentity,
  search: WebSearchProvider,
): Promise<ChannelOutcome> {
  if (!search.info.isAvailable) {
    return {
      result: {
        channel: 'search_engine',
        status: 'unavailable',
        detail: search.info.unavailableReason ?? 'No web search provider configured.',
        candidatesFound: 0,
      },
      candidates: [],
      socialProfiles: [],
      directoryListings: [],
    };
  }

  const queries = buildSearchQueries(identity);
  const seenDomains = new Set<string>();
  const candidates: DiscoveredCandidate[] = [];
  const socialProfiles: string[] = [];
  const directoryListings: string[] = [];
  let ran = 0;

  for (const query of queries) {
    let results;
    try {
      results = await search.search(query, 10);
    } catch (error) {
      const message = error instanceof ProviderError ? error.message : String(error);
      return {
        result: {
          channel: 'search_engine',
          status: 'error',
          detail: `Search failed after ${ran}/${queries.length} queries: ${message}`,
          candidatesFound: candidates.length,
        },
        candidates,
        socialProfiles,
        directoryListings,
      };
    }
    ran += 1;

    for (const result of results) {
      const normalized = normalizeUrl(result.url);
      if (!normalized) continue;
      if (isSocialHost(normalized)) {
        socialProfiles.push(normalized);
        continue;
      }
      if (isSocialOrDirectoryHost(normalized)) {
        directoryListings.push(normalized);
        continue;
      }
      const domain = registrableDomain(normalized);
      if (!domain || seenDomains.has(domain)) continue;
      seenDomains.add(domain);
      if (candidates.length >= MAX_SEARCH_CANDIDATES) continue;
      candidates.push({
        url: normalized,
        channel: 'search_engine',
        note: `Search result for ${query} — "${result.title}".`,
      });
    }
  }

  return {
    result: {
      channel: 'search_engine',
      status: 'ok',
      detail: `${ran} search ${ran === 1 ? 'query' : 'queries'} run; ${candidates.length} domain(s) to check.`,
      candidatesFound: candidates.length,
    },
    candidates,
    socialProfiles: [...new Set(socialProfiles)],
    directoryListings: [...new Set(directoryListings)],
  };
}

/** Deterministic domain guesses from the business name and city. */
export function buildDomainGuesses(identity: ResolvedIdentity): string[] {
  const tokens = distinctiveTokens(identity.name);
  if (tokens.length === 0) return [];
  const city = identity.city ? normalizeText(identity.city).split(' ')[0] ?? '' : '';

  const labels = new Set<string>();
  labels.add(tokens.join(''));
  if (tokens.length > 1) labels.add(tokens.join('-'));
  if (tokens[0]) labels.add(tokens[0]);
  if (city && tokens[0]) {
    labels.add(`${tokens[0]}-${city}`);
    labels.add(`${tokens.join('')}-${city}`);
  }

  const guesses: string[] = [];
  for (const label of labels) {
    if (label.length < 4) continue;
    for (const tld of GUESS_TLDS) {
      guesses.push(`https://${label}.${tld}`);
      if (guesses.length >= MAX_GUESSES) return guesses;
    }
  }
  return guesses;
}

/**
 * Channel 3 — deterministic domain guesses.
 *
 * A guessed domain is only ever a *candidate*; it still has to pass full
 * page-level matching before it counts for anything.
 */
export function domainGuessChannel(
  identity: ResolvedIdentity,
  alreadySeen: Set<string>,
): ChannelOutcome {
  const guesses = buildDomainGuesses(identity).filter((url) => {
    const domain = registrableDomain(url);
    return domain !== null && !alreadySeen.has(domain);
  });

  return {
    result: {
      channel: 'domain_guess',
      status: 'ok',
      detail:
        guesses.length > 0
          ? `${guesses.length} likely domain(s) derived from the business name were checked.`
          : 'The business name produced no usable domain guesses.',
      candidatesFound: guesses.length,
    },
    candidates: guesses.map((url) => ({
      url,
      channel: 'domain_guess' as const,
      note: 'Domain derived from the business name — checked, not assumed.',
    })),
    socialProfiles: [],
    directoryListings: [],
  };
}

/**
 * Channel 4 — social profiles.
 *
 * Social pages are not websites. They are recorded as context, and a profile
 * that the business itself nominates as its "website" is treated as an open
 * question rather than as proof either way.
 */
export function socialProfileChannel(socialProfiles: string[]): ChannelOutcome {
  return {
    result: {
      channel: 'social_profile',
      status: 'ok',
      detail:
        socialProfiles.length > 0
          ? `${socialProfiles.length} social profile(s) found. A social profile is not a website.`
          : 'No social profiles found.',
      candidatesFound: 0,
    },
    candidates: [],
    socialProfiles,
    directoryListings: [],
  };
}

/**
 * Channel 5 — business directories.
 *
 * Directory pages are only used through providers that permit it. Without such
 * a provider the channel is skipped — it is never scraped. Skipped channels do
 * not count towards the evidence required for a "no website" conclusion.
 */
export function directoryChannel(directoryListings: string[]): ChannelOutcome {
  return {
    result: {
      channel: 'directory',
      status: directoryListings.length > 0 ? 'ok' : 'skipped',
      detail:
        directoryListings.length > 0
          ? `${directoryListings.length} directory listing(s) seen in search results. Directory pages are not fetched.`
          : 'No permitted directory data source is configured; directory pages are not scraped.',
      candidatesFound: 0,
    },
    candidates: [],
    socialProfiles: [],
    directoryListings,
  };
}
