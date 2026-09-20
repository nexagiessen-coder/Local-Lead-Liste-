/**
 * Auth constants that are safe to import from client components.
 * Kept separate from `password.ts`, which pulls in `node:crypto`.
 */
export const MIN_PASSWORD_LENGTH = 12;
