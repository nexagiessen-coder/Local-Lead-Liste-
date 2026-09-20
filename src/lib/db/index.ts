import Database from 'better-sqlite3';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { env } from '@/lib/env';

export type Db = Database.Database;

let instance: Db | null = null;

const MIGRATIONS_DIR = resolve(process.cwd(), 'src/lib/db/migrations');

/** Opens (and, on first call, migrates) the SQLite database. */
export function getDb(): Db {
  if (instance) return instance;
  instance = openDatabase(resolve(process.cwd(), env.databasePath));
  runMigrations(instance);
  return instance;
}

export function openDatabase(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  return db;
}

/**
 * Applies any migration files that have not run yet, inside a transaction each.
 * Migrations are plain SQL files named `NNN_description.sql` and are applied in
 * filename order.
 */
export function runMigrations(db: Db, migrationsDir = MIGRATIONS_DIR): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => (r as { name: string }).name),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const run: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
    });
    apply();
    run.push(file);
  }
  return run;
}

/** Test/CLI helper: an isolated in-memory database with the full schema. */
export function createInMemoryDb(): Db {
  const db = openDatabase(':memory:');
  runMigrations(db);
  return db;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}
