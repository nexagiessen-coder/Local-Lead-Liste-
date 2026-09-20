import type { Database } from 'better-sqlite3';
import { getDb } from '@/lib/db';
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

export function startCall(input: RecordCallInput, db: Database = getDb()): CallAttempt {
  const now = Date.now();
  const id = newId('call');

  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO call_attempts (id, lead_id, business_id, user_id, phone_e164, started_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(id, input.leadId, input.businessId, input.userId, input.phoneE164, now, now, now);
    db.prepare(
      `UPDATE leads
          SET call_count = call_count + 1, last_call_at = ?, last_call_by = ?, updated_at = ?
        WHERE id = ?`,
    ).run(now, input.userId, now, input.leadId);
  });
  write();

  const created = getCall(id, db);
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

export function recordCallOutcome(input: CallOutcomeInput, db: Database = getDb()): void {
  const now = Date.now();
  const call = getCall(input.callId, db);
  if (!call) throw new Error('Call attempt not found.');

  const write = db.transaction(() => {
    db.prepare(
      `UPDATE call_attempts
          SET outcome = ?, note = ?, callback_at = ?, duration_seconds = ?, updated_at = ?
        WHERE id = ?`,
    ).run(input.outcome, input.note, input.callbackAt, input.durationSeconds, now, input.callId);
    if (input.callbackAt !== null) {
      db.prepare('UPDATE leads SET next_callback_at = ?, updated_at = ? WHERE id = ?').run(
        input.callbackAt,
        now,
        call.leadId,
      );
    }
  });
  write();
}

export function getCall(id: string, db: Database = getDb()): CallAttempt | null {
  const row = db.prepare('SELECT * FROM call_attempts WHERE id = ?').get(id) as
    | {
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
    | undefined;
  if (!row) return null;
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

export interface CallHistoryEntry extends CallAttempt {
  userName: string | null;
}

export function callHistory(businessId: string, db: Database = getDb()): CallHistoryEntry[] {
  const rows = db
    .prepare(
      `SELECT c.*, u.name AS user_name
         FROM call_attempts c
         LEFT JOIN users u ON u.id = c.user_id
        WHERE c.business_id = ?
        ORDER BY c.started_at DESC`,
    )
    .all(businessId) as Array<Record<string, never>>;
  return rows.map((row) => {
    const r = row as unknown as {
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
      user_name: string | null;
    };
    return {
      id: r.id,
      leadId: r.lead_id,
      businessId: r.business_id,
      userId: r.user_id,
      phoneE164: r.phone_e164,
      startedAt: r.started_at,
      outcome: r.outcome,
      note: r.note,
      callbackAt: r.callback_at,
      durationSeconds: r.duration_seconds,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      userName: r.user_name,
    };
  });
}

export function callsSince(since: number, db: Database = getDb()): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM call_attempts WHERE started_at >= ?').get(since) as {
    n: number;
  };
  return row.n;
}

export interface TeamActivityRow {
  userId: string;
  userName: string;
  callsToday: number;
  callsWeek: number;
  leadsAssigned: number;
}

export function teamActivity(db: Database = getDb()): TeamActivityRow[] {
  const dayAgo = Date.now() - DAY;
  const weekAgo = Date.now() - 7 * DAY;
  const rows = db
    .prepare(
      `SELECT u.id AS user_id, u.name AS user_name,
              (SELECT COUNT(*) FROM call_attempts c WHERE c.user_id = u.id AND c.started_at >= ?) AS calls_today,
              (SELECT COUNT(*) FROM call_attempts c WHERE c.user_id = u.id AND c.started_at >= ?) AS calls_week,
              (SELECT COUNT(*) FROM leads l WHERE l.assigned_user_id = u.id) AS leads_assigned
         FROM users u WHERE u.is_active = 1 ORDER BY u.name COLLATE NOCASE`,
    )
    .all(dayAgo, weekAgo) as Array<{
    user_id: string;
    user_name: string;
    calls_today: number;
    calls_week: number;
    leads_assigned: number;
  }>;
  return rows.map((r) => ({
    userId: r.user_id,
    userName: r.user_name,
    callsToday: r.calls_today,
    callsWeek: r.calls_week,
    leadsAssigned: r.leads_assigned,
  }));
}
