import { randomUUID, randomBytes } from 'node:crypto';

/** Prefixed, sortable-enough identifiers that are readable in logs and URLs. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
