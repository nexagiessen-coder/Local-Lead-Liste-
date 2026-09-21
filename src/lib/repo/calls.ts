import { getDb, many, one, run, transaction, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { DAY } from '@/lib/time';
import type { CallAttempt } from '@/lib/types';

/**
 * Call tracking.
 *
 * Recording a call never removes or hides a lead. The lead stays exactly where
 * it was; only its counters and status move, so the caller always knows which
 * business they just dialled.
 */

export interface RecordCallInput {
  leadId: string;
  businessId: string;
  userId: string;
  phoneE164: string | null;
}

export async function startCall(input: RecordCallInput, db: Db = getDb()): Promise<CallAttempt> {
  const now = Date.now();
  const id = newId('call');

  await transaction(db, async (tx) => {
    await run(
      tx,
      `INSERT INTO call_attempts (id, lead_id, business_id, user_id, phone_e164, started_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, input.leadId, input.businessId, input.userId, input.phoneE164, now, now, now],
    );
    await run(
      tx,
      `UPDATE leads
          SET call_count = call_count + 1, last_call_at = $1, last_call_by = $2, updated_at = $3
        WHERE id = $4`,
      [now, input.userId, now, input.leadId],
    );
  });

  const created = await getCall(id, db);
  if (!created) throw new Error('Call could not be recorded.');
  return created;
}

export interface CallOutcomeInput {
  callId: string;
  outcome: string;
  note: string | null;
  callbackAt: number | null;
  durationSeconds: number | null;
}

export async function recordCallOutcome(input: CallOutcomeInput, db: Db = getDb()): Promise<void> {
  const now = Date.now();
  const call = await getCall(input.callId, db);
  if (!call) throw new Error('Call attempt not found.');

  await transaction(db, async (tx) => {
    await run(
      tx,
      `UPDATE call_attempts
          SET outcome = $1, note = $2, callback_at = $3, duration_seconds = $4, updated_at = $5
        WHERE id = $6`,
      [input.outcome, input.note, input.callbackAt, input.durationSeconds, now, input.callId],
    );
    if (input.callbackAt !== null) {
      await run(tx, 'UPDATE leads SET next_callback_at = $1, updated_at = $2 WHERE id = $3', [
        input.callbackAt,
        now,
        call.leadId,
      ]);
    }
  });
}

interface CallRow {
  id: string;
  lead_id: string;
  business_id: string;
  user_id: string;
  phone_e164: string | null;
  started_at: number;
  outcome: string | null;
  note: string | null;
  callback_at: number | null;
  duration_seconds: number | null;
  created_at: number;
  updated_at: number;
}

function mapCall(row: CallRow): CallAttempt {
  return {
    id: row.id,
    leadId: row.lead_id,
    businessId: row.business_id,
    userId: row.user_id,
    phoneE164: row.phone_e164,
    startedAt: row.started_at,
    outcome: row.outcome,
    note: row.note,
    callbackAt: row.callback_at,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getCall(id: string, db: Db = getDb()): Promise<CallAttempt | null> {
  const row = await one<CallRow>(db, 'SELECT * FROM call_attempts WHERE id = $1', [id]);
  return row ? mapCall(row) : null;
}

export interface CallHistoryEntry extends CallAttempt {
  userName: string | null;
}

export async function callHistory(businessId: string, db: Db = getDb()): Promise<CallHistoryEntry[]> {
  const rows = await many<CallRow & { user_name: string | null }>(
    db,
    `SELECT c.*, u.name AS user_name
       FROM call_attempts c
       LEFT JOIN users u ON u.id = c.user_id
      WHERE c.business_id = $1
      ORDER BY c.started_at DESC`,
    [businessId],
  );
  return rows.map((r) => ({ ...mapCall(r), userName: r.user_name }));
}

export async function callsSince(since: number, db: Db = getDb()): Promise<number> {
  const row = await one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM call_attempts WHERE started_at >= $1', [
    since,
  ]);
  return row?.n ?? 0;
}

export interface TeamActivityRow {
  userId: string;
  userName: string;
  callsToday: number;
  callsWeek: number;
  leadsAssigned: number;
}

export async function teamActivity(db: Db = getDb()): Promise<TeamActivityRow[]> {
  const dayAgo = Date.now() - DAY;
  const weekAgo = Date.now() - 7 * DAY;
  const rows = await many<{
    user_id: string;
    user_name: string;
    calls_today: number;
    calls_week: number;
    leads_assigned: number;
  }>(
    db,
    `WITH call_stats AS (
       SELECT user_id,
              COUNT(CASE WHEN started_at >= $1 THEN 1 END) AS calls_today,
              COUNT(CASE WHEN started_at >= $2 THEN 1 END) AS calls_week
       FROM call_attempts
       GROUP BY user_id
     ), lead_stats AS (
       SELECT assigned_user_id AS user_id, COUNT(*) AS leads_assigned
       FROM leads
       WHERE assigned_user_id IS NOT NULL
       GROUP BY assigned_user_id
     )
     SELECT u.id AS user_id, u.name AS user_name,
            COALESCE(cs.calls_today, 0) AS calls_today,
            COALESCE(cs.calls_week, 0) AS calls_week,
            COALESCE(ls.leads_assigned, 0) AS leads_assigned
       FROM users u
       LEFT JOIN call_stats cs ON cs.user_id = u.id
       LEFT JOIN lead_stats ls ON ls.user_id = u.id
      WHERE u.is_active = 1
      ORDER BY LOWER(u.name)`,
    [dayAgo, weekAgo],
  );
  return rows.map((r) => ({
    userId: r.user_id,
    userName: r.user_name,
    callsToday: r.calls_today,
    callsWeek: r.calls_week,
    leadsAssigned: r.leads_assigned,
  }));
}
