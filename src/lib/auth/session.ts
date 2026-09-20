import { createHash } from 'node:crypto';
import { getDb } from '@/lib/db';
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

export function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): CreatedSession {
  const db = getDb();
  const token = randomToken(32);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  db.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(hashSessionToken(token), userId, now, expiresAt, now, meta.userAgent ?? null, meta.ip ?? null);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, userId);
  return { token, expiresAt };
}

/** Resolves a session token to an active user, refreshing the session lazily. */
export function resolveSession(token: string | undefined | null): User | null {
  if (!token) return null;
  const db = getDb();
  const id = hashSessionToken(token);
  const row = db
    .prepare(
      `SELECT s.expires_at AS expires_at, s.last_seen_at AS last_seen_at,
              u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.updated_at, u.last_login_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .get(id) as (UserRow & { expires_at: number; last_seen_at: number }) | undefined;

  if (!row) return null;
  const now = Date.now();
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return null;
  }
  if (row.is_active !== 1) return null;

  if (now - row.last_seen_at > REFRESH_INTERVAL_MS) {
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(
      now,
      now + SESSION_TTL_MS,
      id,
    );
  }
  return mapUser(row);
}

export function destroySession(token: string | undefined | null): void {
  if (!token) return;
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(hashSessionToken(token));
}

export function destroyAllSessionsForUser(userId: string): void {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function purgeExpiredSessions(): number {
  const result = getDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  return result.changes;
}
