/**
 * Creates the first administrator account from the environment, for headless
 * installs. Interactive installs can use the /setup page instead.
 *
 * Safe to re-run: it never overwrites an existing account.
 */
import { getDb, one, closeDb } from '../src/lib/db/index.js';
import { env } from '../src/lib/env.js';
import { createUser, getUserByEmail } from '../src/lib/repo/users.js';

async function main(): Promise<void> {
  const db = getDb();
  const row = await one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM users');
  const n = row?.n ?? 0;

  if (n > 0) {
    console.log(`Nothing to seed — ${n} user account(s) already exist.`);
    return;
  }
  if (!env.seedAdminPassword) {
    console.log(
      'No SEED_ADMIN_PASSWORD set. Skipping the admin account.\n' +
        'Open the app and use the first-run setup page instead, or set SEED_ADMIN_EMAIL and ' +
        'SEED_ADMIN_PASSWORD and run this again.',
    );
    return;
  }
  if (await getUserByEmail(env.seedAdminEmail, db)) {
    console.log(`A user with ${env.seedAdminEmail} already exists.`);
    return;
  }

  const user = await createUser(
    {
      email: env.seedAdminEmail,
      name: 'Administrator',
      password: env.seedAdminPassword,
      role: 'admin',
    },
    db,
  );
  console.log(`Created administrator ${user.email}. Change the password after the first sign-in.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
