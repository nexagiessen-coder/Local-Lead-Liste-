import { describe, it, expect } from 'vitest';
import { nameSimilarity, normalizeBusinessName, normalizeText, tokenCoverage, distinctiveTokens } from '@/lib/normalize/text';
import { comparePhones, extractPhoneNumbers, normalizePhone } from '@/lib/normalize/phone';
import { addressKey, normalizeStreet, splitStreetLine } from '@/lib/normalize/address';
import { distanceKm, isWithinRadius, boundingBox } from '@/lib/normalize/geo';
import { domainNameOverlap, isSocialHost, isSocialOrDirectoryHost, looksParked, registrableDomain } from '@/lib/normalize/domain';
import {
  extractDomainsFromText,
  handleDomainCandidates,
  isLinkInBioHost,
  parseSocialProfile,
} from '@/lib/normalize/social';

describe('text normalisation', () => {
  it('transliterates German characters consistently', () => {
    expect(normalizeText('Gießen')).toBe('giessen');
    expect(normalizeText('Müller & Söhne')).toBe('mueller und soehne');
  });

  it('strips legal forms from a business name', () => {
    expect(normalizeBusinessName('Elektro Schmidt GmbH')).toBe('elektro schmidt');
    expect(normalizeBusinessName('Barbier am Seltersweg GmbH')).toBe('barbier am seltersweg');
  });

  it('keeps the name when it consists only of a legal form', () => {
    expect(normalizeBusinessName('GmbH')).toBe('gmbh');
  });

  it('drops generic words from distinctive tokens', () => {
    expect(distinctiveTokens('Barbershop Kaiser')).toEqual(['kaiser']);
    expect(distinctiveTokens('Friseur Müller')).toEqual(['mueller']);
  });

  it('scores similar names highly and different names low', () => {
    expect(nameSimilarity('Barbier am Seltersweg', 'Barbier am Seltersweg GmbH')).toBeGreaterThan(0.85);
    expect(nameSimilarity('Friseur Müller', 'Friseur Mueller')).toBeGreaterThan(0.85);
    expect(nameSimilarity('Ristorante Da Vinci', 'Autohaus Nord')).toBeLessThan(0.3);
  });

  it('measures how much of a name appears in a page', () => {
    expect(tokenCoverage('Barbier am Seltersweg', 'Willkommen beim Barbier am Seltersweg in Gießen')).toBe(1);
    expect(tokenCoverage('Barbier am Seltersweg', 'Pizzeria Napoli Frankfurt')).toBe(0);
  });
});

describe('phone normalisation', () => {
  it('normalises national and international formats to the same E.164', () => {
    expect(normalizePhone('0641 1234501', 'DE')?.e164).toBe('+496411234501');
    expect(normalizePhone('+49 641 1234501', 'DE')?.e164).toBe('+496411234501');
    expect(normalizePhone('(0641) 123 45 01', 'DE')?.e164).toBe('+496411234501');
  });

  it('marks an unparseable number invalid rather than guessing', () => {
    const result = normalizePhone('123', 'DE');
    expect(result?.isValid).toBe(false);
    expect(result?.e164).toBeNull();
  });

  it('finds phone numbers in free text', () => {
    const found = extractPhoneNumbers('Rufen Sie uns an: 0641 1234501 oder 0641 1234502.', 'DE');
    expect(found).toContain('+496411234501');
    expect(found).toContain('+496411234502');
  });

  it('compares numbers without overclaiming', () => {
    expect(comparePhones('+496411234501', '+496411234501')).toBe('match');
    expect(comparePhones('+496411234501', '+496411234502')).toBe('mismatch');
    expect(comparePhones(null, '+496411234501')).toBe('unknown');
    // A main line and an extension are not a mismatch we can rely on.
    expect(comparePhones('+4964112345', '+496411234512')).toBe('unknown');
  });
});

describe('address normalisation', () => {
  it('collapses street spellings to one key', () => {
    expect(normalizeStreet('Bahnhofstraße')).toBe(normalizeStreet('Bahnhofstr.'));
    expect(normalizeStreet('Grünberger Straße')).toBe(normalizeStreet('Gruenberger Str.'));
  });

  it('splits a street line into name and number', () => {
    expect(splitStreetLine('Bahnhofstraße 44')).toEqual({ street: 'Bahnhofstraße', houseNumber: '44' });
    expect(splitStreetLine('12 Main Street')).toEqual({ street: 'Main Street', houseNumber: '12' });
    expect(splitStreetLine(null)).toEqual({ street: null, houseNumber: null });
  });

  it('refuses to build a key from an incomplete address', () => {
    expect(addressKey({ street: 'Bahnhofstraße', houseNumber: '44', postalCode: null, city: 'Gießen', countryCode: 'DE' })).toBeNull();
    expect(addressKey({ street: null, houseNumber: null, postalCode: '35390', city: 'Gießen', countryCode: 'DE' })).toBeNull();
  });
});

