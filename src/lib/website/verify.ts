import { env } from '@/lib/env';
import { newId } from '@/lib/ids';
import { registrableDomain } from '@/lib/normalize/domain';
import { ProviderError, type HttpFetcher, type WebSearchProvider } from '@/lib/providers/types';
import type { ResolvedIdentity } from '@/lib/identity/identity';
import type {
  CandidateDecision,
  ChannelResult,
  EvidenceItem,
  WebsiteCandidate,
  WebsiteStatus,
} from '@/lib/types';
import {
  directoryChannel,
  domainGuessChannel,
  providerFieldChannel,
  searchEngineChannel,
  socialProfileChannel,
  type DiscoveredCandidate,
} from './candidates';
import { extractPageSignals } from './extract';
import { scoreCandidate } from './score';

export const ENGINE_VERSION = 'website-verify/1.0.0';

/** Upper bound on page fetches per business, for cost and politeness. */
const MAX_FETCHES = 10;

/** Below this confidence a "no website" conclusion is downgraded to manual check. */
const NO_WEBSITE_MIN_CONFIDENCE = 70;

export interface VerifyInput {
  identity: ResolvedIdentity;
  providerWebsite: string | null;
  providerSocialUrls?: string[];
  search: WebSearchProvider;
  fetcher: HttpFetcher;
  /** Overrides `env.minChannelsForNoWebsite` in tests. */
  minChannelsForNoWebsite?: number;
}

export interface VerifyResult {
  status: WebsiteStatus;
  confidence: number;
  acceptedUrl: string | null;
  channels: ChannelResult[];
  candidates: WebsiteCandidate[];
  evidence: EvidenceItem[];
  summary: string;
  startedAt: number;
  finishedAt: number;
  engineVersion: string;
}

/**
 * Determines a business's website status.
 *
 * The engine is built around one rule: absence of evidence is only evidence of
 * absence when every channel actually ran. Anything else ends in a status that
 * asks a human to look.
 */
