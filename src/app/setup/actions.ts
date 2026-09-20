'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { createUser } from '@/lib/repo/users';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { sessionCookieOptions } from '@/lib/auth/current-user';
import { recordAudit } from '@/lib/repo/audit';

export interface SetupState {
  error: string | null;
}

/**
 * First-run setup. Only possible while the database has no users at all, so it
 * cannot be used to add an admin to a running installation.
 */
export async function setupAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (row.n > 0) return { error: 'Setup has already been completed. Sign in instead.' };

  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (!name) return { error: 'Enter your name.' };
  if (password !== confirm) return { error: 'The two passwords do not match.' };

  try {
    const user = await createUser({ name, email, password, role: 'admin' });
    const headerList = await headers();
    const session = createSession(user.id, {
      userAgent: headerList.get('user-agent'),
      ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local',
    });
    const store = await cookies();
    store.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    recordAudit({ userId: user.id, action: 'setup.completed', entityType: 'user', entityId: user.id });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Setup failed.' };
  }

  redirect('/dashboard');
}
