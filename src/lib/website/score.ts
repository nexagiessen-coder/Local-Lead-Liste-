import { comparePhones, normalizePhone } from '@/lib/normalize/phone';
import { normalizeStreet, normalizePostalCode } from '@/lib/normalize/address';
import { normalizeText, tokenCoverage, distinctiveTokens } from '@/lib/normalize/text';
import { domainNameOverlap, registrableDomain } from '@/lib/normalize/domain';
import type { ResolvedIdentity } from '@/lib/identity/identity';
import type { CandidateDecision, CandidateSignal, WebsiteChannel } from '@/lib/types';
import type { CandidateOrigin } from './candidates';
import type { PageSignals } from './extract';

/**
 * Candidate scoring: does this page belong to *this* business?
 *
 * A domain is never accepted because its name looks similar. Acceptance
 * requires at least one strong signal — a matching phone number, a matching
 * street address, or the business's own profile declaring the domain — and
 * contradicting signals push the score down hard.
 */

export const WEIGHTS = {
  phoneMatch: 45,
  postalMatch: 20,
  streetMatch: 15,
  cityMatch: 8,
  nameMatchFull: 20,
  nameMatchPartial: 10,
  structuredMatch: 12,
  domainOverlap: 8,
  /** The business itself published this link — on its profile or its link page. */
  declaredLink: 20,
  phoneConflict: -40,
  postalConflict: -20,
  nameAbsent: -15,
} as const;

export const ACCEPT_THRESHOLD = 70;
export const PROBABLE_THRESHOLD = 45;

/** Signals strong enough to carry an acceptance on their own merit. */
const STRONG_SIGNAL_KEYS = new Set(['phone_match', 'address_match', 'declared_link']);

export interface ScoreInput {
  identity: ResolvedIdentity;
  signals: PageSignals;
  channel: WebsiteChannel;
  /** Whether the business published this link, a third party surfaced it, or we derived it. */
  origin: CandidateOrigin;
  /** Wording for the "declared" signal, when the business published the link. */
  declaredBy?: string;
  url: string;
  finalUrl: string;
  redirects: string[];
  httpStatus: number;
}

export interface ScoreOutput {
  score: number;
  decision: CandidateDecision;
  decisionReason: string;
  signals: CandidateSignal[];
  hasStrongSignal: boolean;
  conflicts: string[];
}

