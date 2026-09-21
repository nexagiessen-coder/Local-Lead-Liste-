import { getDb, one, type Db } from '@/lib/db';

/** 'YYYY-MM' in UTC — the natural monthly cycle most provider free tiers reset on. */
function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

export interface UsageCheck {
  allowed: boolean;
  count: number;
  limit: number;
}

/**
 * Atomically records one use of `provider` for the current calendar month and
 * reports whether it stayed within `limit`.
 *
 * Safe under concurrent calls: the increment is a single `INSERT ... ON
 * CONFLICT` statement, so two verifications running at once can never both
 * slip through past the cap. A call that trips the cap is itself counted
 * (so the stored count can briefly read `limit + 1`), but it returns
 * `allowed: false` before the caller ever spends real provider quota on it —
 * the underlying API is never called for that request.
 */
export async function consumeMonthlyUsage(
  provider: string,
  limit: number,
  db: Db = getDb(),
): Promise<UsageCheck> {
  const period = currentPeriod();
  const row = await one<{ count: number }>(
    db,
    `INSERT INTO provider_usage (provider, period, count, updated_at)
     VALUES ($1, $2, 1, $3)
     ON CONFLICT (provider, period) DO UPDATE SET count = provider_usage.count + 1, updated_at = $3
     RETURNING count`,
    [provider, period, Date.now()],
  );
  const count = row?.count ?? 0;
  return { allowed: count <= limit, count, limit };
}

/** Current month's usage without incrementing it — for display (e.g. Settings). */
export async function currentMonthlyUsage(provider: string, db: Db = getDb()): Promise<number> {
  const row = await one<{ count: number }>(
    db,
    'SELECT count FROM provider_usage WHERE provider = $1 AND period = $2',
    [provider, currentPeriod()],
  );
  return row?.count ?? 0;
}
