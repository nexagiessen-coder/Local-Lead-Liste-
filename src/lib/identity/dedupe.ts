import { comparePhones } from '@/lib/normalize/phone';
import { nameSimilarity } from '@/lib/normalize/text';
import { distanceMeters } from '@/lib/normalize/geo';
import type { ResolvedIdentity } from './identity';

/**
 * Deduplication.
 *
 * Two opposite mistakes must both be avoided:
 *  - creating several leads for one business (spelling variants, duplicate
 *    directory entries, repeated research), and
 *  - merging two genuinely different businesses that happen to share a name.
 *
 * The rules below therefore require a *strong* shared signal (phone or address)
 * before declaring a match, and treat a shared name with conflicting strong
 * signals as a separate business (a branch), not a duplicate.
 */

export type MatchKind = 'same' | 'branch' | 'review' | 'none';

export interface MatchCandidate {
  id: string;
  name: string;
  phoneE164: string | null;
  dedupeKeyAddress: string | null;
  postalCode: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
}

export interface MatchResult {
  kind: MatchKind;
  businessId: string | null;
  reason: string;
  score: number;
}

/** Distance under which two records may describe the same shopfront. */
export const SAME_LOCATION_METERS = 60;

export const NAME_SIMILARITY_SAME_ADDRESS = 0.6;
export const NAME_SIMILARITY_SAME_POINT = 0.85;
/** Below this, a shared phone number is suspicious rather than confirming. */
export const NAME_SIMILARITY_SAME_PHONE = 0.4;

const NO_MATCH: MatchResult = {
  kind: 'none',
  businessId: null,
  reason: 'No existing business shares a strong identity signal.',
  score: 0,
};

/**
 * Compares a freshly resolved identity against existing businesses.
 * `candidates` should be pre-filtered by the caller (same phone, same address
 * key, or nearby coordinates) — this function makes the decision.
 */
export function matchExistingBusiness(
  identity: ResolvedIdentity,
  candidates: MatchCandidate[],
): MatchResult {
  if (candidates.length === 0) return NO_MATCH;

  const results: MatchResult[] = [];

  for (const candidate of candidates) {
    const similarity = nameSimilarity(identity.name, candidate.name);
    const phone = comparePhones(identity.phoneE164, candidate.phoneE164);
    const sameAddress =
      identity.dedupeKeyAddress !== null && identity.dedupeKeyAddress === candidate.dedupeKeyAddress;

    const metres =
      identity.lat !== null && identity.lon !== null && candidate.lat !== null && candidate.lon !== null
        ? distanceMeters({ lat: identity.lat, lon: identity.lon }, { lat: candidate.lat, lon: candidate.lon })
        : null;

    // Rule 1 — identical phone number.
    if (phone === 'match') {
      if (similarity >= NAME_SIMILARITY_SAME_PHONE) {
        results.push({
          kind: 'same',
          businessId: candidate.id,
          reason: `Same phone number (${identity.phoneE164}) and matching name ("${candidate.name}").`,
          score: 100,
        });
        continue;
      }
      // Shared number, unrelated names: could be a shared reception desk.
      results.push({
        kind: 'review',
        businessId: candidate.id,
        reason: `Shares the phone number ${identity.phoneE164} with "${candidate.name}" but the names differ. Needs a human decision.`,
        score: 60,
      });
      continue;
    }

    // Rule 2 — identical street address.
    if (sameAddress) {
      if (phone === 'mismatch' && similarity < NAME_SIMILARITY_SAME_ADDRESS) {
        // Same building, different business (very common in city centres).
        results.push({
          kind: 'none',
          businessId: candidate.id,
          reason: `Same address as "${candidate.name}" but a different phone number and name — treated as a different business.`,
          score: 0,
        });
        continue;
      }
      if (similarity >= NAME_SIMILARITY_SAME_ADDRESS) {
        results.push({
          kind: 'same',
          businessId: candidate.id,
          reason: `Same street address and closely matching name ("${candidate.name}", ${(similarity * 100).toFixed(0)}% similar).`,
          score: 90,
        });
        continue;
      }
    }

    // Rule 3 — same point on the map with a near-identical name.
    if (metres !== null && metres <= SAME_LOCATION_METERS && similarity >= NAME_SIMILARITY_SAME_POINT) {
      if (phone === 'mismatch') {
        results.push({
          kind: 'review',
          businessId: candidate.id,
          reason: `Within ${Math.round(metres)} m of "${candidate.name}" with a nearly identical name, but the phone numbers differ.`,
          score: 55,
        });
        continue;
      }
      results.push({
        kind: 'same',
        businessId: candidate.id,
        reason: `Within ${Math.round(metres)} m of "${candidate.name}" with a nearly identical name.`,
        score: 80,
      });
      continue;
    }

    // Rule 4 — same brand, different location: a separate business (branch).
    if (similarity >= NAME_SIMILARITY_SAME_POINT) {
      const differentPlace =
        (phone === 'mismatch') ||
        (identity.dedupeKeyAddress !== null &&
          candidate.dedupeKeyAddress !== null &&
          identity.dedupeKeyAddress !== candidate.dedupeKeyAddress) ||
        (metres !== null && metres > SAME_LOCATION_METERS);

      if (differentPlace) {
        results.push({
          kind: 'branch',
          businessId: candidate.id,
          reason: `Same name as "${candidate.name}" in ${candidate.city ?? 'another location'}, but a different address or phone number — kept as a separate location.`,
          score: 40,
        });
        continue;
      }

      // Same name, no distinguishing signal at all: cannot decide safely.
      results.push({
        kind: 'review',
        businessId: candidate.id,
        reason: `Nearly identical name to "${candidate.name}" with no address or phone number to tell them apart.`,
        score: 50,
      });
    }
  }

  if (results.length === 0) return NO_MATCH;

  // Priority: a confirmed duplicate wins; otherwise a review flag; then branch.
  const same = results.filter((r) => r.kind === 'same').sort((a, b) => b.score - a.score)[0];
  if (same) return same;
  const review = results.filter((r) => r.kind === 'review').sort((a, b) => b.score - a.score)[0];
  if (review) return review;
  const branch = results.filter((r) => r.kind === 'branch').sort((a, b) => b.score - a.score)[0];
  if (branch) return branch;
  return { ...NO_MATCH, reason: results[0]?.reason ?? NO_MATCH.reason };
}
