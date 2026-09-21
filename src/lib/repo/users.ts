import { getDb, many, one, run, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { hashPassword, checkPasswordPolicy } from '@/lib/auth/password';
import { mapUser } from '@/lib/auth/session';
import type { User, UserRole } from '@/lib/types';

/** The product is specified for a small team; the cap is enforced in code. */
export const MAX_ACTIVE_USERS = 4;

export async function listUsers(includeInactive = true, db: Db = getDb()): Promise<User[]> {
  const rows = await many<Parameters<typeof mapUser>[0]>(
    db,
    `SELECT id, email, name, role, is_active, created_at, updated_at, last_login_at
       FROM users ${includeInactive ? '' : 'WHERE is_active = 1'}
      ORDER BY LOWER(name)`,
  );
  return rows.map(mapUser);
}

export async function countActiveUsers(db: Db = getDb()): Promise<number> {
  const row = await one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM users WHERE is_active = 1');
  return row?.n ?? 0;
}

export async function getUserById(id: string, db: Db = getDb()): Promise<User | null> {
  const row = await one<Parameters<typeof mapUser>[0]>(
    db,
    `SELECT id, email, name, role, is_active, created_at, updated_at, last_login_at
       FROM users WHERE id = $1`,
    [id],
  );
  return row ? mapUser(row) : null;
}

export async function getUserByEmail(
  email: string,
  db: Db = getDb(),
): Promise<(User & { passwordHash: string; passwordSalt: string }) | null> {
  const row = await one<Parameters<typeof mapUser>[0] & { password_hash: string; password_salt: string }>(
    db,
    `SELECT id, email, name, role, is_active, created_at, updated_at, last_login_at,
            password_hash, password_salt
       FROM users WHERE email = $1`,
    [email.trim().toLowerCase()],
  );
  if (!row) return null;
  return { ...mapUser(row), passwordHash: row.password_hash, passwordSalt: row.password_salt };
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

export async function createUser(input: CreateUserInput, db: Db = getDb()): Promise<User> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid email address is required.');
  }
  const policy = checkPasswordPolicy(input.password);
  if (!policy.ok) throw new Error(policy.problems.join(' '));
  if (await getUserByEmail(email, db)) throw new Error('A user with this email already exists.');
  if ((await countActiveUsers(db)) >= MAX_ACTIVE_USERS) {
    throw new Error(
      `This installation is limited to ${MAX_ACTIVE_USERS} active users. Deactivate a user first.`,
    );
  }

  const { hash, salt } = await hashPassword(input.password);
  const now = Date.now();
  const id = newId('usr');
  await run(
    db,
    `INSERT INTO users (id, email, name, role, password_hash, password_salt, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8)`,
    [id, email, input.name.trim(), input.role, hash, salt, now, now],
  );

  const created = await getUserById(id, db);
  if (!created) throw new Error('User creation failed.');
  return created;
}

export async function setUserPassword(userId: string, password: string, db: Db = getDb()): Promise<void> {
  const policy = checkPasswordPolicy(password);
  if (!policy.ok) throw new Error(policy.problems.join(' '));
  const { hash, salt } = await hashPassword(password);
  await run(db, 'UPDATE users SET password_hash = $1, password_salt = $2, updated_at = $3 WHERE id = $4', [
    hash,
    salt,
    Date.now(),
    userId,
  ]);
}

export async function setUserActive(userId: string, isActive: boolean, db: Db = getDb()): Promise<void> {
  if (isActive && (await countActiveUsers(db)) >= MAX_ACTIVE_USERS) {
    throw new Error(`This installation is limited to ${MAX_ACTIVE_USERS} active users.`);
  }
  await run(db, 'UPDATE users SET is_active = $1, updated_at = $2 WHERE id = $3', [
    isActive ? 1 : 0,
    Date.now(),
    userId,
  ]);
}

export async function updateUserProfile(
  userId: string,
  name: string,
  role: UserRole,
  db: Db = getDb(),
): Promise<void> {
  await run(db, 'UPDATE users SET name = $1, role = $2, updated_at = $3 WHERE id = $4', [
    name.trim(),
    role,
    Date.now(),
    userId,
  ]);
}
