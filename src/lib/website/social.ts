import {
  extractDomainsFromText,
  handleDomainCandidates,
  isLinkInBioHost,
  parseSocialProfile,
  type SocialProfile,
} from '@/lib/normalize/social';
import { isSocialOrDirectoryHost, normalizeUrl, registrableDomain } from '@/lib/normalize/domain';
import { ProviderError, type HttpFetcher, type WebSearchProvider } from '@/lib/providers/types';
import type { ResolvedIdentity } from '@/lib/identity/identity';
import type { ChannelResult } from '@/lib/types';
import type { DiscoveredCandidate } from './candidates';
import { extractPageSignals } from './extract';

/**
 * Social profile resolution — the active social channel.
 *
 * A business whose only web presence looks like a Facebook or Instagram page is
 * the most common ambiguous case in this product: it is either a perfect lead
 * (no website at all) or a miss (a website we failed to find). This channel
 * resolves that automatically instead of handing it to a person, by following
 * every legitimate route from a social profile to a real domain:
 *
 *  1. the handle itself, turned into domain candidates,
 *  2. a targeted search for the handle, which surfaces both the domain and the
 *     "Website" field that search engines index from the social page, and
 *  3. the business's own link-in-bio page, which exists to be followed.
 *
 * Everything it finds goes through the same page-level matching as any other
 * candidate — nothing is accepted because a handle looks similar.
 *
 * What it deliberately does not do is fetch facebook.com or instagram.com.
 * Their terms forbid automated collection, and the pages are login-walled, so a
 * scraper would be both non-compliant and unreliable — and unreliable is worse
 * than slow here, because a login wall looks exactly like "no website found".
 */

/** How many profiles to work through, cheapest-first. */
const MAX_PROFILES = 3;
/** How many link-in-bio pages to follow. */
const MAX_LINK_PAGES = 2;
const MAX_SEARCH_RESULTS = 8;

export interface SocialInvestigation {
  result: ChannelResult;
  candidates: DiscoveredCandidate[];
  profiles: SocialProfile[];
  /** Link-in-bio pages that were followed, for the evidence trail. */
  linkPagesFollowed: string[];
}

export interface InvestigateSocialInput {
  identity: ResolvedIdentity;
  /** Social URLs from the business profile and from search results. */
  socialUrls: string[];
  search: WebSearchProvider;
  fetcher: HttpFetcher;
  /** Domains already queued by another channel, so nothing is fetched twice. */
  alreadySeen: Set<string>;
}

