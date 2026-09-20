import { getDb } from '../src/lib/db/index.js';

const db = getDb();
const version = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number };
console.log(`Database ready — ${version.n} migration(s) applied.`);
db.close();