export function scoreCandidate(input: ScoreInput): ScoreOutput {
  const { identity, signals } = input;
  const out: CandidateSignal[] = [];
  const conflicts: string[] = [];
  let score = 0;

  // --- Hard rejections -----------------------------------------------------
  if (input.httpStatus >= 400) {
    return reject(`The page returned HTTP ${input.httpStatus}.`, out, conflicts);
  }
  if (signals.isParked) {
    return reject('The domain shows a parked / for-sale placeholder, not a business website.', out, conflicts);
  }
  if (signals.isEmpty) {
    return reject('The page contained no readable content.', out, conflicts);
  }

  // --- Phone ---------------------------------------------------------------
  const phoneComparisons = signals.phones.map((p) => comparePhones(identity.phoneE164, p));
  if (identity.phoneE164 && signals.phones.length > 0) {
    if (phoneComparisons.includes('match')) {
      score += WEIGHTS.phoneMatch;
      out.push({
        key: 'phone_match',
        label: 'Phone number matches',
        points: WEIGHTS.phoneMatch,
        detail: `${identity.phoneE164} appears on the page.`,
      });
    } else if (phoneComparisons.every((c) => c === 'mismatch')) {
      score += WEIGHTS.phoneConflict;
      const conflict = `The page lists ${signals.phones.slice(0, 2).join(', ')} but this business is ${identity.phoneE164}.`;
      conflicts.push(conflict);
      out.push({
        key: 'phone_conflict',
        label: 'Different phone number on the page',
        points: WEIGHTS.phoneConflict,
        detail: conflict,
      });
    }
  }

  // --- Address -------------------------------------------------------------
  const businessPostal = normalizePostalCode(identity.postalCode);
  let postalMatched = false;
  if (businessPostal && signals.postalCodes.length > 0) {
    if (signals.postalCodes.includes(businessPostal)) {
      postalMatched = true;
      score += WEIGHTS.postalMatch;
      out.push({
        key: 'postal_match',
        label: 'Postal code matches',
        points: WEIGHTS.postalMatch,
        detail: `${businessPostal} appears on the page.`,
      });
    } else {
      score += WEIGHTS.postalConflict;
      const conflict = `The page lists postal code(s) ${signals.postalCodes.slice(0, 3).join(', ')} but this business is in ${businessPostal}.`;
      conflicts.push(conflict);
      out.push({
        key: 'postal_conflict',
        label: 'Different postal code on the page',
        points: WEIGHTS.postalConflict,
        detail: conflict,
      });
    }
  }

  let streetMatched = false;
  if (identity.street) {
    const streetKey = normalizeStreet(identity.street);
    const streetHead = streetKey.split(' ')[0] ?? '';
    if (streetHead.length >= 4 && signals.normalizedText.includes(streetHead)) {
      streetMatched = true;
      score += WEIGHTS.streetMatch;
      out.push({
        key: 'street_match',
        label: 'Street matches',
        points: WEIGHTS.streetMatch,
        detail: `"${identity.street}" appears on the page.`,
      });
    }
  }

  if (identity.city) {
    const cityKey = normalizeText(identity.city).split(' ')[0] ?? '';
    if (cityKey.length >= 3 && signals.normalizedText.includes(cityKey)) {
      score += WEIGHTS.cityMatch;
      out.push({
        key: 'city_match',
        label: 'City matches',
        points: WEIGHTS.cityMatch,
        detail: `"${identity.city}" appears on the page.`,
      });
    }
  }

  // --- Name ----------------------------------------------------------------
  const haystack = `${signals.title ?? ''} ${signals.text}`;
  const coverage = tokenCoverage(identity.name, haystack);
  const nameTokens = distinctiveTokens(identity.name);
  if (nameTokens.length > 0) {
    if (coverage >= 0.8) {
      score += WEIGHTS.nameMatchFull;
      out.push({
        key: 'name_match',
        label: 'Business name on the page',
        points: WEIGHTS.nameMatchFull,
        detail: `All distinctive name parts (${nameTokens.join(', ')}) appear on the page.`,
      });
    } else if (coverage >= 0.5) {
      score += WEIGHTS.nameMatchPartial;
      out.push({
        key: 'name_match_partial',
        label: 'Business name partly on the page',
        points: WEIGHTS.nameMatchPartial,
        detail: `${Math.round(coverage * 100)}% of the distinctive name parts appear on the page.`,
      });
    } else {
      score += WEIGHTS.nameAbsent;
      out.push({
        key: 'name_absent',
        label: 'Business name not found on the page',
        points: WEIGHTS.nameAbsent,
        detail: `Looked for: ${nameTokens.join(', ')}.`,
      });
    }
  }

  // --- Structured data -----------------------------------------------------
  const structuredHit = signals.structured.find((entry) => {
    const sameName = entry.name ? tokenCoverage(identity.name, entry.name) >= 0.6 : false;
    const samePhone = entry.telephone
      ? comparePhones(identity.phoneE164, normalizeMaybePhone(entry.telephone, identity.countryCode)) === 'match'
      : false;
    const samePostal = entry.postalCode
      ? normalizePostalCode(entry.postalCode) === businessPostal
      : false;
    return sameName && (samePhone || samePostal);
  });
  if (structuredHit) {
    score += WEIGHTS.structuredMatch;
    out.push({
      key: 'structured_match',
      label: 'Structured business data matches',
      points: WEIGHTS.structuredMatch,
      detail: `schema.org ${structuredHit.type} on the page names this business with a matching phone or postal code.`,
    });
  }

  // --- Domain name ---------------------------------------------------------
  const domain = registrableDomain(input.finalUrl) ?? registrableDomain(input.url);
  if (domain) {
    const overlap = domainNameOverlap(domain, identity.name);
    if (overlap >= 0.5) {
      score += WEIGHTS.domainOverlap;
      out.push({
        key: 'domain_overlap',
        label: 'Domain contains the business name',
        points: WEIGHTS.domainOverlap,
        detail: `${domain} contains ${Math.round(overlap * 100)}% of the name parts. Supporting signal only.`,
      });
    }
  }

  // --- Declared by the business itself -------------------------------------
  // The business profile's website field, or a link the business publishes on
  // its own link-in-bio page. Both are the business pointing at its own site.
  if (input.origin === 'declared') {
    score += WEIGHTS.declaredLink;
    out.push({
      key: 'declared_link',
      label: 'Published by the business as its own link',
      points: WEIGHTS.declaredLink,
      detail: input.declaredBy ?? 'The business publishes this domain as its own.',
    });
  }

  if (input.redirects.length > 0) {
    out.push({
      key: 'redirect',
      label: 'Followed redirect',
      points: 0,
      detail: `${input.url} → ${input.finalUrl}`,
    });
  }

  const hasStrongSignal =
    out.some((s) => STRONG_SIGNAL_KEYS.has(s.key) && s.points > 0) ||
    (postalMatched && streetMatched);
  if (postalMatched && streetMatched) {
    out.push({
      key: 'address_match',
      label: 'Full address matches',
      points: 0,
      detail: 'Both the street and the postal code of this business appear on the page.',
    });
  }

  // --- Decision ------------------------------------------------------------
  if (signals.isPlaceholder) {
    return {
      score: Math.min(score, PROBABLE_THRESHOLD),
      decision: 'PROBABLE',
      decisionReason:
        'The page looks like a "coming soon" placeholder. A domain exists but there may be no live website yet — needs a human look.',
      signals: out,
      hasStrongSignal,
      conflicts,
    };
  }

  if (conflicts.length > 0 && score < ACCEPT_THRESHOLD) {
    return {
      score,
      decision: 'REJECTED',
      decisionReason: `Contradicting information: ${conflicts.join(' ')}`,
      signals: out,
      hasStrongSignal,
      conflicts,
    };
  }

  if (score >= ACCEPT_THRESHOLD && hasStrongSignal) {
    return {
      score,
      decision: 'ACCEPTED',
      decisionReason: 'Strong match: the page carries this business’s own contact details.',
      signals: out,
      hasStrongSignal,
      conflicts,
    };
  }

  if (score >= PROBABLE_THRESHOLD) {
    return {
      score,
      decision: 'PROBABLE',
      decisionReason: hasStrongSignal
        ? 'Matching details found, but not enough to be certain.'
        : 'Only weak signals (name or domain similarity) — not enough to confirm ownership.',
      signals: out,
      hasStrongSignal,
      conflicts,
    };
  }

  return {
    score,
    decision: 'REJECTED',
    decisionReason: 'The page does not carry enough of this business’s details to link it to them.',
    signals: out,
    hasStrongSignal,
    conflicts,
  };
}

function reject(reason: string, signals: CandidateSignal[], conflicts: string[]): ScoreOutput {
  return { score: 0, decision: 'REJECTED', decisionReason: reason, signals, hasStrongSignal: false, conflicts };
}

/** Phone numbers inside JSON-LD are free-form; parse them properly. */
function normalizeMaybePhone(value: string, defaultCountry: string | null): string | null {
  return normalizePhone(value, defaultCountry ?? 'DE')?.e164 ?? null;
}
