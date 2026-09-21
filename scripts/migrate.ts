/**
 * Applies any pending migrations and exits.
 *
 * The app also applies migrations automatically on its first query (see
 * `ensureMigrated()` in src/lib/db/index.ts), so this script is not required
 * to boot the app — it exists for deploy hooks and CI that want migrations
 * applied as an explicit, visible step rather than implicitly on first
 * request.
 */
import { getDb, runMigrations, closeDb } from '../src/lib/db/index.js';

async function main(): Promise<void> {
  const db = getDb();
  const applied = await runMigrations(db);
  if (applied.length > 0) {
    console.log(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
  } else {
    console.log('Database is already up to date.');
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