describe('geography', () => {
  it('measures distance between two cities', () => {
    const giessen = { lat: 50.5866, lon: 8.6742 };
    const frankfurt = { lat: 50.1109, lon: 8.6821 };
    expect(distanceKm(giessen, frankfurt)).toBeGreaterThan(50);
    expect(distanceKm(giessen, frankfurt)).toBeLessThan(56);
  });

  it('applies a radius', () => {
    const centre = { lat: 50.5866, lon: 8.6742 };
    expect(isWithinRadius(centre, { lat: 50.5872, lon: 8.6748 }, 1)).toBe(true);
    expect(isWithinRadius(centre, { lat: 50.1109, lon: 8.6821 }, 20)).toBe(false);
  });

  it('builds a bounding box that contains the radius', () => {
    const box = boundingBox({ lat: 50.5866, lon: 8.6742 }, 10);
    expect(box.maxLat).toBeGreaterThan(50.5866);
    expect(box.minLon).toBeLessThan(8.6742);
  });
});

describe('domain classification', () => {
  it('extracts the registrable domain', () => {
    expect(registrableDomain('https://www.barbier-seltersweg.de/kontakt')).toBe('barbier-seltersweg.de');
    // Multi-level public suffixes keep the registrable part, not the subdomain.
    expect(registrableDomain('https://shop.example.co.uk')).toBe('example.co.uk');
    expect(registrableDomain('https://shop.example.de')).toBe('example.de');
  });

  it('recognises social and directory hosts', () => {
    expect(isSocialHost('https://www.facebook.com/someshop')).toBe(true);
    expect(isSocialOrDirectoryHost('https://www.gelbeseiten.de/x')).toBe(true);
    expect(isSocialOrDirectoryHost('https://barbier-seltersweg.de')).toBe(false);
  });

  it('detects parked pages', () => {
    expect(looksParked('Diese Domain steht zum Verkauf')).toBe(true);
    expect(looksParked('Willkommen in unserem Salon')).toBe(false);
  });

  it('measures name overlap with a domain without treating it as proof', () => {
    expect(domainNameOverlap('kaiser-barber.de', 'Barbershop Kaiser')).toBeGreaterThan(0);
    expect(domainNameOverlap('autohaus-nord.de', 'Barbershop Kaiser')).toBe(0);
  });
});

describe('social profile parsing', () => {
  it('reads Facebook handles from the shapes Facebook uses', () => {
    expect(parseSocialProfile('https://www.facebook.com/cutandshavegiessen')).toMatchObject({
      platform: 'facebook',
      handle: 'cutandshavegiessen',
    });
    expect(parseSocialProfile('https://m.facebook.com/rasierklinge.giessen/')).toMatchObject({
      platform: 'facebook',
      handle: 'rasierklinge.giessen',
    });
    expect(parseSocialProfile('https://fb.com/SomeShop')).toMatchObject({ handle: 'someshop' });
  });

  it('reads Instagram handles, including the @ form', () => {
    expect(parseSocialProfile('https://www.instagram.com/nagelbarlisa')).toMatchObject({
      platform: 'instagram',
      handle: 'nagelbarlisa',
    });
    expect(parseSocialProfile('https://instagram.com/@studiofoenix')).toMatchObject({ handle: 'studiofoenix' });
  });

  it('does not mistake a post or a numeric id for a handle', () => {
    expect(parseSocialProfile('https://www.instagram.com/p/Cabc123/')?.handle).toBeNull();
    expect(parseSocialProfile('https://www.facebook.com/profile.php?id=123456')?.handle).toBeNull();
    expect(parseSocialProfile('https://www.facebook.com/123456789')?.handle).toBeNull();
  });

  it('returns null for anything that is not a social profile', () => {
    expect(parseSocialProfile('https://barbier-seltersweg.de')).toBeNull();
    expect(parseSocialProfile('not a url')).toBeNull();
  });

  it('derives domain candidates from a handle', () => {
    const candidates = handleDomainCandidates('rasierklinge.giessen');
    expect(candidates).toContain('https://rasierklingegiessen.de');
    expect(candidates).toContain('https://rasierklinge-giessen.de');
    expect(candidates.every((c) => c.startsWith('https://'))).toBe(true);
  });

  it('refuses to derive anything from a handle that is too short', () => {
    expect(handleDomainCandidates('ab')).toEqual([]);
  });

  it('recognises link-in-bio hosts, which are meant to be followed', () => {
    expect(isLinkInBioHost('https://linktr.ee/somebody')).toBe(true);
    expect(isLinkInBioHost('https://beacons.ai/somebody')).toBe(true);
    expect(isLinkInBioHost('https://www.facebook.com/somebody')).toBe(false);
    expect(isLinkInBioHost('https://barbier-seltersweg.de')).toBe(false);
  });

  it('pulls domains out of a search result snippet', () => {
    const domains = extractDomainsFromText('Cut & Shave Gießen · Website: www.cutandshave-giessen.de · Ludwigsplatz 3');
    expect(domains).toContain('cutandshave-giessen.de');
  });

  it('does not mistake a file name for a domain', () => {
    expect(extractDomainsFromText('See our menu at speisekarte.pdf')).toEqual([]);
  });
});
