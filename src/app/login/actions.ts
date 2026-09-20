'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, destroySession, SESSION_COOKIE } from '@/lib/auth/session';
import { sessionCookieOptions } from '@/lib/auth/current-user';
import { rateLimit } from '@/lib/auth/rate-limit';
import { getUserByEmail } from '@/lib/repo/users';
import { recordAudit } from '@/lib/repo/audit';

export interface LoginState {
  error: string | null;
}

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Enter your email address and password.' };
  }

  const headerList = await headers();
  const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';

  // Rate limit per IP and per account, so neither can be hammered.
  const ipLimit = rateLimit(`login:ip:${ip}`, MAX_ATTEMPTS * 3, WINDOW_MS);
  const userLimit = rateLimit(`login:user:${email}`, MAX_ATTEMPTS, WINDOW_MS);
  if (!ipLimit.allowed || !userLimit.allowed) {
    const retryMinutes = Math.ceil(Math.max(ipLimit.retryAfterMs, userLimit.retryAfterMs) / 60_000);
    return { error: `Too many sign-in attempts. Try again in ${retryMinutes} minute(s).` };
  }

  const user = getUserByEmail(email);
  // Always run a hash comparison so a missing account is not detectable by timing.
  const valid = user
    ? await verifyPassword(password, { hash: user.passwordHash, salt: user.passwordSalt })
    : await verifyPassword(password, { hash: 'x'.repeat(88), salt: 'y'.repeat(24) });

  if (!user || !valid || !user.isActive) {
    recordAudit({ userId: user?.id ?? null, action: 'login.failed', entityType: 'user', entityId: user?.id ?? null, detail: { email } });
    return { error: 'That email and password combination did not work.' };
  }

  const session = createSession(user.id, { userAgent: headerList.get('user-agent'), ip });
  const store = await cookies();
  store.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
  recordAudit({ userId: user.id, action: 'login.success', entityType: 'user', entityId: user.id });

  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  destroySession(token);
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
