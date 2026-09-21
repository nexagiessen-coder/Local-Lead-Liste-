import { Pool, types, type QueryResultRow } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { env } from '@/lib/env';

/**
 * node-postgres (`pg`) returns BIGINT (Postgres OID 20) as a string by
 * default, because a BIGINT can exceed Number.MAX_SAFE_INTEGER in general.
 * Every timestamp in this app is an epoch-millisecond BIGINT, which never
 * gets remotely close to that limit, and the whole codebase does arithmetic
 * and comparisons on timestamps as plain numbers — so this is set globally,
 * once, before any query runs.
 */
types.setTypeParser(20, (value: string) => Number.parseInt(value, 10));

/**
 * A `pg` Pool (or, in tests, `pg-mem`'s pg-compatible adapter — see
 * `tests/helpers.ts`). Every repo function takes this as an optional last
 * argument, exactly as the previous SQLite version took a `Database` handle,
 * so tests can pass an isolated instance.
 */
export type Db = Pool;

let instance: Db | null = null;

/**
 * Migration state, keyed by pool instance rather than a single module-level
 * flag, so tests can run several isolated pools (one pg-mem instance per
 * test) in the same process without racing each other's migrations.
 */
const migratedByPool = new WeakMap<object, Promise<string[]>>();

const MIGRATIONS_DIR = resolve(process.cwd(), 'src/lib/db/migrations');

/**
 * A `pg` `Pool` exposes `.connect()`; a checked-out `PoolClient` (what a
 * transaction's callback receives) does not. This tells `ensureMigrated`
 * apart from a transaction client, whose pool was already migrated before
 * the transaction began — trying to migrate through the client would fail
 * outright, since it has no `.connect()` of its own.
 */
function isPool(db: Db): boolean {
  return typeof (db as unknown as { connect?: unknown }).connect === 'function';
}

/** Returns the shared connection pool, creating it on first call. */
export function getDb(): Db {
  if (instance) return instance;
  if (!env.databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Set it to a Postgres connection string from ' +
        'Supabase → Settings → Database → Connection string.',
    );
  }
  instance = openDatabase(env.databaseUrl);
  return instance;
}

export function openDatabase(connectionString: string): Db {
  return new Pool({
    connectionString,
    // A single long-running process (Passenger worker, container, VM) with a
    // small, bounded pool — not a fleet of serverless functions each opening
    // their own connection — so a modest cap is the right shape.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: connectionString.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
  });
}

/**
 * Applies any migration files that have not run yet, in filename order, each
 * inside its own transaction. Migrations are plain PostgreSQL files named
 * `NNN_description.sql`.
 *
 * Idempotent and safe to call on every process start: cached per pool after
 * the first successful run, so concurrent early requests during startup
 * don't race to apply the same migration twice.
 */
export async function ensureMigrated(db: Db = getDb()): Promise<void> {
  if (!isPool(db)) return;
  let migrated = migratedByPool.get(db);
  if (!migrated) {
    migrated = runMigrations(db).catch((error: unknown) => {
      // A failed migration must not be cached as "done" — the next call
      // should retry rather than silently proceeding against a half-applied
      // schema.
      migratedByPool.delete(db);
      throw error;
    });
    migratedByPool.set(db, migrated);
  }
  await migrated;
}

export async function runMigrations(db: Db, migrationsDir = MIGRATIONS_DIR): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at BIGINT NOT NULL
  )`);

  const appliedResult = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(appliedResult.rows.map((r) => r.name));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const run: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name, applied_at) VALUES ($1, $2)', [
        file,
        Date.now(),
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    run.push(file);
  }
  return run;
}

/** Closes the shared connection pool. Used by scripts that exit after one task. */
export async function closeDb(): Promise<void> {
  if (instance) {
    migratedByPool.delete(instance);
    await instance.end();
    instance = null;
  }
}

// --- Small query helpers, used throughout src/lib/repo/* -------------------
//
// `pg` returns column values already shaped as snake_case plain objects,
// matching the convention this codebase already used with better-sqlite3, so
// the repo layer's mapping functions (mapBusiness, mapUser, …) are unchanged.

/**
 * Every query goes through one of these three helpers, which is also where
 * pending migrations are applied against the given pool — so the schema is
 * guaranteed current before the very first real query of a fresh process (or
 * a fresh test database), with no separate "run migrations" step required at
 * startup. When `db` is a transaction client rather than a pool, this is a
 * no-op: its pool was already migrated by `transaction()` before the client
 * was checked out.
 */

/** Runs a query and returns the first row, or null if there were none. */
export async function one<T extends QueryResultRow>(
  db: Db,
  text: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  await ensureMigrated(db);
  const result = await db.query<T>(text, params as unknown[]);
  return result.rows[0] ?? null;
}

/** Runs a query and returns every row. */
export async function many<T extends QueryResultRow>(
  db: Db,
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  await ensureMigrated(db);
  const result = await db.query<T>(text, params as unknown[]);
  return result.rows;
}

/** Runs a query for its side effect; returns the number of rows affected. */
export async function run(db: Db, text: string, params: readonly unknown[] = []): Promise<number> {
  await ensureMigrated(db);
  const result = await db.query(text, params as unknown[]);
  return result.rowCount ?? 0;
}

/** Runs several statements as one transaction. */
export async function transaction<T>(db: Db, work: (client: Db) => Promise<T>): Promise<T> {
  await ensureMigrated(db);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // The pg PoolClient exposes the same `.query()` shape as Pool, so it can
    // be passed anywhere a `Db` is expected within the transaction.
    const result = await work(client as unknown as Db);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
