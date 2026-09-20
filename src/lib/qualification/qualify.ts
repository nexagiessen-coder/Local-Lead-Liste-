import type { Business, QualificationResult, WebsiteStatus } from '@/lib/types';

/**
 * Qualification: may this business be offered as a "no website" prospect?
 *
 * Qualification never runs automatically into the lead list — it produces a
 * recommendation that a human acts on. The rules are intentionally strict:
 * a single unmet condition blocks qualification.
 */

export interface QualifiableBusiness {
  identityStatus: Business['identityStatus'];
  identityConfidence: number;
  websiteStatus: WebsiteStatus;
  websiteConfidence: number | null;
  phoneE164: string | null;
  excludedAt: number | null;
}

export const MIN_WEBSITE_CONFIDENCE = 70;
export const MIN_IDENTITY_CONFIDENCE = 70;

export function qualifyBusiness(business: QualifiableBusiness): QualificationResult {
  const reasons: string[] = [];
  const blockers: string[] = [];

  if (business.excludedAt !== null) {
    blockers.push('This business has been excluded from prospecting.');
  }

  if (business.identityStatus === 'CONFIRMED') {
    reasons.push(`Identity confirmed (${business.identityConfidence}/100).`);
  } else {
    blockers.push(`Identity is "${business.identityStatus.toLowerCase().replace('_', ' ')}" — it must be confirmed first.`);
  }

  if (business.identityConfidence < MIN_IDENTITY_CONFIDENCE) {
    blockers.push(`Identity confidence ${business.identityConfidence} is below the required ${MIN_IDENTITY_CONFIDENCE}.`);
  }

  switch (business.websiteStatus) {
    case 'VERIFIED_NO_WEBSITE':
      reasons.push('Verified as having no website.');
      break;
    case 'VERIFIED_WEBSITE':
    case 'PROBABLE_WEBSITE':
      blockers.push('This business already has a website.');
      break;
    case 'WEBSITE_UNCERTAIN':
    case 'REQUIRES_MANUAL_CHECK':
      blockers.push('Website status needs a manual check before this can be a lead.');
      break;
    case 'IDENTITY_UNVERIFIED':
      blockers.push('Website status was not determined because the identity is unverified.');
      break;
    default:
      blockers.push('Website status has not been checked yet.');
  }

  if ((business.websiteConfidence ?? 0) < MIN_WEBSITE_CONFIDENCE && business.websiteStatus === 'VERIFIED_NO_WEBSITE') {
    blockers.push(`Website confidence ${business.websiteConfidence ?? 0} is below the required ${MIN_WEBSITE_CONFIDENCE}.`);
  }

  if (!business.phoneE164) {
    blockers.push('No usable phone number — the lead cannot be called.');
  } else {
    reasons.push('Has a callable phone number.');
  }

  return {
    qualifies: blockers.length === 0,
    reasons,
    blockers,
    checkedAt: Date.now(),
  };
}

/** Short explanation shown in the pool table. */
export function qualificationSummary(result: QualificationResult): string {
  if (result.qualifies) return 'Qualifies as a no-website prospect.';
  return result.blockers[0] ?? 'Does not qualify.';
}

/**
 * A two-or-three word label for the narrow "Qualifies" column. The full reason
 * stays available as the badge's tooltip, so nothing is hidden — only shortened.
 */
export function qualificationShortLabel(result: QualificationResult): string {
  if (result.qualifies) return 'Qualifies';
  const first = result.blockers[0] ?? '';
  if (first.includes('already has a website')) return 'Has website';
  if (first.includes('manual check')) return 'Needs check';
  if (first.includes('phone')) return 'No phone';
  if (first.includes('identity') || first.includes('Identity')) return 'Identity';
  if (first.includes('excluded')) return 'Excluded';
  if (first.includes('not been checked')) return 'Not checked';
  return 'No';
}
