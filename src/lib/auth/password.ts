import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { MIN_PASSWORD_LENGTH } from './constants';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** scrypt parameters. N=16384 keeps hashing ~100ms on a small server. */
const PARAMS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;

export { MIN_PASSWORD_LENGTH } from './constants';

export interface PasswordRecord {
  hash: string;
  salt: string;
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS);
  return { hash: derived.toString('base64'), salt: salt.toString('base64') };
}

/** Constant-time password check. Never short-circuits on length. */
export async function verifyPassword(
  password: string,
  record: PasswordRecord,
): Promise<boolean> {
  try {
    const salt = Buffer.from(record.salt, 'base64');
    const expected = Buffer.from(record.hash, 'base64');
    if (expected.length !== KEY_LENGTH) return false;
    const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export interface PasswordPolicyResult {
  ok: boolean;
  problems: string[];
}

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const problems: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
  if (!/[a-zA-Z]/.test(password)) problems.push('Password must contain a letter.');
  if (!/[0-9]/.test(password)) problems.push('Password must contain a digit.');
  return { ok: problems.length === 0, problems };
}
