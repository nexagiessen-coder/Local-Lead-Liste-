import type { Database } from 'better-sqlite3';
import { getDb } from '@/lib/db';
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

export function createRun(
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
  db: Database = getDb(),
): string {
  const id = newId('run');
  db.prepare(
    `INSERT INTO research_runs
       (id, created_by, query_text, location_label, center_lat, center_lon, radius_km,
        category, requested_count, provider, status, stats_json, started_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,'running',?,?)`,
  ).run(
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
  );
  return id;
}

export function updateRunLocation(
  runId: string,
  location: { label: string; lat: number | null; lon: number | null },
  db: Database = getDb(),
): void {
  db.prepare('UPDATE research_runs SET location_label = ?, center_lat = ?, center_lon = ? WHERE id = ?').run(
    location.label,
    location.lat,
    location.lon,
    runId,
  );
}

export function updateRunStats(runId: string, stats: ResearchRunStats, db: Database = getDb()): void {
  db.prepare('UPDATE research_runs SET stats_json = ? WHERE id = ?').run(JSON.stringify(stats), runId);
}

export function finishRun(
  runId: string,
  status: ResearchRunStatus,
  stats: ResearchRunStats,
  error: string | null = null,
  db: Database = getDb(),
): void {
  db.prepare('UPDATE research_runs SET status = ?, stats_json = ?, error = ?, finished_at = ? WHERE id = ?').run(
    status,
    JSON.stringify(stats),
    error,
    Date.now(),
    runId,
  );
}

export function recordRunItem(
  input: { runId: string; businessId: string | null; rawName: string; outcome: RunItemOutcome; reason: string | null },
  db: Database = getDb(),
): void {
  db.prepare(
    `INSERT INTO research_run_items (id, run_id, business_id, raw_name, outcome, reason, created_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(newId('rit'), input.runId, input.businessId, input.rawName, input.outcome, input.reason, Date.now());
}

export function getRun(runId: string, db: Database = getDb()): ResearchRun | null {
  const row = db.prepare('SELECT * FROM research_runs WHERE id = ?').get(runId) as RunRow | undefined;
  return row ? mapRun(row) : null;
}

export function listRuns(limit = 20, db: Database = getDb()): ResearchRun[] {
  const rows = db
    .prepare('SELECT * FROM research_runs ORDER BY started_at DESC LIMIT ?')
    .all(limit) as RunRow[];
  return rows.map(mapRun);
}

export function runItems(runId: string, db: Database = getDb()) {
  return db
    .prepare(
      `SELECT i.id, i.business_id, i.raw_name, i.outcome, i.reason, i.created_at,
              b.name, b.city, b.website_status, b.identity_status, b.phone_e164
         FROM research_run_items i
         LEFT JOIN businesses b ON b.id = i.business_id
        WHERE i.run_id = ? ORDER BY i.created_at`,
    )
    .all(runId) as Array<{
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
  }>;
}

/** Cached geocoding so the same location is never looked up twice. */
export function getCachedGeocode(query: string, db: Database = getDb()): unknown | null {
  const row = db.prepare('SELECT result_json FROM geocode_cache WHERE query = ?').get(query.toLowerCase()) as
    | { result_json: string }
    | undefined;
  return row ? JSON.parse(row.result_json) : null;
}

export function cacheGeocode(query: string, provider: string, result: unknown, db: Database = getDb()): void {
  db.prepare(
    `INSERT INTO geocode_cache (query, provider, result_json, created_at) VALUES (?,?,?,?)
     ON CONFLICT (query) DO UPDATE SET provider = excluded.provider, result_json = excluded.result_json, created_at = excluded.created_at`,
  ).run(query.toLowerCase(), provider, JSON.stringify(result), Date.now());
}