export async function verifyWebsite(input: VerifyInput): Promise<VerifyResult> {
  const startedAt = Date.now();
  const { identity } = input;
  const minChannels = input.minChannelsForNoWebsite ?? env.minChannelsForNoWebsite;
  const evidence: EvidenceItem[] = [];

  // --- Gate 1: identity ----------------------------------------------------
  evidence.push({
    kind: 'identity',
    statement: identityStatement(identity),
    detail: identity.signals
      .filter((s) => s.present)
      .map((s) => `${s.label}: ${s.value ?? 'yes'}`)
      .join(' · '),
    sourceLabel: 'Identity verification',
    sourceUrl: null,
    stance: identity.status === 'CONFIRMED' ? 'supports' : 'neutral',
  });

  if (identity.status === 'UNVERIFIED' || identity.status === 'NEEDS_REVIEW') {
    return {
      status: 'IDENTITY_UNVERIFIED',
      confidence: identity.confidence,
      acceptedUrl: null,
      channels: [],
      candidates: [],
      evidence,
      summary:
        'Website status was not determined because the business identity could not be confirmed. ' +
        'Confirm the business first — an unverified identity cannot produce a trustworthy website result.',
      startedAt,
      finishedAt: Date.now(),
      engineVersion: ENGINE_VERSION,
    };
  }

  // --- Channels ------------------------------------------------------------
  const providerOutcome = providerFieldChannel(identity, input.providerWebsite, input.providerSocialUrls ?? []);
  const searchOutcome = await searchEngineChannel(identity, input.search);

  const seenDomains = new Set<string>();
  for (const candidate of [...providerOutcome.candidates, ...searchOutcome.candidates]) {
    const domain = registrableDomain(candidate.url);
    if (domain) seenDomains.add(domain);
  }

  const guessOutcome = domainGuessChannel(identity, seenDomains);
  const socialProfiles = [...new Set([...providerOutcome.socialProfiles, ...searchOutcome.socialProfiles])];
  const socialOutcome = socialProfileChannel(socialProfiles);
  const directoryListings = [...new Set(searchOutcome.directoryListings)];
  const directoryOutcome = directoryChannel(directoryListings);

  const channels: ChannelResult[] = [
    providerOutcome.result,
    searchOutcome.result,
    guessOutcome.result,
    socialOutcome.result,
    directoryOutcome.result,
  ];

  /** True when the business profile nominated a social page as its website. */
  const profileDeclaredSocial = providerOutcome.result.detail?.includes('social media page') ?? false;

  // --- Evaluate candidates -------------------------------------------------
  const queue: DiscoveredCandidate[] = dedupeByDomain([
    ...providerOutcome.candidates,
    ...searchOutcome.candidates,
    ...guessOutcome.candidates,
  ]);

  const candidates: WebsiteCandidate[] = [];
  for (const item of queue.slice(0, MAX_FETCHES)) {
    candidates.push(await evaluateCandidate(item, input));
  }

  const accepted = candidates.filter((c) => c.decision === 'ACCEPTED').sort((a, b) => b.score - a.score);
  const probable = candidates.filter((c) => c.decision === 'PROBABLE').sort((a, b) => b.score - a.score);
  /** A declared or searched site we could not reach — its existence is unresolved. */
  const unreachableImportant = candidates.filter(
    (c) => c.decision === 'UNREACHABLE' && c.sourceChannel !== 'domain_guess',
  );
  /** Rejected, but mentions the business and contradicts nothing: still open. */
  const ambiguous = candidates.filter(
    (c) =>
      c.decision === 'REJECTED' &&
      c.score > 0 &&
      !c.signals.some((s) => s.points < 0) &&
      c.signals.some((s) => s.key === 'name_match' || s.key === 'name_match_partial'),
  );
  const parkedDeclared = candidates.filter(
    (c) => c.sourceChannel === 'provider_field' && c.decisionReason.includes('parked'),
  );

  for (const candidate of candidates) evidence.push(candidateEvidence(candidate));
  for (const channel of channels) evidence.push(channelEvidence(channel));
  for (const profile of socialProfiles) {
    evidence.push({
      kind: 'social_profile',
      statement: 'Social media profile found.',
      detail: 'A social profile is not a website. It was not used to confirm or rule out a website.',
      sourceLabel: registrableDomain(profile) ?? 'social',
      sourceUrl: profile,
      stance: 'neutral',
    });
  }
  for (const listing of directoryListings.slice(0, 5)) {
    evidence.push({
      kind: 'directory_listing',
      statement: 'Directory listing found.',
      detail: 'Directory pages are not fetched; the listing only shows the business exists.',
      sourceLabel: registrableDomain(listing) ?? 'directory',
      sourceUrl: listing,
      stance: 'neutral',
    });
  }

  const blockingChannels = channels.filter((c) => c.status === 'unavailable' || c.status === 'error');
  const okChannels = channels.filter((c) => c.status === 'ok');

  // --- Status resolution ---------------------------------------------------
  const finish = (status: WebsiteStatus, confidence: number, acceptedUrl: string | null, summary: string): VerifyResult => ({
    status,
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    acceptedUrl,
    channels,
    candidates,
    evidence,
    summary,
    startedAt,
    finishedAt: Date.now(),
    engineVersion: ENGINE_VERSION,
  });

  const best = accepted[0];
  if (best) {
    if (identity.status !== 'CONFIRMED') {
      return finish(
        'PROBABLE_WEBSITE',
        Math.min(best.score, 69),
        best.finalUrl ?? best.url,
        `${best.domain} matches this business, but the business identity itself is only probable, so the link is not certain.`,
      );
    }
    return finish(
      'VERIFIED_WEBSITE',
      best.score,
      best.finalUrl ?? best.url,
      `${best.domain} carries this business’s own contact details. ${best.decisionReason}`,
    );
  }

  const bestProbable = probable[0];
  if (bestProbable) {
    return finish(
      'PROBABLE_WEBSITE',
      Math.min(bestProbable.score, 69),
      bestProbable.finalUrl ?? bestProbable.url,
      `${bestProbable.domain} may belong to this business but could not be confirmed. ${bestProbable.decisionReason}`,
    );
  }

  if (unreachableImportant.length > 0) {
    return finish(
      'REQUIRES_MANUAL_CHECK',
      40,
      null,
      `A website was referenced but could not be reached (${unreachableImportant.map((c) => c.domain).join(', ')}). ` +
        'A site that is temporarily down is not a site that does not exist.',
    );
  }

  if (parkedDeclared.length > 0) {
    return finish(
      'REQUIRES_MANUAL_CHECK',
      45,
      null,
      `The business profile lists ${parkedDeclared.map((c) => c.domain).join(', ')}, but that domain shows a parked page. ` +
        'The conflict needs a human decision.',
    );
  }

  if (profileDeclaredSocial) {
    return finish(
      'REQUIRES_MANUAL_CHECK',
      45,
      null,
      'The business profile nominates a social media page as its website. That page may or may not link to a real site, ' +
        'so this business is not counted as "no website" without a human check.',
    );
  }

  if (ambiguous.length > 0) {
    return finish(
      'WEBSITE_UNCERTAIN',
      40,
      null,
      `Found page(s) mentioning this business (${ambiguous.map((c) => c.domain).join(', ')}) without enough matching ` +
        'contact details to confirm ownership. Needs a human look.',
    );
  }

  if (blockingChannels.length > 0) {
    return finish(
      'REQUIRES_MANUAL_CHECK',
      30,
      null,
      `Not every research channel completed (${blockingChannels
        .map((c) => `${c.channel}: ${c.status}`)
        .join(', ')}). No website was found, but absence cannot be proven from an incomplete search.`,
    );
  }

  if (identity.status !== 'CONFIRMED') {
    return finish(
      'REQUIRES_MANUAL_CHECK',
      35,
      null,
      'No website was found, but the business identity is only probable. A "no website" result requires a confirmed identity.',
    );
  }

  if (okChannels.length < minChannels) {
    return finish(
      'REQUIRES_MANUAL_CHECK',
      35,
      null,
      `Only ${okChannels.length} research channel(s) completed; at least ${minChannels} are required before a business ` +
        'can be recorded as having no website.',
    );
  }

  // --- "No website" — the only conclusion that needs everything to line up --
  let confidence = 90;
  if (okChannels.length >= 3) confidence += 5;
  if (socialProfiles.length > 0) confidence -= 12;

  if (confidence < NO_WEBSITE_MIN_CONFIDENCE) {
    return finish('REQUIRES_MANUAL_CHECK', confidence, null, 'Evidence for "no website" did not reach the required confidence.');
  }

  evidence.push({
    kind: 'conclusion',
    statement: 'No official website found by any completed channel.',
    detail:
      `Identity confirmed · ${okChannels.length} channel(s) completed · ` +
      `${candidates.length} candidate domain(s) checked and ruled out.`,
    sourceLabel: 'Verification engine',
    sourceUrl: null,
    stance: 'supports',
  });

  return finish(
    'VERIFIED_NO_WEBSITE',
    confidence,
    null,
    `Identity confirmed and ${okChannels.length} research channel(s) completed without finding an official website. ` +
      `${candidates.length} candidate domain(s) were checked and ruled out.` +
      (socialProfiles.length > 0 ? ' A social profile exists but is not a website.' : ''),
  );
}

