import { describe, it, expect } from 'vitest';
import { verifyWebsite } from '@/lib/website/verify';
import { NoWebSearchProvider } from '@/lib/providers/search/none';
import { identityFor, fixtureProviders } from './helpers';

async function verify(externalId: string, overrides: Partial<Parameters<typeof verifyWebsite>[0]> = {}) {
  const { raw, identity } = await identityFor(externalId);
  const { search, fetcher } = fixtureProviders();
  return verifyWebsite({
    identity,
    providerWebsite: raw.website,
    providerSocialUrls: raw.socialUrls,
    search,
    fetcher,
    minChannelsForNoWebsite: 2,
    ...overrides,
  });
}

describe('website verification — finding websites that are not in the profile', () => {
  it('finds a website through search when the business profile has none', async () => {
    // demo/1 has no website field, but barbier-seltersweg.de is findable and
    // carries the business phone number. This is the false-negative case the
    // whole product exists to prevent.
    const result = await verify('demo/1');
    expect(result.status).toBe('VERIFIED_WEBSITE');
    expect(result.acceptedUrl).toContain('barbier-seltersweg.de');
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it('accepts a site matched by address alone when the name also matches', async () => {
    const result = await verify('demo/11'); // Barbershop Kaiser — no phone on page
    expect(result.status).toBe('VERIFIED_WEBSITE');
    expect(result.acceptedUrl).toContain('kaiser-barber.de');
  });

  it('follows redirects and verifies the destination', async () => {
    const result = await verify('demo/13'); // cafemilano.de -> cafe-milano-frankfurt.de
    expect(result.status).toBe('VERIFIED_WEBSITE');
    expect(result.acceptedUrl).toContain('cafe-milano-frankfurt.de');
    const redirected = result.candidates.find((c) => c.url.includes('cafemilano.de'));
    expect(redirected?.signals.some((s) => s.key === 'redirect')).toBe(true);
  });

  it('handles a www-prefixed, protocol-less profile value', async () => {
    const result = await verify('demo/16'); // "www.fitnesspoint-ffm.de"
    expect(result.status).toBe('VERIFIED_WEBSITE');
  });
});

describe('website verification — never claiming "no website" without proof', () => {
  it('requires a manual check when the declared website is unreachable', async () => {
    // demo/15's server is down. A site that does not answer is not a site that
    // does not exist.
    const result = await verify('demo/15');
    expect(result.status).toBe('REQUIRES_MANUAL_CHECK');
    expect(result.summary).toMatch(/could not be reached/i);
  });

  it('requires a manual check when search is unavailable', async () => {
    const result = await verify('demo/2', { search: new NoWebSearchProvider() });
    expect(result.status).toBe('REQUIRES_MANUAL_CHECK');
    expect(result.channels.find((c) => c.channel === 'search_engine')?.status).toBe('unavailable');
  });

  it('requires a manual check when the declared domain is parked', async () => {
    const result = await verify('demo/5'); // muellerfriseur.de is parked
    expect(result.status).toBe('REQUIRES_MANUAL_CHECK');
    expect(result.candidates[0]?.decision).toBe('REJECTED');
    expect(result.candidates[0]?.decisionReason).toMatch(/parked/i);
  });

  it('never concludes "no website" when the identity is not confirmed', async () => {
    const result = await verify('demo/9'); // no phone number
    expect(result.status).not.toBe('VERIFIED_NO_WEBSITE');
    expect(['REQUIRES_MANUAL_CHECK', 'WEBSITE_UNCERTAIN', 'IDENTITY_UNVERIFIED']).toContain(result.status);
  });

  it('refuses to check a website at all when identity is unverified', async () => {
    const { raw, identity } = await identityFor('demo/2');
    const { search, fetcher } = fixtureProviders();
    const result = await verifyWebsite({
      identity: { ...identity, status: 'UNVERIFIED', confidence: 10 },
      providerWebsite: raw.website,
      search,
      fetcher,
    });
    expect(result.status).toBe('IDENTITY_UNVERIFIED');
    expect(result.candidates).toHaveLength(0);
  });
});

describe('social profile resolution (Facebook and Instagram)', () => {
  it('resolves a Facebook-only business to its real website through its link page', async () => {
    // demo/3 lists a Facebook page as its "website". The engine takes the
    // handle, searches for it, finds the business's own link-in-bio page,
    // follows it, and lands on the real site — with no human involved.
    const result = await verify('demo/3');
    expect(result.status).toBe('VERIFIED_WEBSITE');
    expect(result.acceptedUrl).toContain('cutandshave-giessen.de');

    const accepted = result.candidates.find((c) => c.domain === 'cutandshave-giessen.de');
    expect(accepted?.sourceChannel).toBe('social_profile');
    expect(accepted?.signals.some((s) => s.key === 'declared_link')).toBe(true);
    expect(result.evidence.some((e) => e.kind === 'link_in_bio')).toBe(true);
  });

  it('concludes "no website" automatically when a Facebook page leads nowhere', async () => {
    // demo/18 has a Facebook page and nothing behind it. This used to be a
    // manual check; the handle is now searched and turned into domains first.
    const result = await verify('demo/18');
    expect(result.status).toBe('VERIFIED_NO_WEBSITE');
    expect(result.confidence).toBeGreaterThanOrEqual(70);

    const social = result.channels.find((c) => c.channel === 'social_profile');
    expect(social?.status).toBe('ok');
    expect(social?.detail).toMatch(/facebook @rasierklinge\.giessen/i);
    expect(result.evidence.some((e) => e.kind === 'social_profile')).toBe(true);
  });

  it('rejects a domain that matches the handle but belongs to someone else', async () => {
    // nagelbarlisa.de exists — for a different salon in Hamburg.
    const result = await verify('demo/19');
    const impostor = result.candidates.find((c) => c.domain === 'nagelbarlisa.de');
    expect(impostor?.decision).toBe('REJECTED');
    expect(impostor?.signals.some((s) => s.key === 'phone_conflict')).toBe(true);
    expect(result.status).toBe('VERIFIED_NO_WEBSITE');
    expect(result.acceptedUrl).toBeNull();
  });

  it('requires a manual check when the business\u2019s own link page cannot be read', async () => {
    // demo/20 publishes a linktr.ee that is down. What it lists is unknown, so
    // the question stays open rather than resolving to "no website".
    const result = await verify('demo/20');
    expect(result.status).toBe('REQUIRES_MANUAL_CHECK');
    expect(result.channels.find((c) => c.channel === 'social_profile')?.status).toBe('error');
  });

  it('cannot resolve social profiles without a search provider, and says so', async () => {
    const result = await verify('demo/18', { search: new NoWebSearchProvider() });
    expect(result.status).toBe('REQUIRES_MANUAL_CHECK');
    const social = result.channels.find((c) => c.channel === 'social_profile');
    expect(social?.status).toBe('unavailable');
  });

  it('lowers confidence for a business whose profile nominates a social page', async () => {
    const declaredSocial = await verify('demo/18'); // Facebook as its "website"
    const plain = await verify('demo/2'); // no social presence at all
    expect(declaredSocial.status).toBe('VERIFIED_NO_WEBSITE');
    expect(plain.status).toBe('VERIFIED_NO_WEBSITE');
    expect(declaredSocial.confidence).toBeLessThan(plain.confidence);
  });

  it('never accepts a handle-derived domain without page-level proof', async () => {
    const result = await verify('demo/19');
    const derived = result.candidates.filter((c) => c.sourceChannel === 'social_profile');
    expect(derived.length).toBeGreaterThan(0);
    expect(derived.every((c) => c.decision !== 'ACCEPTED')).toBe(true);
  });
});

describe('website verification — not confusing similar businesses', () => {
  it('rejects a same-name domain that belongs to a different business', async () => {
    // "Da Vinci Pizzeria" must not inherit "Ristorante Da Vinci"'s website.
    const result = await verify('demo/8');
    const davinci = result.candidates.find((c) => c.domain === 'davinci-giessen.de');
    expect(davinci?.decision).toBe('REJECTED');
    expect(davinci?.signals.some((s) => s.key === 'phone_conflict')).toBe(true);
    expect(result.acceptedUrl).toBeNull();
  });

  it('concludes "no website" only after ruling out a same-name domain elsewhere', async () => {
    // Pizzeria Bella Napoli (Frankfurt) vs Bella Napoli (Offenbach).
    const result = await verify('demo/14');
    expect(result.status).toBe('VERIFIED_NO_WEBSITE');
    const rejected = result.candidates.find((c) => c.domain === 'bellanapoli-ffm.de');
    expect(rejected?.decision).toBe('REJECTED');
    expect(result.summary).toMatch(/ruled out/i);
  });

  it('verifies the business that actually owns the shared-name domain', async () => {
    const result = await verify('demo/17'); // Bella Napoli, Offenbach
    expect(result.status).toBe('VERIFIED_WEBSITE');
    expect(result.acceptedUrl).toContain('bellanapoli-ffm.de');
  });
});

describe('website verification — confirmed "no website"', () => {
  it('confirms no website when every channel ran and found nothing', async () => {
    const result = await verify('demo/2'); // Haarstudio Melek
    expect(result.status).toBe('VERIFIED_NO_WEBSITE');
    expect(result.confidence).toBeGreaterThanOrEqual(70);
    expect(result.evidence.some((e) => e.kind === 'conclusion')).toBe(true);
  });

  it('lowers confidence when a social profile exists', async () => {
    const withSocial = await verify('demo/12'); // Sultan Barber — Instagram found
    const withoutSocial = await verify('demo/2');
    expect(withSocial.status).toBe('VERIFIED_NO_WEBSITE');
    expect(withSocial.confidence).toBeLessThan(withoutSocial.confidence);
  });

  it('requires more channels than the configured minimum allows', async () => {
    const result = await verify('demo/2', { minChannelsForNoWebsite: 99 });
    expect(result.status).toBe('REQUIRES_MANUAL_CHECK');
  });

  it('records an evidence trail for every conclusion', async () => {
    const result = await verify('demo/2');
    expect(result.evidence.length).toBeGreaterThan(4);
    expect(result.evidence.some((e) => e.kind === 'identity')).toBe(true);
    expect(result.evidence.some((e) => e.kind.startsWith('channel_'))).toBe(true);
  });
});
