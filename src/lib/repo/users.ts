import { getDb } from '@/lib/db';
import { newId } from '@/lib/ids';
import { hashPassword, checkPasswordPolicy } from '@/lib/auth/password';
import { mapUser } from '@/lib/auth/session';
import type { User, UserRole } from '@/lib/types';

/** The product is specified for a small team; the cap is enforced in code. */
export const MAX_ACTIVE_USERS = 4;

export function listUsers(includeInactive = true): User[] {
  const rows = getDb()
    .prepare(
      `SELECT id, email, name, role, is_active, created_at, updated_at, last_login_at
         FROM users ${includeInactive ? '' : 'WHERE is_active = 1'}
        ORDER BY name COLLATE NOCASE`,
    )
    .all() as Parameters<typeof mapUser>[0][];
  return rows.map(mapUser);
}

export function countActiveUsers(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM users WHERE is_active = 1').get() as {
    n: number;
  };
  return row.n;
}

export function getUserById(id: string): User | null {
  const row = getDb()
    .prepare(
      `SELECT id, email, name, role, is_active, created_at, updated_at, last_login_at
         FROM users WHERE id = ?`,
    )
    .get(id) as Parameters<typeof mapUser>[0] | undefined;
  return row ? mapUser(row) : null;
}

export function getUserByEmail(email: string): (User & { passwordHash: string; passwordSalt: string }) | null {
  const row = getDb()
    .prepare(
      `SELECT id, email, name, role, is_active, created_at, updated_at, last_login_at,
              password_hash, password_salt
         FROM users WHERE email = ?`,
    )
    .get(email.trim().toLowerCase()) as
    | (Parameters<typeof mapUser>[0] & { password_hash: string; password_salt: string })
    | undefined;
  if (!row) return null;
  return { ...mapUser(row), passwordHash: row.password_hash, passwordSalt: row.password_salt };
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid email address is required.');
  }
  const policy = checkPasswordPolicy(input.password);
  if (!policy.ok) throw new Error(policy.problems.join(' '));
  if (getUserByEmail(email)) throw new Error('A user with this email already exists.');
  if (countActiveUsers() >= MAX_ACTIVE_USERS) {
    throw new Error(
      `This installation is limited to ${MAX_ACTIVE_USERS} active users. Deactivate a user first.`,
    );
  }

  const { hash, salt } = await hashPassword(input.password);
  const now = Date.now();
  const id = newId('usr');
  getDb()
    .prepare(
      `INSERT INTO users (id, email, name, role, password_hash, password_salt, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(id, email, input.name.trim(), input.role, hash, salt, now, now);

  const created = getUserById(id);
  if (!created) throw new Error('User creation failed.');
  return created;
}

export async function setUserPassword(userId: string, password: string): Promise<void> {
  const policy = checkPasswordPolicy(password);
  if (!policy.ok) throw new Error(policy.problems.join(' '));
  const { hash, salt } = await hashPassword(password);
  getDb()
    .prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?')
    .run(hash, salt, Date.now(), userId);
}

export function setUserActive(userId: string, isActive: boolean): void {
  if (isActive && countActiveUsers() >= MAX_ACTIVE_USERS) {
    throw new Error(`This installation is limited to ${MAX_ACTIVE_USERS} active users.`);
  }
  getDb()
    .prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?')
    .run(isActive ? 1 : 0, Date.now(), userId);
}

export function updateUserProfile(userId: string, name: string, role: UserRole): void {
  getDb()
    .prepare('UPDATE users SET name = ?, role = ?, updated_at = ? WHERE id = ?')
    .run(name.trim(), role, Date.now(), userId);
}