export async function investigateSocialProfiles(
  input: InvestigateSocialInput,
): Promise<SocialInvestigation> {
  const profiles = dedupeProfiles(input.socialUrls);

  if (profiles.length === 0) {
    return {
      result: {
        channel: 'social_profile',
        status: 'ok',
        detail: 'No social profiles were found for this business.',
        candidatesFound: 0,
      },
      candidates: [],
      profiles: [],
      linkPagesFollowed: [],
    };
  }

  // Profiles worth working on: Facebook and Instagram pages carry a business's
  // website field and link-in-bio far more often than the other platforms.
  const ranked = [...profiles].sort((a, b) => platformRank(a) - platformRank(b));
  const working = ranked.slice(0, MAX_PROFILES);

  const seen = new Set(input.alreadySeen);
  const candidates: DiscoveredCandidate[] = [];
  const linkPages = new Set<string>();
  const problems: string[] = [];
  const steps: string[] = [];

  const addCandidate = (url: string, origin: DiscoveredCandidate['origin'], note: string, declaredBy?: string) => {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    if (isSocialOrDirectoryHost(normalized) || isLinkInBioHost(normalized)) return;
    const domain = registrableDomain(normalized);
    if (!domain || seen.has(domain)) return;
    seen.add(domain);
    candidates.push({ url: normalized, channel: 'social_profile', origin, note, declaredBy });
  };

  // --- 1. Domains derived from each handle ---------------------------------
  for (const profile of working) {
    if (!profile.handle) continue;
    for (const guess of handleDomainCandidates(profile.handle)) {
      addCandidate(
        guess,
        'derived',
        `Domain derived from the ${profile.platform} handle "@${profile.handle}" — checked, not assumed.`,
      );
    }
  }
  const derivedCount = candidates.length;
  if (derivedCount > 0) steps.push(`${derivedCount} domain(s) derived from the handle(s)`);

  // --- 2. Targeted search for each handle ----------------------------------
  const searchable = working.filter((p) => p.handle !== null);
  if (searchable.length > 0) {
    if (!input.search.info.isAvailable) {
      return unresolved(
        profiles,
        [...linkPages],
        candidates,
        'unavailable',
        `${profiles.length} social profile(s) found, but no web search provider is configured, so the ` +
          'profiles could not be resolved to a website. ' +
          (input.search.info.unavailableReason ?? ''),
      );
    }

    for (const profile of searchable) {
      const query = `"${profile.handle}" ${input.identity.city ?? ''}`.trim();
      let results;
      try {
        results = await input.search.search(query, MAX_SEARCH_RESULTS);
      } catch (error) {
        const message = error instanceof ProviderError ? error.message : String(error);
        return unresolved(
          profiles,
          [...linkPages],
          candidates,
          'error',
          `Searching for the ${profile.platform} handle "@${profile.handle}" failed: ${message}`,
        );
      }

      for (const result of results) {
        const normalized = normalizeUrl(result.url);
        if (normalized && isLinkInBioHost(normalized)) {
          linkPages.add(normalized);
          continue;
        }
        if (normalized) {
          addCandidate(
            normalized,
            'found',
            `Found by searching for the ${profile.platform} handle "@${profile.handle}".`,
          );
        }
        // Search engines index the "Website" field shown on a social page, and
        // it turns up in the snippet. Reading our own provider's snippet needs
        // no access to the platform itself.
        for (const domain of extractDomainsFromText(`${result.title} ${result.snippet}`)) {
          if (isLinkInBioHost(`https://${domain}`)) {
            linkPages.add(`https://${domain}`);
            continue;
          }
          addCandidate(
            `https://${domain}`,
            'found',
            `Mentioned in the search result for the ${profile.platform} profile "@${profile.handle}".`,
          );
        }
      }
      steps.push(`searched for "@${profile.handle}"`);
    }
  }

  // --- 3. Follow the business's own link-in-bio pages ----------------------
  const toFollow = [...linkPages].slice(0, MAX_LINK_PAGES);
  for (const url of toFollow) {
    try {
      const page = await input.fetcher.fetchPage(url);
      const signals = extractPageSignals(page, input.identity.countryCode ?? 'DE');
      for (const link of signals.outboundLinks) {
        addCandidate(
          link,
          'declared',
          `Published on the business’s own link page (${registrableDomain(url) ?? url}).`,
          `The business links to this domain from its own link-in-bio page.`,
        );
      }
      steps.push(`followed ${registrableDomain(url) ?? url}`);
    } catch (error) {
      const message = error instanceof ProviderError ? error.message : String(error);
      // The business published a link page we could not read. Whatever it lists
      // is unknown, so the question stays open.
      return unresolved(
        profiles,
        [...linkPages],
        candidates,
        'error',
        `The link page ${registrableDomain(url) ?? url} could not be read (${message}), so the profile could not be resolved.`,
      );
    }
  }

  if (problems.length > 0) {
    return unresolved(profiles, [...linkPages], candidates, 'error', problems.join(' '));
  }

  return {
    result: {
      channel: 'social_profile',
      status: 'ok',
      detail:
        `${profiles.length} social profile(s) found (${profiles.map(describe).join(', ')}). ` +
        `Resolved by: ${steps.length > 0 ? steps.join('; ') : 'no handle to work from'}. ` +
        `${candidates.length} domain(s) to check. A social profile is not a website.`,
      candidatesFound: candidates.length,
    },
    candidates,
    profiles,
    linkPagesFollowed: toFollow,
  };
}

function unresolved(
  profiles: SocialProfile[],
  linkPages: string[],
  candidates: DiscoveredCandidate[],
  status: 'unavailable' | 'error',
  detail: string,
): SocialInvestigation {
  return {
    result: { channel: 'social_profile', status, detail, candidatesFound: candidates.length },
    candidates,
    profiles,
    linkPagesFollowed: linkPages,
  };
}

function dedupeProfiles(urls: string[]): SocialProfile[] {
  const byKey = new Map<string, SocialProfile>();
  for (const url of urls) {
    const profile = parseSocialProfile(url);
    if (!profile) continue;
    const key = `${profile.platform}:${profile.handle ?? profile.url}`;
    if (!byKey.has(key)) byKey.set(key, profile);
  }
  return [...byKey.values()];
}

function platformRank(profile: SocialProfile): number {
  switch (profile.platform) {
    case 'facebook':
      return 0;
    case 'instagram':
      return 1;
    case 'tiktok':
      return 2;
    default:
      return 3;
  }
}

function describe(profile: SocialProfile): string {
  return profile.handle ? `${profile.platform} @${profile.handle}` : profile.platform;
}
