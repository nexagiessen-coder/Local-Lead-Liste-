import { getDb, many, one, run, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { ResearchRun, ResearchRunStats, ResearchRunStatus, RunItemOutcome } from '@/lib/types';

interface RunRow {
  id: string;
  created_by: string | null;
  query_text: string | null;
  location_label: string;
  center_lat: number | null;
  center_lon: number | null;
  radius_km: number;
  category: string | null;
  requested_count: number;
  provider: string;
  status: string;
  stats_json: string | null;
  error: string | null;
  started_at: number;
  finished_at: number | null;
}

function mapRun(row: RunRow): ResearchRun {
  return {
    id: row.id,
    createdBy: row.created_by,
    queryText: row.query_text,
    locationLabel: row.location_label,
    centerLat: row.center_lat,
    centerLon: row.center_lon,
    radiusKm: row.radius_km,
    category: row.category,
    requestedCount: row.requested_count,
    provider: row.provider,
    status: row.status as ResearchRunStatus,
    stats: row.stats_json ? (JSON.parse(row.stats_json) as ResearchRunStats) : null,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export const EMPTY_STATS: ResearchRunStats = {
  discovered: 0,
  newBusinesses: 0,
  duplicates: 0,
  refreshed: 0,
  needsReview: 0,
  excluded: 0,
  verified: 0,
  verificationFailures: 0,
  qualified: 0,
};

export async function createRun(
  input: {
    createdBy: string;
    queryText: string | null;
    locationLabel: string;
    centerLat: number | null;
    centerLon: number | null;
    radiusKm: number;
    category: string | null;
    requestedCount: number;
    provider: string;
  },
  db: Db = getDb(),
): Promise<string> {
  const id = newId('run');
  await run(
    db,
    `INSERT INTO research_runs
       (id, created_by, query_text, location_label, center_lat, center_lon, radius_km,
        category, requested_count, provider, status, stats_json, started_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'running',$11,$12)`,
    [
      id,
      input.createdBy,
      input.queryText,
      input.locationLabel,
      input.centerLat,
      input.centerLon,
      input.radiusKm,
      input.category,
      input.requestedCount,
      input.provider,
      JSON.stringify(EMPTY_STATS),
      Date.now(),
    ],
  );
  return id;
}

export async function updateRunLocation(
  runId: string,
  location: { label: string; lat: number | null; lon: number | null },
  db: Db = getDb(),
): Promise<void> {
  await run(db, 'UPDATE research_runs SET location_label = $1, center_lat = $2, center_lon = $3 WHERE id = $4', [
    location.label,
    location.lat,
    location.lon,
    runId,
  ]);
}

export async function updateRunStats(runId: string, stats: ResearchRunStats, db: Db = getDb()): Promise<void> {
  await run(db, 'UPDATE research_runs SET stats_json = $1 WHERE id = $2', [JSON.stringify(stats), runId]);
}

export async function finishRun(
  runId: string,
  status: ResearchRunStatus,
  stats: ResearchRunStats,
  error: string | null = null,
  db: Db = getDb(),
): Promise<void> {
  await run(
    db,
    'UPDATE research_runs SET status = $1, stats_json = $2, error = $3, finished_at = $4 WHERE id = $5',
    [status, JSON.stringify(stats), error, Date.now(), runId],
  );
}

export async function recordRunItem(
  input: { runId: string; businessId: string | null; rawName: string; outcome: RunItemOutcome; reason: string | null },
  db: Db = getDb(),
): Promise<void> {
  await run(
    db,
    `INSERT INTO research_run_items (id, run_id, business_id, raw_name, outcome, reason, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [newId('rit'), input.runId, input.businessId, input.rawName, input.outcome, input.reason, Date.now()],
  );
}

export async function getRun(runId: string, db: Db = getDb()): Promise<ResearchRun | null> {
  const row = await one<RunRow>(db, 'SELECT * FROM research_runs WHERE id = $1', [runId]);
  return row ? mapRun(row) : null;
}

export async function listRuns(limit = 20, db: Db = getDb()): Promise<ResearchRun[]> {
  const rows = await many<RunRow>(db, 'SELECT * FROM research_runs ORDER BY started_at DESC LIMIT $1', [limit]);
  return rows.map(mapRun);
}

export async function runItems(runId: string, db: Db = getDb()) {
  return many<{
    id: string;
    business_id: string | null;
    raw_name: string;
    outcome: string;
    reason: string | null;
    created_at: number;
    name: string | null;
    city: string | null;
    website_status: string | null;
    identity_status: string | null;
    phone_e164: string | null;
  }>(
    db,
    `SELECT i.id, i.business_id, i.raw_name, i.outcome, i.reason, i.created_at,
            b.name, b.city, b.website_status, b.identity_status, b.phone_e164
       FROM research_run_items i
       LEFT JOIN businesses b ON b.id = i.business_id
      WHERE i.run_id = $1 ORDER BY i.created_at`,
    [runId],
  );
}

/** Cached geocoding so the same location is never looked up twice. */
export async function getCachedGeocode(query: string, db: Db = getDb()): Promise<unknown | null> {
  const row = await one<{ result_json: string }>(db, 'SELECT result_json FROM geocode_cache WHERE query = $1', [
    query.toLowerCase(),
  ]);
  return row ? JSON.parse(row.result_json) : null;
}

export async function cacheGeocode(
  query: string,
  provider: string,
  result: unknown,
  db: Db = getDb(),
): Promise<void> {
  await run(
    db,
    `INSERT INTO geocode_cache (query, provider, result_json, created_at) VALUES ($1,$2,$3,$4)
     ON CONFLICT (query) DO UPDATE SET provider = EXCLUDED.provider, result_json = EXCLUDED.result_json, created_at = EXCLUDED.created_at`,
    [query.toLowerCase(), provider, JSON.stringify(result), Date.now()],
  );
}
