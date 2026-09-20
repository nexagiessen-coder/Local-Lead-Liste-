import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, resolveSession } from './session';
import { env, usesSecureCookies } from '@/lib/env';
import type { User } from '@/lib/types';

/** The signed-in user for the current request, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
}

/** Server-component guard: redirects to /login when not signed in. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/dashboard');
  return user;
}

export function sessionCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: usesSecureCookies,
    path: '/',
    expires: new Date(expiresAt),
  };
}

/**
 * CSRF defence for mutating requests: the Origin (or Referer) must match the
 * configured app URL. Combined with SameSite=Lax cookies this blocks
 * cross-site form posts.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get('origin');
  const referer = h.get('referer');
  const expected = new URL(env.appUrl).origin;

  const candidate = origin ?? (referer ? safeOrigin(referer) : null);
  if (candidate === null) {
    // Same-origin fetches from the app always send Origin; a missing one on a
    // mutating request is rejected rather than trusted.
    throw new CsrfError('Missing Origin header on a state-changing request.');
  }
  const host = h.get('host');
  const hostOrigin = host ? `${usesSecureCookies ? 'https' : 'http'}://${host}` : null;
  if (candidate !== expected && candidate !== hostOrigin) {
    throw new CsrfError('Cross-origin request rejected.');
  }
}

export class CsrfError extends Error {}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Best-effort client IP for rate limiting. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? 'unknown';
}