async function evaluateCandidate(item: DiscoveredCandidate, input: VerifyInput): Promise<WebsiteCandidate> {
  const domain = registrableDomain(item.url) ?? item.url;
  try {
    const page = await input.fetcher.fetchPage(item.url);
    const signals = extractPageSignals(page, input.identity.countryCode ?? 'DE');
    const scored = scoreCandidate({
      identity: input.identity,
      signals,
      channel: item.channel,
      url: item.url,
      finalUrl: page.finalUrl,
      redirects: page.redirects,
      httpStatus: page.status,
    });
    return {
      url: item.url,
      finalUrl: page.finalUrl,
      domain: registrableDomain(page.finalUrl) ?? domain,
      sourceChannel: item.channel,
      score: scored.score,
      decision: scored.decision,
      decisionReason: `${scored.decisionReason} (${item.note})`,
      signals: scored.signals,
      httpStatus: page.status,
      fetchedAt: page.fetchedAt,
    };
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : String(error);
    const retryable = error instanceof ProviderError ? error.retryable : true;
    // A guessed domain that does not resolve is simply not a website.
    // A declared or searched URL that fails is an unresolved question.
    const decision: CandidateDecision =
      item.channel === 'domain_guess' && !retryable ? 'REJECTED' : 'UNREACHABLE';
    return {
      url: item.url,
      finalUrl: null,
      domain,
      sourceChannel: item.channel,
      score: 0,
      decision,
      decisionReason:
        decision === 'REJECTED'
          ? `No website is hosted at this derived domain (${message}).`
          : `Could not be reached: ${message}. This is not proof that no website exists.`,
      signals: [],
      httpStatus: null,
      fetchedAt: Date.now(),
    };
  }
}

function dedupeByDomain(items: DiscoveredCandidate[]): DiscoveredCandidate[] {
  const seen = new Set<string>();
  const out: DiscoveredCandidate[] = [];
  for (const item of items) {
    const domain = registrableDomain(item.url);
    const key = domain ?? item.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function identityStatement(identity: ResolvedIdentity): string {
  switch (identity.status) {
    case 'CONFIRMED':
      return `Business identity confirmed (${identity.confidence}/100).`;
    case 'PROBABLE':
      return `Business identity probable but not confirmed (${identity.confidence}/100).`;
    case 'NEEDS_REVIEW':
      return 'Business identity has conflicting information and needs review.';
    default:
      return `Business identity could not be verified (${identity.confidence}/100).`;
  }
}

function candidateEvidence(candidate: WebsiteCandidate): EvidenceItem {
  const stance =
    candidate.decision === 'ACCEPTED'
      ? 'supports'
      : candidate.decision === 'REJECTED' && candidate.signals.some((s) => s.points < 0)
        ? 'contradicts'
        : 'neutral';
  return {
    kind: `candidate_${candidate.decision.toLowerCase()}`,
    statement: `${candidate.domain}: ${candidate.decision.toLowerCase()}`,
    detail: candidate.decisionReason,
    sourceLabel: candidate.sourceChannel,
    sourceUrl: candidate.finalUrl ?? candidate.url,
    stance,
  };
}

function channelEvidence(channel: ChannelResult): EvidenceItem {
  return {
    kind: `channel_${channel.channel}`,
    statement: `${channel.channel.replace(/_/g, ' ')}: ${channel.status}`,
    detail: channel.detail,
    sourceLabel: 'Research channel',
    sourceUrl: null,
    stance: channel.status === 'ok' ? 'neutral' : 'contradicts',
  };
}

export function newVerificationId(): string {
  return newId('ver');
}
