import { getDb } from '@/lib/db';
import { newId } from '@/lib/ids';

export interface AuditEntry {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  detail?: Record<string, unknown>;
}

/** Records who did what, when. Called for every state-changing operation. */
export function recordAudit(entry: AuditEntry): void {
  getDb()
    .prepare(
      `INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, detail_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId('aud'),
      entry.userId,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.detail ? JSON.stringify(entry.detail) : null,
      Date.now(),
    );
}

export interface AuditRow {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: number;
}

export function recentActivity(limit = 25): AuditRow[] {
  const rows = getDb()
    .prepare(
      `SELECT a.id, a.user_id, u.name AS user_name, a.action, a.entity_type, a.entity_id,
              a.detail_json, a.created_at
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.created_at DESC
        LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    user_id: string | null;
    user_name: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    detail_json: string | null;
    created_at: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    detail: r.detail_json ? (JSON.parse(r.detail_json) as Record<string, unknown>) : null,
    createdAt: r.created_at,
  }));
}
