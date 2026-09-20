import { describe, it, expect } from 'vitest';
import { qualifyBusiness, qualificationShortLabel } from '@/lib/qualification/qualify';
import type { QualifiableBusiness } from '@/lib/qualification/qualify';

function business(overrides: Partial<QualifiableBusiness> = {}): QualifiableBusiness {
  return {
    identityStatus: 'CONFIRMED',
    identityConfidence: 87,
    websiteStatus: 'VERIFIED_NO_WEBSITE',
    websiteConfidence: 95,
    phoneE164: '+496411234502',
    excludedAt: null,
    ...overrides,
  };
}

describe('qualification', () => {
  it('qualifies a verified, callable, confirmed business', () => {
    const result = qualifyBusiness(business());
    expect(result.qualifies).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('refuses a business that has a website', () => {
    expect(qualifyBusiness(business({ websiteStatus: 'VERIFIED_WEBSITE' })).qualifies).toBe(false);
    expect(qualifyBusiness(business({ websiteStatus: 'PROBABLE_WEBSITE' })).qualifies).toBe(false);
  });

  it('refuses anything that still needs a manual check', () => {
    for (const status of ['REQUIRES_MANUAL_CHECK', 'WEBSITE_UNCERTAIN', 'IDENTITY_UNVERIFIED', 'NOT_CHECKED'] as const) {
      const result = qualifyBusiness(business({ websiteStatus: status }));
      expect(result.qualifies, status).toBe(false);
    }
  });

  it('refuses an unconfirmed identity even with a no-website result', () => {
    expect(qualifyBusiness(business({ identityStatus: 'PROBABLE', identityConfidence: 60 })).qualifies).toBe(false);
    expect(qualifyBusiness(business({ identityStatus: 'NEEDS_REVIEW' })).qualifies).toBe(false);
  });

  it('refuses a low-confidence no-website result', () => {
    const result = qualifyBusiness(business({ websiteConfidence: 55 }));
    expect(result.qualifies).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/confidence/i);
  });

  it('refuses a business with no phone number', () => {
    const result = qualifyBusiness(business({ phoneE164: null }));
    expect(result.qualifies).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/phone/i);
  });

  it('refuses an excluded business', () => {
    expect(qualifyBusiness(business({ excludedAt: Date.now() })).qualifies).toBe(false);
  });

  it('gives a short label for the table', () => {
    expect(qualificationShortLabel(qualifyBusiness(business()))).toBe('Qualifies');
    expect(qualificationShortLabel(qualifyBusiness(business({ websiteStatus: 'VERIFIED_WEBSITE' })))).toBe('Has website');
    expect(qualificationShortLabel(qualifyBusiness(business({ websiteStatus: 'REQUIRES_MANUAL_CHECK' })))).toBe('Needs check');
    expect(qualificationShortLabel(qualifyBusiness(business({ phoneE164: null })))).toBe('No phone');
  });
});
