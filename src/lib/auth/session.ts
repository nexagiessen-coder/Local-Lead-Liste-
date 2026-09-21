import { createHash } from 'node:crypto';
import { getDb, one, run, type Db } from '@/lib/db';
import { randomToken } from '@/lib/ids';
import { DAY } from '@/lib/time';
import type { User, UserRole } from '@/lib/types';

export const SESSION_COOKIE = 'lll_session';
export const SESSION_TTL_MS = 14 * DAY;
/** Sessions are refreshed (expiry extended) at most once per hour. */
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

/** Sessions are stored hashed, so a database leak cannot be replayed. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: number;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

export interface CreatedSession {
  token: string;
  expiresAt: number;
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
  db: Db = getDb(),
): Promise<CreatedSession> {
  const token = randomToken(32);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  await run(
    db,
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [hashSessionToken(token), userId, now, expiresAt, now, meta.userAgent ?? null, meta.ip ?? null],
  );
  await run(db, 'UPDATE users SET last_login_at = $1 WHERE id = $2', [now, userId]);
  return { token, expiresAt };
}

/** Resolves a session token to an active user, refreshing the session lazily. */
export async function resolveSession(
  token: string | undefined | null,
  db: Db = getDb(),
): Promise<User | null> {
  if (!token) return null;
  const id = hashSessionToken(token);
  const row = await one<UserRow & { expires_at: number; last_seen_at: number }>(
    db,
    `SELECT s.expires_at AS expires_at, s.last_seen_at AS last_seen_at,
            u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.updated_at, u.last_login_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1`,
    [id],
  );

  if (!row) return null;
  const now = Date.now();
  if (row.expires_at <= now) {
    await run(db, 'DELETE FROM sessions WHERE id = $1', [id]);
    return null;
  }
  if (row.is_active !== 1) return null;

  if (now - row.last_seen_at > REFRESH_INTERVAL_MS) {
    await run(db, 'UPDATE sessions SET last_seen_at = $1, expires_at = $2 WHERE id = $3', [
      now,
      now + SESSION_TTL_MS,
      id,
    ]);
  }
  return mapUser(row);
}

export async function destroySession(token: string | undefined | null, db: Db = getDb()): Promise<void> {
  if (!token) return;
  await run(db, 'DELETE FROM sessions WHERE id = $1', [hashSessionToken(token)]);
}

export async function destroyAllSessionsForUser(userId: string, db: Db = getDb()): Promise<void> {
  await run(db, 'DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export async function purgeExpiredSessions(db: Db = getDb()): Promise<number> {
  return run(db, 'DELETE FROM sessions WHERE expires_at <= $1', [Date.now()]);
}
