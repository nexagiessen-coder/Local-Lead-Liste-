import { describe, it, expect, beforeEach } from 'vitest';
import { checkPasswordPolicy, hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import { hashSessionToken } from '@/lib/auth/session';
import { rateLimit, resetRateLimit } from '@/lib/auth/rate-limit';
import { randomToken } from '@/lib/ids';

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const record = await hashPassword('CorrectHorse12');
    expect(await verifyPassword('CorrectHorse12', record)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const record = await hashPassword('CorrectHorse12');
    expect(await verifyPassword('correcthorse12', record)).toBe(false);
    expect(await verifyPassword('', record)).toBe(false);
  });

  it('uses a fresh salt for every password', async () => {
    const a = await hashPassword('CorrectHorse12');
    const b = await hashPassword('CorrectHorse12');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('never throws on a malformed stored record', async () => {
    expect(await verifyPassword('anything', { hash: 'not-base64!!', salt: '??' })).toBe(false);
  });

  it('enforces the password policy', () => {
    expect(checkPasswordPolicy('short1').ok).toBe(false);
    expect(checkPasswordPolicy('alllettersnodigit').ok).toBe(false);
    expect(checkPasswordPolicy('1234567890123').ok).toBe(false);
    expect(checkPasswordPolicy('CorrectHorse12').ok).toBe(true);
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(12);
  });
});

describe('sessions', () => {
  it('stores tokens only as hashes', () => {
    const token = randomToken(32);
    const hashed = hashSessionToken(token);
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toContain(token);
    expect(hashSessionToken(token)).toBe(hashed);
  });

  it('generates unguessable tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => randomToken(32)));
    expect(tokens.size).toBe(200);
    expect([...tokens][0]!.length).toBeGreaterThanOrEqual(43);
  });
});

describe('rate limiting', () => {
  beforeEach(() => resetRateLimit());

  it('allows requests up to the limit and then blocks', () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit('key', 3, 60_000).allowed).toBe(true);
    }
    const blocked = rateLimit('key', 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('tracks keys independently', () => {
    rateLimit('a', 1, 60_000);
    expect(rateLimit('a', 1, 60_000).allowed).toBe(false);
    expect(rateLimit('b', 1, 60_000).allowed).toBe(true);
  });

  it('resets after the window', async () => {
    rateLimit('window', 1, 20);
    expect(rateLimit('window', 1, 20).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(rateLimit('window', 1, 20).allowed).toBe(true);
  });
});
